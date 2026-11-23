/* Read-only access to a Google Sheet through the user's own Google Cloud OAuth client (desktop flow + PKCE).
   Nothing is sent anywhere except to Google; the refresh token stays in the plugin's data.json. */
import { requestUrl } from 'obsidian';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export class GoogleError extends Error {
  constructor(public code: string, public detail: string) { super(code + ': ' + detail); }
}

export interface GoogleCreds { clientId: string; clientSecret: string; refreshToken: string }

export function extractFileId(input: string): string {
  const s = (input || '').trim();
  const m = /\/d\/([a-zA-Z0-9_-]{15,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{15,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{15,}$/.test(s) ? s : '';
}

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; u.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const rand = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

const form = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

async function tokenCall(body: Record<string, string>): Promise<any> {
  let r;
  try { r = await requestUrl({ url: TOKEN, method: 'POST', contentType: 'application/x-www-form-urlencoded', body: form(body), throw: false }); }
  catch (e: any) { throw new GoogleError('net', String(e?.message ?? e)); }
  const j = r.json ?? {};
  if (r.status >= 400 || j.error) {
    const code = j.error === 'invalid_grant' ? 'auth' : 'oauth';
    throw new GoogleError(code, String(j.error_description || j.error || r.status));
  }
  return j;
}

/** Interactive sign-in: opens the browser, waits for the redirect on a loopback port, returns the refresh token. */
export async function connect(clientId: string, clientSecret: string, openUrl: (u: string) => void): Promise<string> {
  const req = (window as any).require;
  if (!req) throw new GoogleError('desktop', 'Desktop Obsidian required');
  const http = req('http');
  const verifier = rand(48), state = rand(16);
  const challenge = await pkceChallenge(verifier);

  const { code, redirect } = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
    let done = false;
    let port = 0;
    const server = http.createServer((rq: any, rs: any) => {
      const u = new URL(rq.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { rs.writeHead(404); rs.end(); return; }
      const err = u.searchParams.get('error');
      const ok = !err && u.searchParams.get('state') === state && !!u.searchParams.get('code');
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end('<!doctype html><meta charset="utf-8"><title>Tally</title><body style="font:16px system-ui;padding:48px;text-align:center">' +
        (ok ? 'Tally è collegato a Google. Puoi chiudere questa scheda e tornare su Obsidian.<br><br>Tally is connected. You can close this tab.' : 'Collegamento non riuscito / Connection failed.') + '</body>');
      if (done) return;
      done = true; clearTimeout(timer); server.close();
      if (ok) resolve({ code: u.searchParams.get('code')!, redirect: 'http://127.0.0.1:' + port });
      else reject(new GoogleError('oauth', err || 'state mismatch'));
    });
    const timer = setTimeout(() => { if (!done) { done = true; server.close(); reject(new GoogleError('timeout', '')); } }, 180000);
    server.on('error', (e: any) => { if (!done) { done = true; clearTimeout(timer); reject(new GoogleError('oauth', String(e?.message ?? e))); } });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      openUrl(AUTH + '?' + form({
        client_id: clientId, redirect_uri: 'http://127.0.0.1:' + port, response_type: 'code', scope: SCOPE,
        code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent'
      }));
    });
  });

  const j = await tokenCall({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' });
  if (!j.refresh_token) throw new GoogleError('oauth', 'no refresh token');
  return j.refresh_token;
}

let cached: { key: string; token: string; exp: number } | null = null;
async function accessToken(c: GoogleCreds): Promise<string> {
  const key = c.clientId + '|' + c.refreshToken;
  if (cached && cached.key === key && cached.exp > Date.now() + 60000) return cached.token;
  const j = await tokenCall({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' });
  cached = { key, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export interface Remote { name: string; modified: number; buf: ArrayBuffer }

export async function fetchSheet(c: GoogleCreds, fileId: string, known?: number): Promise<Remote | { name: string; modified: number; buf: null }> {
  if (!c.refreshToken) throw new GoogleError('notconnected', '');
  const auth = { Authorization: 'Bearer ' + await accessToken(c) };
  const call = async (url: string) => {
    let r;
    try { r = await requestUrl({ url, headers: auth, throw: false }); } catch (e: any) { throw new GoogleError('net', String(e?.message ?? e)); }
    if (r.status === 401) { cached = null; throw new GoogleError('auth', ''); }
    if (r.status === 403 || r.status === 404) throw new GoogleError('access', String(r.json?.error?.message || r.status));
    if (r.status >= 400) throw new GoogleError('net', String(r.json?.error?.message || r.status));
    return r;
  };
  const meta = (await call(DRIVE + encodeURIComponent(fileId) + '?fields=name,mimeType,modifiedTime&supportsAllDrives=true')).json;
  const modified = Date.parse(meta.modifiedTime) || 0;
  if (known && modified && known === modified) return { name: meta.name, modified, buf: null };
  const url = meta.mimeType === GSHEET_MIME
    ? DRIVE + encodeURIComponent(fileId) + '/export?mimeType=' + encodeURIComponent(XLSX_MIME)
    : DRIVE + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true';
  const r = await call(url);
  return { name: meta.name, modified, buf: r.arrayBuffer };
}

import { connect, extractFileId, pkceChallenge, fetchSheet } from '../src/google';
const calls: any[] = [];
(globalThis as any).__req = async (o: any) => { calls.push(o); return (globalThis as any).__handler(o); };
(async () => {
  console.log('id1', extractFileId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG/edit?usp=drivesdk'));
  console.log('id2', extractFileId('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG'), JSON.stringify(extractFileId('abc')));
  // RFC 7636 test vector
  console.log('pkce', await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  (globalThis as any).__handler = async (o: any) => {
    if (o.url.includes('oauth2.googleapis.com')) return { status: 200, json: { refresh_token: 'RT', access_token: 'AT', expires_in: 3600 } };
    if (o.url.includes('fields=')) return { status: 200, json: { name: 'Money Tools 2026', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-22T19:02:08.175Z' } };
    if (o.url.includes('/export')) return { status: 200, arrayBuffer: new ArrayBuffer(8) };
    return { status: 404, json: {} };
  };
  let authUrl = '';
  const rt = await connect('CID', 'SEC', async (u: string) => {
    authUrl = u; const x = new URL(u);
    const redirect = x.searchParams.get('redirect_uri')!, st = x.searchParams.get('state')!;
    setTimeout(async () => { const r = await fetch(redirect + '/?code=XYZ&state=' + st); console.log('browser page ok', r.status); }, 50);
  });
  const x = new URL(authUrl);
  console.log('refresh', rt, x.searchParams.get('scope'), x.searchParams.get('code_challenge_method'), x.searchParams.get('access_type'));
  const tokenCall = calls.find(c => c.url.includes('oauth2.googleapis.com'));
  console.log('token body has verifier+redirect:', /code_verifier=/.test(tokenCall.body) && /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A\d+/.test(tokenCall.body));
  const r: any = await fetchSheet({ clientId: 'CID', clientSecret: 'SEC', refreshToken: 'RT' }, 'IDIDIDIDIDIDIDIDID');
  console.log('fetch', r.name, r.buf.byteLength, 'auth hdr', calls[calls.length - 1].headers.Authorization, calls[calls.length-1].url.includes('/export?mimeType='));
  const u: any = await fetchSheet({ clientId: 'CID', clientSecret: 'SEC', refreshToken: 'RT' }, 'IDIDIDIDIDIDIDIDID', r.modified);
  console.log('unchanged ->', u.buf);
  // wrong state is rejected
  const bad = await connect('CID', 'SEC', async (uu: string) => { const y = new URL(uu); setTimeout(() => fetch(y.searchParams.get('redirect_uri') + '/?code=XYZ&state=WRONG'), 50); }).then(() => 'accepted', e => 'rejected ' + e.code);
  console.log('wrong state:', bad);
})();

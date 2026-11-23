import type { Data } from './parser';
import type { T } from './i18n';
import { DEFAULT_PREFS, applyLook, openPrefsDialog, type Prefs } from './prefs';

export interface DashState {
  data: Data | null;
  error: { code: string; detail: string } | null;
  loading: boolean;
  mtime: number;
  fileName: string;
}
export interface DashCtx {
  t: T;
  debug?: (s: string) => void;
  locale: string;
  oneOff: string; // "Primary/Secondary"
  getState: () => DashState;
  onChange: (fn: () => void) => () => void;
  reload: () => void;
  openSettings: () => void;
  plan?: { get: () => any; set: (v: any) => void };
  prefs?: { get: () => Prefs; set: (p: Partial<Prefs>) => void; reset: () => void; onChange: (fn: () => void) => () => void };
  lang?: 'it' | 'en';
  tab?: string;
}

const TABS = ['overview', 'spending', 'income', 'wealth', 'invest', 'home', 'payments'] as const;
const GROUPS = [
  { id: 'casa', prim: ['Housing'], c: '--s1' },
  { id: 'fuori', prim: ['Out'], c: '--s2' },
  { id: 'spesa', prim: ['Groceries'], c: '--s3' },
  { id: 'trasp', prim: ['Transport'], c: '--s4' },
  { id: 'viaggi', prim: ['Travel'], c: '--s5' },
  { id: 'altre', prim: ['OtherExpenses', 'Fees'], c: '--s6' },
  { id: 'persona', prim: ['Health', 'Gifts', 'Clothing'], c: '--s7' }
];
const IGROUPS: [string, string][] = [['Dipendente', '--s1'], ['P.IVA', '--s2'], ['NASpI', '--s3'], ['Altro', '--s4']];

export function mountDashboard(root: HTMLElement, ctx: DashCtx): () => void {
  const t = ctx.t, locale = ctx.locale;
  const doc = root.ownerDocument;
  const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  const q = (s: string) => root.querySelector(s) as HTMLElement | null;
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const lastIdx = (a: any[]) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; };

  /* ----- formatting ----- */
  let P: Prefs = ctx.prefs ? ctx.prefs.get() : DEFAULT_PREFS;
  let EUR: Intl.NumberFormat, EUR2: Intl.NumberFormat;
  const buildFmt = () => {
    const cur: any = P.currency === 'none' ? { style: 'decimal' } : { style: 'currency', currency: P.currency };
    EUR = new Intl.NumberFormat(locale, { ...cur, minimumFractionDigits: P.decimals ? 2 : 0, maximumFractionDigits: P.decimals ? 2 : 0 });
    EUR2 = new Intl.NumberFormat(locale, { ...cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  buildFmt();
  const NUM1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const mfFmt = new Intl.DateTimeFormat(locale, { month: 'long' }), msFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const MFULL = Array.from({ length: 12 }, (_, m) => cap(mfFmt.format(new Date(2000, m, 15))));
  const MONTHS = Array.from({ length: 12 }, (_, m) => cap(msFmt.format(new Date(2000, m, 15)).replace(/\.$/, '')));
  const eur = (n: number) => EUR.format(P.decimals ? (n || 0) : Math.round(n || 0));
  const eur2 = (n: number) => EUR2.format(n || 0);
  const short = (n: number) => { const a = Math.abs(n); const s = a >= 1e6 ? NUM1.format(a / 1e6) + 'M' : a >= 1000 ? NUM1.format(a / 1000) + 'k' : String(Math.round(a)); return (n < 0 ? '−' : '') + s; };
  const sgn = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + eur(Math.abs(n));
  const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return P.dateFmt === 'ymd' ? y + '-' + m + '-' + d : P.dateFmt === 'mdy' ? m + '/' + d + '/' + y.slice(2) : d + '/' + m + '/' + y.slice(2); };
  const mLow = (s: string) => locale.startsWith('it') ? s.toLowerCase() : s;

  /* ----- state ----- */
  let D: Data;
  let EX: any[] = [], OV: Record<string, (number | null)[]> = {}, LI = -1, NM = 1, LMI = 1, YEAR = new Date().getFullYear();
  const lastTab = (() => { try { return window.localStorage.getItem('tally-tab') || ''; } catch { return ''; } })();
  const startTab = (() => { const c = ctx.tab && P.tabs.includes(ctx.tab) ? ctx.tab : P.defaultTab === 'last' ? lastTab : P.defaultTab; return P.tabs.includes(c) ? c : P.tabs[0]; })();
  const S: any = { tab: startTab, from: 1, to: 12, autoTo: true, oneOff: P.oneOffDefault, extra: false, amex: false, sel: null, q: '', sort: 'amt', shown: P.pageSize, table: P.defView === 't', cg: [] as string[], sub: '', wpos: [] as string[], ivH: [] as string[], min: '', max: '', ig: [] as string[], iy0: null, iy1: null, wsec: [] as string[], wz: P.zeroDefault, wcmp: P.cmpDefault, pInit: false, fOpen: false, mOpen: false, hide: P.hideDefault || (() => { try { return window.localStorage.getItem('tally-hide') === '1'; } catch { return false; } })(), ivA: '', ivB: '' };
  const [ooP, ooS] = ctx.oneOff.split('/');
  const isOne = (e: any) => !!ooP && e.p === ooP && (!ooS || e.s === ooS);
  const P2G: Record<string, string> = {}; GROUPS.forEach(g => g.prim.forEach(p => P2G[p] = g.id));
  const gLabel = (id: string) => t('g.' + id);
  const subL = (s: string) => t.has('sub.' + s) ? t('sub.' + s) : s;
  const incMonth = (y: number, m: number) => IGROUPS.reduce((s, g) => s + ((D.income[g[0]] || {})[y + '-' + String(m).padStart(2, '0')] || 0), 0);
  const sec = (frag: string) => D.sections.find(s => s.name.toLowerCase().includes(frag));
  const secSeries = (frag: string) => {
    const s = sec(frag); if (!s || !s.rows.length) return null;
    return Array.from({ length: 13 }, (_, i) => { const v = s.rows.map(r => OV[r]?.[i]).filter(x => x != null) as number[]; return v.length ? sum(v) : null; });
  };
  const secLast = (frag: string) => { const s = sec(frag); return s ? sum(s.rows.map(r => { const a = OV[r] || []; const i = lastIdx(a); return i >= 0 ? (a[i] as number) : 0; })) : 0; };
  const ovMonths = () => [MONTHS[11] + ' ' + String(YEAR - 1).slice(2), ...MONTHS];

  function prepare(d: Data) {
    D = d; YEAR = d.year;
    EX = d.expenses.map(r => ({ m: r[0], d: r[1], n: r[2], v: r[3], p: r[4], s: r[5], x: r[6], a: r[7] }));
    OV = d.overview; LI = lastIdx(OV['Somma'] || []);
    NM = Math.max(1, ...EX.map(e => e.m));
    LMI = 1; for (let m = 1; m <= 12; m++) if (incMonth(YEAR, m) > 0) LMI = m;
    if (S.autoTo || S.to > NM) S.to = NM;
    if (!S.pInit) { S.pInit = true; S.from = defFrom(); }
    if (S.from > S.to) S.from = 1;
    if (S.sel && S.sel > NM) S.sel = null;
  }
  const defFrom = () => P.period === 'month' ? NM : P.period === 'last3' ? Math.max(1, NM - 2) : P.period === 'last6' ? Math.max(1, NM - 5) : 1;
  const monthPartial = () => { const n = new Date(); return n.getFullYear() === YEAR && n.getMonth() + 1 === NM; };
  const completeMonths = () => Math.max(1, monthPartial() ? NM - 1 : NM);
  const flt = (e: any) => !(S.oneOff && isOne(e)) && (!S.extra || e.x) && (!S.amex || e.a)
    && !S.cg.includes(P2G[e.p] || 'altre') && (!S.sub || e.s === S.sub)
    && (S.min === '' || e.v >= +S.min) && (S.max === '' || e.v <= +S.max);
  const inPeriod = (m: number) => m >= S.from && m <= S.to;
  const filtered = () => EX.filter(e => inPeriod(e.m) && flt(e));
  const hasFilter = () => {
    const per = !(S.from === defFrom() && S.autoTo);
    switch (S.tab) {
      case 'spending': return per || !!(S.cg.length || S.sub || S.min !== '' || S.max !== '' || S.extra || S.amex);
      case 'overview': case 'home': return per;
      case 'wealth': return per || S.wsec.length > 0 || S.wpos.length > 0 || S.wz;
      case 'income': return S.ig.length > 0 || S.iy0 != null || S.iy1 != null;
      case 'invest': return !!(S.ivH.length || S.ivA || S.ivB);
    }
    return false;
  };
  const resetFilters = () => {
    S.from = defFrom(); S.autoTo = true; S.to = NM; S.sel = null; S.shown = P.pageSize;
    if (S.tab === 'spending') { S.cg = []; S.sub = ''; S.min = ''; S.max = ''; S.extra = false; S.amex = false; S.q = ''; }
    if (S.tab === 'wealth') { S.wsec = []; S.wpos = []; S.wz = false; }
    if (S.tab === 'income') { S.ig = []; S.iy0 = null; S.iy1 = null; }
    if (S.tab === 'invest') { S.ivH = []; S.ivA = ''; S.ivB = ''; }
  };
  const incYears = () => { const ys: number[] = []; Object.values(D.income).forEach(o => Object.keys(o).forEach(k => ys.push(+k.slice(0, 4)))); const a = Math.min(...ys, YEAR), r: number[] = []; for (let y = a; y <= YEAR; y++) r.push(y); return r; };
  const planOv = (): { start?: number; items?: Record<string, number> } => (ctx.plan?.get() || {});
  const igVisible = () => IGROUPS.filter(g => !S.ig.includes(g[0]));
  const byMonthGroup = (list: any[]) => { const o: Record<string, number[]> = {}; GROUPS.forEach(g => o[g.id] = Array(12).fill(0)); list.forEach(e => { o[P2G[e.p] || 'altre'][e.m - 1] += e.v; }); return o; };

  /* ----- tooltip ----- */
  const tip = doc.createElement('div'); tip.className = 'tally-tip'; tip.hidden = true; doc.body.appendChild(tip);
  const showTip = (html: string, cx: number, cy: number) => { tip.innerHTML = html; tip.hidden = false; const r = tip.getBoundingClientRect(); let x = cx + 14, y = cy + 14; if (x + r.width > innerWidth - 8) x = cx - r.width - 14; if (y + r.height > innerHeight - 8) y = cy - r.height - 14; tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px'; };
  const hideTip = () => { tip.hidden = true; };
  const trow = (c: string, l: string, v: string) => `<div class="tr"><span><i class="sw" style="background:var(${c})"></i>${esc(l)}</span><em>${v}</em></div>`;

  /* ----- charts ----- */
  const niceMax = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; const n = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => f <= x)!; return n * p; };
  function barChart(box: HTMLElement, o: any) {
    const dv = !!o.diverge;
    const w = Math.max(box.clientWidth, 260), h = Math.round((o.height || 250) * P.chartScale / 100), m = { l: 48, r: 6, t: dv ? 18 : 10, b: dv ? 40 : 26 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b, n = o.labels.length, st = o.stacked !== false;
    const tot = o.labels.map((_: any, i: number) => o.series.reduce((s: number, x: any) => s + (x.values[i] || 0), 0));
    const mv = niceMax(st ? Math.max(...tot, 1) : Math.max(...o.series.flatMap((s: any) => s.values.map((v: number) => v || 0)), 1));
    const hi = dv ? niceMax(Math.max(...(o.series[0].values as number[]).map(v => v || 0), 1)) : mv, lo = dv ? niceMax(Math.max(...(o.series[1].values as number[]).map(v => v || 0), 1)) : 0;
    const y = (v: number) => m.t + ph - ((v + lo) / (hi + lo)) * ph, band = pw / n;
    const bw = st ? Math.min(band * .66, 46) : Math.min(band * .82 / o.series.length, 28);
    let g = '';
    const ticks = dv ? [-lo, -lo / 2, 0, hi / 2, hi] : [0, 1, 2, 3, 4].map(k => mv * k / 4);
    ticks.forEach(tv => { g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(tv)}" y2="${y(tv)}" stroke="var(--ty-grid)"/><text class="ax" x="${m.l - 6}" y="${y(tv) + 3.5}" text-anchor="end">${tv < 0 ? '−' : ''}${short(Math.abs(tv))}</text>`; });
    const step = Math.max(1, Math.ceil(n * (o.labelW || 30) / pw));
    o.labels.forEach((l: string, i: number) => { if (i % step === 0) g += `<text class="ax" x="${m.l + band * (i + .5)}" y="${h - 8}" text-anchor="middle">${esc(l)}</text>`; });
    if (o.selected != null && o.selected >= 0) g += `<rect x="${m.l + band * o.selected}" y="${m.t}" width="${band}" height="${ph}" fill="var(--ty-hl)"/>`;
    g += `<rect id="hb" x="0" y="${m.t}" width="${band}" height="${ph}" fill="var(--ty-hl)" opacity="0"/>`;
    o.labels.forEach((_: any, i: number) => {
      const cx = m.l + band * (i + .5);
      if (dv) {
        const up = o.series[0].values[i] || 0, dn = o.series[1].values[i] || 0;
        if (up > 0) { g += `<rect x="${cx - bw / 2}" y="${y(up)}" width="${bw}" height="${Math.max(y(0) - y(up), 1)}" rx="3" fill="var(${o.series[0].c})"/>`; if (band >= 30) g += `<text class="ax" x="${cx}" y="${y(up) - 4}" text-anchor="middle">+${short(up)}</text>`; }
        if (dn > 0) { g += `<rect x="${cx - bw / 2}" y="${y(0)}" width="${bw}" height="${Math.max(y(-dn) - y(0), 1)}" rx="3" fill="var(${o.series[1].c})"/>`; if (band >= 30) g += `<text class="ax" x="${cx}" y="${y(-dn) + 12}" text-anchor="middle">−${short(dn)}</text>`; }
      } else if (st) { let cum = 0; o.series.forEach((s: any) => { const v = s.values[i] || 0; if (v <= 0) return; const y0 = y(cum), y1 = y(cum + v); g += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(y0 - y1, 0.5)}" rx="2" fill="var(${s.c})" stroke="var(--ty-card)" stroke-width="1.5"/>`; cum += v; }); }
      else o.series.forEach((s: any, k: number) => { const v = s.values[i] || 0; if (v <= 0) return; const x0 = cx - bw * o.series.length / 2 + k * bw; g += `<rect x="${x0}" y="${y(v)}" width="${bw - 2}" height="${y(0) - y(v)}" rx="2" fill="var(${s.c})"/>`; });
    });
    g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ty-line)"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
    const svg = box.firstChild as SVGSVGElement, hb = svg.querySelector('#hb') as SVGRectElement;
    const idx = (e: PointerEvent) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * (w / r.width) - m.l; return Math.min(n - 1, Math.max(0, Math.floor(x / band))); };
    svg.addEventListener('pointermove', e => {
      const i = idx(e); hb.setAttribute('x', String(m.l + band * i)); hb.setAttribute('opacity', '1');
      let html = `<b>${esc(o.labels[i])}</b>`;
      const rows = o.series.map((s: any) => [s, s.values[i] || 0]).filter((r: any) => r[1] > 0); if (st) rows.sort((a: any, b: any) => b[1] - a[1]);
      rows.forEach((r: any) => html += trow(r[0].c, r[0].label, (dv && r[0] === o.series[1] ? '−' : dv ? '+' : '') + (o.fmt || eur)(r[1])));
      if (st && rows.length > 1) html += `<div class="tr tt"><span>${esc(t('col.total'))}</span><em>${(o.fmt || eur)(tot[i])}</em></div>`;
      showTip(html, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { hb.setAttribute('opacity', '0'); hideTip(); });
    if (o.onSelect) { svg.style.cursor = 'pointer'; svg.addEventListener('click', e => o.onSelect(idx(e as any))); }
  }
  function lineChart(box: HTMLElement, o: any) {
    const w = Math.max(box.clientWidth, 260), h = Math.round((o.height || 260) * P.chartScale / 100), wide = w >= 520;
    const m = { l: 48, r: wide ? 92 : 10, t: 16, b: 26 }, pw = w - m.l - m.r, ph = h - m.t - m.b, n = o.labels.length;
    const all = o.series.flatMap((s: any) => s.values.filter((v: any) => v != null));
    const mv = niceMax(Math.max(...all, 1));
    const x = (i: number) => m.l + (n > 1 ? i * pw / (n - 1) : pw / 2), y = (v: number) => m.t + ph - (v / mv) * ph;
    let g = '';
    for (let k = 0; k <= 4; k++) { const tv = mv * k / 4; g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(tv)}" y2="${y(tv)}" stroke="var(--ty-grid)"/><text class="ax" x="${m.l - 6}" y="${y(tv) + 3.5}" text-anchor="end">${short(tv)}</text>`; }
    const step = Math.max(1, Math.ceil(n * 44 / pw));
    o.labels.forEach((l: string, i: number) => { if (i % step === 0) g += `<text class="ax" x="${x(i)}" y="${h - 8}" text-anchor="middle">${esc(l)}</text>`; });
    (o.notes || []).forEach((nt: any) => { g += `<line x1="${x(nt.i)}" x2="${x(nt.i)}" y1="${m.t}" y2="${y(0)}" stroke="var(--ty-muted)" stroke-dasharray="3 3"/><text class="ax" x="${x(nt.i) + 4}" y="${m.t - 4}">${esc(nt.t)}</text>`; });
    g += `<line id="xh" x1="0" x2="0" y1="${m.t}" y2="${y(0)}" stroke="var(--ty-muted)" opacity="0"/>`;
    o.series.forEach((s: any) => {
      let d = '', pen = false; s.values.forEach((v: any, i: number) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i) + ' ' + y(v); pen = true; });
      g += `<path d="${d}" fill="none" stroke="var(${s.c})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const li = lastIdx(s.values); if (li >= 0) { g += `<circle cx="${x(li)}" cy="${y(s.values[li])}" r="4" fill="var(${s.c})" stroke="var(--ty-card)" stroke-width="2"/>`; if (wide) g += `<text class="axl" x="${x(li) + 9}" y="${y(s.values[li]) + 4}">${esc(s.short || s.label)}</text>`; }
    });
    o.series.forEach((_: any, k: number) => g += `<g id="dots${k}"></g>`);
    box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
    const svg = box.firstChild as SVGSVGElement, xh = svg.querySelector('#xh') as SVGLineElement;
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (w / r.width); let i = Math.round((px - m.l) / (pw / Math.max(n - 1, 1))); i = Math.min(n - 1, Math.max(0, i));
      xh.setAttribute('x1', String(x(i))); xh.setAttribute('x2', String(x(i))); xh.setAttribute('opacity', '1');
      let html = `<b>${esc(o.labels[i])}</b>`;
      o.series.forEach((s: any, k: number) => { const v = s.values[i]; const dg = svg.querySelector('#dots' + k)!; dg.innerHTML = v != null ? `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="var(${s.c})" stroke="var(--ty-card)" stroke-width="2"/>` : ''; if (v != null) html += trow(s.c, s.label, (o.fmt || eur)(v)); });
      showTip(html, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', () => { xh.setAttribute('opacity', '0'); o.series.forEach((_: any, k: number) => svg.querySelector('#dots' + k)!.innerHTML = ''); hideTip(); });
  }
  const hbars = (items: any[], fmt: (n: number) => string = eur) => { const mx = Math.max(...items.map(i => i.v), 1); return `<div class="hb">` + items.map(i => `<div class="r"><span>${esc(i.l)}</span><div class="t"><i style="width:${Math.max(i.v / mx * 100, 1)}%;background:var(${i.c || '--s1'})"></i></div><b>${fmt(i.v)}</b></div>`).join('') + `</div>`; };
  const legend = (items: any[]) => `<div class="legend">` + items.map(i => `<span><i class="sw" style="background:var(${i.c})"></i>${esc(i.label)}</span>`).join('') + `</div>`;
  const tableHtml = (head: string[], rows: string[][], numCols: number[] = []) => `<table><thead><tr>${head.map((h, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  /* ----- chart cards: the chart/table switch lives in the toolbar, once ----- */
  const tg = (act: string, k: string, label: string, on: boolean, c?: string) => `<button class="chip" data-act="${act}" data-k="${esc(k)}" aria-pressed="${on}">${c ? `<i class="sw" style="background:var(${c})"></i>` : ''}${esc(label)}</button>`;
  const CH: Record<string, any> = {};
  function card(id: string, o: any) {
    CH[id] = o;
    return `<div class="card ${o.cls || ''}" data-ch="${id}"><div class="ch-h"><div><h2>${esc(o.title)}</h2>${o.sub ? `<p class="sub">${esc(o.sub)}</p>` : ''}</div></div>
    ${o.filters ? `<div class="ctl tgl">${o.filters}</div>` : ''}${o.legend && !o.filters && !S.table ? legend(o.legend) : ''}${S.table ? '' : '<div class="plot"></div>'}${S.table ? `<div class="tbl">${tableHtml(o.table.head, o.table.rows, o.table.num || [])}</div>` : ''}${o.foot ? `<p class="note">${esc(o.foot)}</p>` : ''}</div>`;
  }
  const drawCharts = () => { root.querySelectorAll('.card[data-ch]').forEach(c => { const o = CH[(c as HTMLElement).dataset.ch!]; const box = c.querySelector('.plot') as HTMLElement | null; if (box && o) o.draw(box); }); };
  const kpi = (l: string, v: string, d?: string) => `<div class="kpi"><div class="l" title="${esc(l)}">${esc(l)}</div><div class="v">${v}</div>${d ? `<div class="d" title="${d.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;')}">${d}</div>` : ''}</div>`;
  const delta = (n: number) => n === 0 ? esc(t('k.same')) : `<span class="${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'} ${eur(Math.abs(n))}</span>`;
  const months = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  /* ----- tabs ----- */
  function tabOverview() {
    const liq = OV['Somma'][LI] as number, prev = (OV['Somma'][LI - 1] ?? liq) as number;
    const dep = secLast('deposit'), inv = secLast('invest');
    const CM = completeMonths(); const list = EX.filter(e => e.m <= CM && !isOne(e)); const avg = sum(list.map(e => e.v)) / CM;
    const runway = (liq + dep) / (avg || 1);
    const inL = incMonth(YEAR, LMI), spL = sum(EX.filter(e => e.m === LMI && !isOne(e)).map(e => e.v));
    let ms = months(LMI).filter(inPeriod); if (!ms.length) ms = months(LMI);
    const spend = ms.map(m => sum(EX.filter(e => e.m === m && !(S.oneOff && isOne(e))).map(e => e.v))), income = ms.map(m => incMonth(YEAR, m));
    const ovEnd = Math.min(Math.max(S.to, 1), LI) + 1; let ovStart = Math.max(S.from - 1, 0); if (ovEnd - ovStart < 2) ovStart = Math.max(0, ovEnd - 2);
    const lab = ovMonths().slice(ovStart, ovEnd);
    const sDep = secSeries('deposit'), sInv = secSeries('invest');
    const series: any[] = [{ label: t('ov.liquidity'), c: '--s1', values: (OV['Somma'] as any[]).slice(ovStart, ovEnd) }];
    if (sDep) series.push({ label: t('ov.deposit'), c: '--s2', values: sDep.slice(ovStart, ovEnd) });
    if (sInv) series.push({ label: t('ov.invest'), c: '--s3', values: sInv.slice(ovStart, ovEnd) });
    let note: any[] = []; { const so = OV['Somma'] as number[]; let bi = -1, bd = 0; for (let i = 1; i <= LI; i++) { const d = (so[i] ?? 0) - (so[i - 1] ?? 0); if (d < bd) { bd = d; bi = i; } } if (bi - ovStart > 0 && bi < ovEnd && -bd > 0.1 * (so[bi - 1] || 1)) note = [{ i: bi - ovStart, t: t('ov.bigDrop') }]; }
    const trend = card('trend', { title: t('ov.trend'), cls: 'w7', sub: t('ov.trendSub', { y: YEAR - 1 }), legend: series.map(s => ({ c: s.c, label: s.label })),
      draw: (b: HTMLElement) => lineChart(b, { labels: lab, height: 270, aria: t('ov.trend'), notes: note, series }),
      table: { head: [t('col.month'), ...series.map(s => s.label)], num: series.map((_, i) => i + 1), rows: lab.map((l, i) => [l, ...series.map(s => s.values[i] != null ? eur(s.values[i]) : '–')]) } });
    const ieCard = card('ie', { title: t('ov.ie', { y: YEAR }), cls: 'w5', sub: t(S.oneOff ? 'ov.ieSubEx' : 'ov.ieSubIn'), legend: [{ c: '--s1', label: t('ov.income') }, { c: '--s2', label: t('ov.spending') }],
      draw: (b: HTMLElement) => barChart(b, { labels: ms.map(m => MONTHS[m - 1]), stacked: false, height: 270, aria: t('ov.ie', { y: YEAR }), series: [{ label: t('ov.income'), c: '--s1', values: income }, { label: t('ov.spending'), c: '--s2', values: spend }] }),
      table: { head: [t('col.month'), t('ov.income'), t('ov.spending'), t('col.balance')], num: [1, 2, 3], rows: ms.map((m, i) => [MFULL[m - 1], eur(income[i]), eur(spend[i]), sgn(income[i] - spend[i])]) },
      foot: t('ov.ieFoot', { m: mLow(MFULL[LMI - 1]) }) });
    const g = byMonthGroup(EX.filter(e => inPeriod(e.m) && !(S.oneOff && isOne(e))));
    const gt = GROUPS.map(x => ({ l: gLabel(x.id), v: sum(g[x.id]), c: x.c })).sort((a, b) => b.v - a.v);
    const today = new Date(new Date().toDateString()), lim = new Date(today.getTime() + P.payDays * 864e5);
    const all = D.scheduled.map(r => ({ d: r[0], v: r[1], n: r[2], dt: new Date(r[0] + 'T12:00:00') })).filter(r => r.dt >= today);
    const upc = all.filter(r => r.dt <= lim);
    return `<div class="kpis">
      ${kpi(t('k.liquidity'), eur(liq), t('k.vs', { d: delta(liq - prev), m: mLow(ovMonths()[LI - 1] || '') }))}
      ${kpi(t('k.liquid3'), eur(liq + dep + inv), esc(t('k.depInv', { a: eur(dep), b: eur(inv) })))}
      ${kpi(t('k.avgSpend'), eur(avg), esc(t('k.avgSub', { m: MONTHS[CM - 1] })))}
      ${kpi(t('k.runway'), esc(t('k.runwayVal', { n: NUM1.format(runway) })), esc(t('k.runwaySub')))}
      ${kpi(MFULL[LMI - 1], sgn(inL - spL), esc(t('k.monthNet', { i: eur(inL), s: eur(spL) })))}
    </div><div class="grid">${trend}${ieCard}
      <div class="card w7"><h2>${esc(t('ov.where'))}</h2><p class="sub">${esc(t('ov.whereSub', { a: mLow(MFULL[Math.min(S.from, NM) - 1]), m: mLow(MFULL[Math.min(S.to, NM) - 1]), x: S.oneOff ? t('ov.whereEx') : '' }))}</p>${hbars(gt)}</div>
      <div class="card w5"><h2>${esc(t('ov.upcoming'))}</h2><p class="sub">${esc(t('ov.upcomingSub', { n: P.payDays }))}</p>
        ${upc.length ? `<div class="list">${upc.map(r => `<div class="it"><span class="dt">${dmy(r.d).slice(0, 5)}</span><span class="nm">${esc(r.n)}</span><span class="am">${eur2(r.v)}</span></div>`).join('')}</div>` : `<div class="empty">${esc(t('ov.noUpcoming'))}</div>`}
        <p class="note">${esc(t('ov.toPay', { a: eur2(sum(all.map(r => r.v))), n: all.length }))}</p></div></div>`;
  }

  function tabSpending() {
    const list = filtered(), ms = months(S.to).filter(m => m >= S.from), g = byMonthGroup(list);
    const labels = ms.map(m => MONTHS[m - 1]);
    const series = GROUPS.map(x => ({ label: gLabel(x.id), c: x.c, values: ms.map(m => g[x.id][m - 1]) }));
    const total = sum(list.map(e => e.v)), cnt = list.length, avg = total / ms.length;
    const plen = S.to - S.from + 1, pFrom = S.from - plen;
    const prevTotal = pFrom >= 1 ? sum(EX.filter(e => e.m >= pFrom && e.m < S.from && flt(e)).map(e => e.v)) : null;
    const prevD = prevTotal == null ? '' : ' · ' + t('k.vsPrev', { d: delta(total - prevTotal) });
    const top = GROUPS.map(x => [x, sum(g[x.id])] as const).sort((a, b) => b[1] - a[1])[0];
    const amex = sum(list.filter(e => e.a).map(e => e.v));
    const chart = card('spese', { title: t('sp.byMonth'), sub: t('sp.byMonthSub'), filters: GROUPS.map(g => tg('cg', g.id, gLabel(g.id).split(' (')[0], !S.cg.includes(g.id), g.c)).join(''), legend: series.map(s => ({ c: s.c, label: s.label })),
      draw: (b: HTMLElement) => barChart(b, { labels, series, height: 290, selected: S.sel != null ? ms.indexOf(S.sel) : -1, aria: t('sp.byMonth'), onSelect: (i: number) => { const m = ms[i]; S.sel = S.sel === m ? null : m; S.shown = P.pageSize; render(); } }),
      table: { head: [t('col.month'), ...series.map(s => s.label), t('col.total')], num: series.map((_, i) => i + 1).concat([series.length + 1]), rows: ms.map((m, i) => [MFULL[m - 1], ...GROUPS.map(x => eur(g[x.id][m - 1])), eur(sum(GROUPS.map(x => g[x.id][m - 1])))]) },
      foot: monthPartial() && S.to === NM ? t('sp.partial', { m: MFULL[NM - 1] }) : '' });
    const scope = S.sel ? list.filter(e => e.m === S.sel) : list;
    const sc: Record<string, { v: number; c: string }> = {}; scope.forEach(e => { const k = subL(e.s); sc[k] = sc[k] || { v: 0, c: GROUPS.find(x => x.id === (P2G[e.p] || 'altre'))!.c }; sc[k].v += e.v; });
    const subs = Object.entries(sc).map(([l, o]) => ({ l, v: o.v, c: o.c })).sort((a, b) => b.v - a.v).slice(0, 12);
    const dd = Object.entries(D.daily);
    const subsAll = [...new Set(EX.filter(e => !S.cg.includes(P2G[e.p] || 'altre')).map(e => e.s))].sort((a, b) => subL(a).localeCompare(subL(b)));
    const moreCtl = `<span class="tgl" style="display:contents">${tg('extra', 'extra', t('ctl.extra'), S.extra)}${tg('amex', 'amex', t('ctl.amex'), S.amex)}</span><label>${esc(t('ctl.sub'))} <select data-act="sub"><option value="">${esc(t('ctl.all'))}</option>${subsAll.map(x => `<option value="${esc(x)}" ${S.sub === x ? 'selected' : ''}>${esc(subL(x))}</option>`).join('')}</select></label><label>${esc(t('ctl.min'))} <input type="number" min="0" step="any" data-act="min" value="${esc(S.min)}" class="amt"></label><label>${esc(t('ctl.max'))} <input type="number" min="0" step="any" data-act="max" value="${esc(S.max)}" class="amt"></label>`;
    return `<div class="kpis">
      ${kpi(t('k.total'), eur(total), esc(t('k.moves', { n: cnt })) + prevD)}
      ${kpi(t('k.avgMonth'), eur(avg), esc(ms.length === 1 ? t('k.month1') : t('k.monthN', { n: ms.length })))}
      ${kpi(t('k.top'), top && top[1] > 0 ? esc(gLabel(top[0].id).split(' (')[0]) : '–', top ? eur(top[1]) : '')}
      ${kpi(t('k.amex'), eur(amex), total ? esc(t('k.pctTotal', { p: Math.round(amex / total * 100) })) : '')}
    </div>${chart}
    <div class="grid">
      <div class="card w5"><h2>${esc(t('sp.where', { s: S.sel ? MFULL[S.sel - 1] : t('sp.selected') }))}</h2><p class="sub">${esc(t('sp.whereSub'))}</p>${subs.length ? hbars(subs) : `<div class="empty">${esc(t('sp.none'))}</div>`}</div>
      <div class="card w7"><h2>${esc(t('sp.moves'))}</h2><p class="sub">${esc(S.sel ? MFULL[S.sel - 1] : t('sp.whole'))}${S.sel ? ` <button class="chip" data-act="clear">${esc(t('sp.showAll'))}</button>` : ''}</p>
        <div class="ctl"><input type="search" data-act="q" placeholder="${esc(t('sp.search'))}" value="${esc(S.q)}" aria-label="${esc(t('sp.search'))}"><label>${esc(t('sp.sort'))} <select data-act="sort"><option value="amt" ${S.sort === 'amt' ? 'selected' : ''}>${esc(t('sp.byAmount'))}</option><option value="date" ${S.sort === 'date' ? 'selected' : ''}>${esc(t('sp.byDate'))}</option></select></label>${moreCtl}</div>
        <div class="tbl" id="mov"></div></div>
    </div>
    <div class="card"><h2>${esc(t('sp.daily'))}</h2><p class="sub">${esc(t('sp.dailySub'))}</p>
      <div class="tbl">${tableHtml([t('col.month'), t('col.budget'), t('col.marked'), t('col.vault')], dd.map(([m, v]) => [MFULL[+m - 1], eur(v[0]), eur(v[1]), eur2(v[2])]), [1, 2, 3])}</div></div>`;
  }
  function renderMovements() {
    const host = q('#mov'); if (!host) return;
    const list = filtered().filter(e => S.sel ? e.m === S.sel : true); const qq = S.q.trim().toLowerCase();
    const rows = list.filter(e => !qq || (e.n + ' ' + subL(e.s) + ' ' + e.p).toLowerCase().includes(qq));
    rows.sort(S.sort === 'amt' ? (a, b) => b.v - a.v : (a, b) => (b.m - a.m) || (b.d - a.d));
    const n = rows.length, shown = rows.slice(0, S.shown);
    host.innerHTML = n ? tableHtml([t('col.date'), t('col.item'), t('col.category'), t('col.amount')], shown.map(e => [String(e.d).padStart(2, '0') + '/' + String(e.m).padStart(2, '0'), esc(e.n) + (e.a ? `<span class="tag">${esc(t('tag.amex'))}</span>` : '') + (e.x ? `<span class="tag">${esc(t('tag.extra'))}</span>` : '') + `<span class="cat">${esc(subL(e.s))}</span>`, esc(subL(e.s)), eur2(e.v)]), [3]) + (n > shown.length ? `<button class="chip more" data-act="more">${esc(t('sp.more', { n: Math.min(P.pageSize, n - shown.length) }))}</button>` : '') + `<p class="note">${esc(t('sp.count', { n, a: eur2(sum(rows.map(e => e.v))) }))}</p>` : `<div class="empty">${esc(t('sp.noneFound'))}</div>`;
  }

  function tabIncome() {
    const allY = incYears(), minY = allY[0], y0 = S.iy0 ?? minY, y1 = S.iy1 ?? YEAR;
    const years = allY.filter(y => y >= Math.min(y0, y1) && y <= Math.max(y0, y1));
    const IG = igVisible();
    const ysum = (g: string, y: number) => sum(Object.entries(D.income[g] || {}).filter(([k]) => k.startsWith(y + '-')).map(([, v]) => v));
    const total = sum(years.map(y => sum(IG.map(g => ysum(g[0], y)))));
    const ser = IG.map(g => ({ label: t('grp.' + g[0]), c: g[1], values: years.map(y => ysum(g[0], y)) }));
    const cust = S.iy0 != null || S.iy1 != null, ya = Math.min(y0, y1), yb = Math.max(y0, y1), rng = ya === yb ? String(ya) : ya + '–' + yb;
    const mm: [number, number][] = [];
    if (cust) { for (let y = ya; y <= yb; y++) for (let m = 1; m <= (y === YEAR ? LMI : 12); m++) mm.push([y, m]); }
    else for (let i = 23; i >= 0; i--) { const d = new Date(YEAR, LMI - 1 - i, 1); mm.push([d.getFullYear(), d.getMonth() + 1]); }
    const mval = (y: number, m: number) => sum(IG.map(g => (D.income[g[0]] || {})[y + '-' + String(m).padStart(2, '0')] || 0));
    const mser = IG.map(g => ({ label: t('grp.' + g[0]), c: g[1], values: mm.map(([y, m]) => (D.income[g[0]] || {})[y + '-' + String(m).padStart(2, '0')] || 0) }));
    const yc = card('inc-y', { title: t('in.byYear'), cls: 'w6', filters: IGROUPS.map(g => tg('ig', g[0], t('grp.' + g[0]), !S.ig.includes(g[0]), g[1])).join(''), sub: t('in.byYearSub'), legend: ser.map(s => ({ c: s.c, label: s.label })),
      draw: (b: HTMLElement) => barChart(b, { labels: years.map(String), series: ser, height: 270, aria: t('in.byYear') }),
      table: { head: [t('col.year'), ...ser.map(s => s.label), t('col.total')], num: ser.map((_, i) => i + 1).concat([ser.length + 1]), rows: years.map((y, i) => [String(y), ...ser.map(s => eur(s.values[i])), eur(sum(ser.map(s => s.values[i])))]) } });
    const mc = card('inc-m', { title: cust ? t('in.monthly') : t('in.last24'), cls: 'w6', filters: IGROUPS.map(g => tg('ig', g[0], t('grp.' + g[0]), !S.ig.includes(g[0]), g[1])).join(''), sub: cust ? t('in.monthlySub', { r: rng }) : t('in.last24Sub'), legend: mser.map(s => ({ c: s.c, label: s.label })),
      draw: (b: HTMLElement) => barChart(b, { labels: mm.map(([y, m]) => MONTHS[m - 1] + ' ' + String(y).slice(2)), series: mser, height: 270, labelW: 40, aria: t('in.last24') }),
      table: { head: [t('col.month'), ...mser.map(s => s.label), t('col.total')], num: mser.map((_, i) => i + 1).concat([mser.length + 1]), rows: mm.map(([y, m], i) => [MONTHS[m - 1] + ' ' + y, ...mser.map(s => eur(s.values[i])), eur(sum(mser.map(s => s.values[i])))]) } });
    const ytd = sum(IG.map(g => ysum(g[0], yb)));
    let lm = yb === YEAR ? LMI : 0; if (!lm) for (let m = 12; m >= 1; m--) if (mval(yb, m) > 0) { lm = m; break; }
    const lastM = lm ? mval(yb, lm) : 0;
    let rm: number[] = []; for (let y = ya; y <= yb; y++) for (let m = 1; m <= (y === YEAR ? LMI : 12); m++) rm.push(mval(y, m));
    while (rm.length && rm[0] <= 0) rm.shift();
    const avgR = rm.length ? total / rm.length : 0;
    const useSheet = D.avgIncome && !S.ig.length && !cust;
    return `<div class="kpis">
      ${kpi(cust ? (ya === yb ? t('k.ytd', { y: ya }) : t('k.range', { a: ya, b: yb })) : t('k.since', { y: years[0] ?? minY }), eur(total), esc(t('k.netTotal')))}
      ${useSheet ? kpi(t('k.avgIncome'), eur(D.avgIncome), esc(t('k.asSheet'))) : (avgR ? kpi(t('k.avgIncome'), eur(avgR), esc(t('k.avgCalc'))) : '')}
      ${ya === yb ? '' : kpi(t('k.ytd', { y: yb }), eur(ytd), esc(yb === YEAR ? t('k.ytdSub', { m: MONTHS[LMI - 1] }) : t('k.fullYear')))}
      ${kpi(t('k.lastMonth'), eur(lastM), esc(lm ? MFULL[lm - 1] + ' ' + yb : '–'))}
    </div><div class="grid">${yc}${mc}
      <div class="card"><h2>${esc(t('in.sources'))}</h2><p class="sub">${esc(t('in.sourcesSub') + (cust ? ' ' + t('in.sourcesAll') : ''))}</p>
      <div class="tbl">${tableHtml([t('col.source'), t('col.total')], D.sources.filter(s => !S.ig.includes(s[2])).map(s => [esc(s[0]), eur(s[1])]).concat([[`<b>${esc(t('col.total'))}</b>`, `<b>${eur(sum(D.sources.filter(s => !S.ig.includes(s[2])).map(s => s[1])))}</b>`]]), [1])}</div></div></div>`;
  }

  function tabWealth() {
    const G = D.giacenze, ovm = ovMonths(), lab = ovm.slice(0, LI + 1);
    const so = OV['Somma'] as number[];
    const skip = (k: string) => k === 'Somma' || k.toLowerCase().startsWith('growth');
    const rowsOf = (s: { rows: string[] }) => s.rows.filter(k => !skip(k));
    const monSec = sec('monitor'), amexSec = sec('amex');
    const posSecs = D.sections.filter(s => s !== monSec && s !== amexSec && !S.wsec.includes(s.name));
    const posRows: string[][] = [];
    const cb = (k: string) => `<input type="checkbox" data-act="wpos" data-k="${esc(k)}" ${S.wpos.includes(k) ? '' : 'checked'} aria-label="${esc(k)}">`;
    const dim = (k: string, h: string) => S.wpos.includes(k) ? `<span class="dim">${h}</span>` : h;
    let pFirst = 0, pCur = 0;
    const CMP = S.wcmp;
    posSecs.forEach(s => rowsOf(s).forEach(k => { const a = OV[k] || []; const li = lastIdx(a); const cur = li >= 0 ? (a[li] as number) : 0; const first = (a[0] ?? 0) as number; if (!S.wz && Math.abs(cur) < 0.005) return; if (!S.wpos.includes(k)) { pFirst += first; pCur += cur; } posRows.push([cb(k), dim(k, esc(k)), dim(k, esc(s.name)), ...(CMP ? [dim(k, eur(first))] : []), dim(k, eur(cur)), ...(CMP ? [dim(k, sgn(cur - first))] : [])]); }));
    if (posRows.length) posRows.push(['', `<b>${esc(t('col.total'))}</b>`, '', ...(CMP ? [`<b>${eur(pFirst)}</b>`] : []), `<b>${eur(pCur)}</b>`, ...(CMP ? [`<b>${sgn(pCur - pFirst)}</b>`] : [])]);
    const unc = sec('unclaimed'), uncSum = secLast('unclaimed'), monSum = secLast('monitor');
    const GN = G.saldo.filter(v => v > 0).length;
    const yoy = G.years.map((_, i) => i === 0 || !G.saldo[i - 1] ? null : G.saldo[i] / G.saldo[i - 1] - 1);
    const gc = G.years.length ? card('giac', { title: t('we.giac'), cls: 'w7', sub: t('we.giacSub', { a: G.years[0], b: G.years[Math.max(GN - 1, 0)] }) + (GN < G.years.length ? ' ' + t('we.giacNo', { y: G.years[GN] }) : ''), legend: [{ c: '--s1', label: t('we.endBal') }, { c: '--s2', label: t('we.avgBal') }],
      draw: (b: HTMLElement) => barChart(b, { labels: G.years.slice(0, GN).map(String), stacked: false, height: 260, aria: t('we.giac'), series: [{ label: t('we.endBal'), c: '--s1', values: G.saldo.slice(0, GN) }, { label: t('we.avgBal'), c: '--s2', values: G.media.slice(0, GN) }] }),
      table: { head: [t('col.year'), t('col.balance'), t('we.avgBal'), t('col.vsPrev')], num: [1, 2, 3], rows: G.years.slice(0, GN).map((y, i) => [String(y), eur(G.saldo[i]), eur(G.media[i]), yoy[i] == null ? '–' : (yoy[i]! >= 0 ? '+' : '−') + NUM1.format(Math.abs(yoy[i]!) * 100) + '%']) } }) : '';
    const chgAll = lab.map((_, i) => i === 0 ? 0 : (so[i] ?? 0) - (so[i - 1] ?? 0)).slice(1);
    const chgIdx = chgAll.map((_, i) => i).filter(i => inPeriod(i + 1)); const cI = chgIdx.length ? chgIdx : chgAll.map((_, i) => i);
    const chg = cI.map(i => chgAll[i]);
    const lc = card('liqm', { title: t('we.liqm'), cls: G.years.length ? 'w5' : '', sub: t('we.liqmSub'), legend: [{ c: '--s1', label: t('we.up') }, { c: '--s2', label: t('we.down') }],
      draw: (b: HTMLElement) => barChart(b, { labels: cI.map(i => lab[i + 1]), height: 280, diverge: true, aria: t('we.liqm'), series: [{ label: t('we.up'), c: '--s1', values: chg.map(v => Math.max(v, 0)) }, { label: t('we.down'), c: '--s2', values: chg.map(v => Math.max(-v, 0)) }] }),
      table: { head: [t('col.month'), t('col.change')], num: [1], rows: cI.map((j, i) => [lab[j + 1], sgn(chg[i])]) } });
    const monRows = monSec && !S.wsec.includes(monSec.name) ? monSec.rows.flatMap(k => { const a = OV[k] || []; const li = lastIdx(a); const cur = li >= 0 ? (a[li] as number) : 0; const first = (a[0] ?? 0) as number; if (!S.wz && Math.abs(cur) < 0.005) return []; return [[cb('m:' + k), dim('m:' + k, esc(k)), ...(CMP ? [dim('m:' + k, eur(first))] : []), dim('m:' + k, eur(cur)), ...(CMP ? [dim('m:' + k, sgn(cur - first))] : [])]]; }) : [];
    const dep = secLast('deposit');
    return `<div class="kpis">
      ${kpi(t('k.liquidity'), eur(so[LI]), esc(ovm[LI] + ' ' + YEAR))}
      ${sec('deposit') ? kpi(t('k.deposit'), eur(dep), t('k.since0', { d: delta(dep - (secSeries('deposit')![0] ?? 0)) })) : ''}
      ${unc ? kpi(unc.name, eur(uncSum), '') : ''}
      ${monSec ? kpi(monSec.name, eur(monSum), esc(t('k.monSub'))) : ''}
    </div><div class="grid">${gc}${lc}
      <div class="card ${monSec && !S.wsec.includes(monSec.name) ? 'w7' : ''}"><h2>${esc(t('we.positions'))}</h2><p class="sub">${esc(t('we.positionsSub', { y: YEAR - 1, m: mLow(MFULL[LI - 1]) }))}</p><div class="ctl tgl">${D.sections.filter(x => x.name && x.rows.length && x !== amexSec).map(x => tg('wsec', x.name, x.name, !S.wsec.includes(x.name))).join('')}${tg('wz', 'wz', t('we.showZero'), S.wz)}${tg('wcmp', 'wcmp', t('we.showCmp', { y: String(YEAR - 1).slice(2) }), S.wcmp)}</div><div class="tbl">${tableHtml(['', t('col.position'), t('col.section'), ...(CMP ? [t('col.dec', { y: String(YEAR - 1).slice(2) })] : []), t('col.now'), ...(CMP ? [t('col.change')] : [])], posRows, CMP ? [3, 4, 5] : [3])}</div></div>
      ${monSec && !S.wsec.includes(monSec.name) ? `<div class="card w5"><h2>${esc(monSec.name)}</h2><p class="sub">${esc(t('we.monSub'))}</p><div class="tbl">${tableHtml(['', t('col.item'), ...(CMP ? [t('col.dec', { y: String(YEAR - 1).slice(2) })] : []), t('col.now'), ...(CMP ? [t('col.change')] : [])], monRows, CMP ? [2, 3, 4] : [2])}</div></div>` : ''}</div>`;
  }

  function tabInvest() {
    const T = D.trades.filter(x => !S.ivH.includes(x[2]) && (!S.ivA || x[0] >= S.ivA) && (!S.ivB || x[0] <= S.ivB)).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const tot = sum(T.map(x => x[3])), fees = sum(T.map(x => x[4]));
    const byT: Record<string, { v: number; n: number; l: string }> = {}; T.forEach(x => { byT[x[2]] = byT[x[2]] || { v: 0, n: 0, l: x[1] }; byT[x[2]].v += x[3]; byT[x[2]].n++; });
    const items = Object.entries(byT).map(([k, o], i) => ({ l: k + ' · ' + o.l.replace(' USD (Acc)', ''), v: o.v, c: ['--s1', '--s2', '--s3'][i % 3] })).sort((a, b) => b.v - a.v);
    let cum = 0; const pts = T.map(x => { cum += x[3]; return [x[0], cum] as [string, number]; });
    const B = D.btc, loss = B.sold - B.spent, invNow = secLast('invest');
    const invS = sec('invest'); const invIdx = invS ? Math.max(0, ...invS.rows.map(r => lastIdx(OV[r] || []))) : LI;
    const cc = T.length ? card('cum', { title: t('iv.cum'), cls: 'w7', sub: t('iv.cumSub', { n: T.length }),
      draw: (b: HTMLElement) => lineChart(b, { labels: pts.map(p => dmy(p[0]).slice(0, 5)), height: 250, aria: t('iv.cum'), series: [{ label: t('iv.invested'), c: '--s1', values: pts.map(p => p[1]) }] }),
      table: { head: [t('col.date'), t('col.running')], num: [1], rows: pts.map(p => [dmy(p[0]), eur2(p[1])]) } }) : '';
    return `<div class="kpis">
      ${kpi(t('k.invested'), eur(tot), esc(t('k.buys', { n: T.length })))}
      ${kpi(t('k.fees'), eur2(fees), esc(t('k.feeAvg', { a: eur2(T.length ? fees / T.length : 0) })))}
      ${sec('invest') ? kpi(t('k.value', { m: mLow(MFULL[Math.max(invIdx - 1, 0)]) }), eur(invNow), esc(t('k.valueSub'))) : ''}
      ${B.buys.length ? kpi(t('k.btc'), sgn(loss), esc(t('k.btcSub', { p: NUM1.format(B.spent ? loss / B.spent * 100 : 0), a: eur(B.spent) }))) : ''}
    </div><div class="grid">${cc}
      <div class="card w5"><h2>${esc(t('iv.byAsset'))}</h2><p class="sub">${esc(t('iv.byAssetSub'))}</p>${hbars(items)}</div>
      <div class="card ${B.buys.length ? 'w7' : ''}"><h2>${esc(t('iv.buys'))}</h2><div class="ctl tgl">${[...new Set(D.trades.map(x => x[2]))].sort().map(x => tg('ivH', x, x, !S.ivH.includes(x))).join('')}<label>${esc(t('ctl.from'))} <input type="date" data-act="ivA" value="${esc(S.ivA)}"></label><label>${esc(t('ctl.to'))} <input type="date" data-act="ivB" value="${esc(S.ivB)}"></label></div><div class="tbl">${tableHtml([t('col.date'), t('col.asset'), t('col.ticker'), t('col.amount'), t('col.fee')], T.map(x => [dmy(x[0]), esc(x[1]), esc(x[2]), eur2(x[3]), eur2(x[4])]).concat([[`<b>${esc(t('col.total'))}</b>`, '', '', `<b>${eur2(tot)}</b>`, `<b>${eur2(fees)}</b>`]]), [3, 4])}</div></div>
      ${B.buys.length ? `<div class="card w5"><h2>${esc(t('iv.btc'))}</h2><p class="sub amt">${esc(t('iv.btcSub', { n: B.buys.length, d: B.sellDate ? dmy(B.sellDate) : '–', p: eur(B.sellPrice) }))}</p>
        <div class="tbl">${tableHtml([t('col.item'), t('col.amount')], [[t('iv.spent'), eur2(B.spent)], [t('iv.received'), eur2(B.sold)], [`<b>${esc(t('iv.result'))}</b>`, `<b>${sgn(loss)}</b>`]], [1])}</div>
        <p class="note">${esc(t('iv.btcNote', { a: eur(Math.min(...B.buys.map(b => b[1]))), b: eur(Math.max(...B.buys.map(b => b[1]))), c: eur(B.spent) }))}</p></div>` : ''}</div>`;
  }

  function tabHome() {
    const H = D.house, P = D.housePlan;
    const costs = H.costs.map(([l, v]) => ({ l: t.has('hc.' + l) ? t('hc.' + l) : l, v, c: '--s1' })).sort((a, b) => b.v - a.v);
    const mort = EX.filter(e => e.n.trim().toLowerCase() === 'mortage'); const lastM = mort[mort.length - 1];
    const SUBS: [string, string, string][] = [['Rent', t('ho.rent'), '--s1'], ['Gas', t('ho.gas'), '--s2'], ['Eletricity', t('ho.elec'), '--s3'], ['Internet', t('ho.net'), '--s4'], ['Water', t('ho.water'), '--s5']];
    const ms = months(NM).filter(inPeriod), hs = SUBS.map(([k, l, c]) => ({ label: l, c, values: ms.map(m => sum(EX.filter(e => e.m === m && e.p === 'Housing' && (e.s === k || (k === 'Eletricity' && e.s === 'Electricity'))).map(e => e.v))) }));
    const hc = card('hcost', { title: t('ho.fixed'), cls: 'w7', sub: t('ho.fixedSub'), legend: hs.map(s => ({ c: s.c, label: s.label })),
      draw: (b: HTMLElement) => barChart(b, { labels: ms.map(m => MONTHS[m - 1]), series: hs, height: 250, aria: t('ho.fixed') }),
      table: { head: [t('col.month'), ...hs.map(s => s.label)], num: [1, 2, 3, 4, 5], rows: ms.map((m, i) => [MFULL[m - 1], ...hs.map(s => eur(s.values[i]))]) } });
    // editable monthly recap: change the starting figures to see what is left to save
    const ov = planOv(), start0 = Math.round((P.actual + P.saving) * 100) / 100;
    const val = (k: string, orig: number) => (ov.items && ov.items[k] != null ? ov.items[k] : orig) as number;
    const start = ov.start != null ? ov.start : start0;
    const inp = (k: string, v: number) => `<input type="number" step="any" class="amt" data-act="plan" data-k="${esc(k)}" value="${esc(v)}" aria-label="${esc(k)}">`;
    const total = sum(P.items.map(([l, v]) => val(l, v))), saving = start - total;
    const edited = ov.start != null || Object.keys(ov.items || {}).length > 0;
    const planRows = [[`<b>${esc(t('ho.planIncome'))}</b>`, inp('_start', start)] as string[]].concat(
      P.items.map(([l, v]) => [esc(t.has('hp.' + l) ? t('hp.' + l) : l), inp(l, val(l, v))]),
      [[`<b>${esc(t('ho.planTotal'))}</b>`, `<b>${eur2(total)}</b>`], [`<b>${esc(t('ho.planSaving'))}</b>`, `<b class="${saving >= 0 ? 'up' : 'down'}">${eur2(saving)}</b>`], [esc(t('ho.planYear')), eur2(saving * 12)]]);
    const planCard = P.items.length ? `<div class="card w6"><h2>${esc(t('ho.plan'))}</h2><p class="sub">${esc(t('ho.planEdit'))}</p>${edited ? `<div class="ctl tgl"><button class="chip" data-act="planreset">${esc(t('ho.planReset'))}</button></div>` : ''}<div class="tbl">${tableHtml([t('col.item'), t('col.planned')], planRows, [1])}</div></div>` : '';
    return `<div class="kpis">
      ${H.total ? kpi(t('k.purchase'), eur(H.total), esc(t('k.purchaseSub'))) : ''}
      ${lastM ? kpi(t('k.lastPay'), eur2(lastM.v), esc(MFULL[lastM.m - 1])) : ''}
      ${P.items.length ? kpi(t('k.planned'), eur2(total), esc(t('k.plannedSub'))) : ''}
      ${P.items.length ? kpi(t('ho.planSaving'), eur2(saving), esc(t('ho.planYearSub', { a: eur(saving * 12) }))) : ''}
    </div><div class="grid">${hc}
      ${costs.length ? `<div class="card w5"><h2>${esc(t('ho.costs'))}</h2><p class="sub amt">${esc(t('ho.costsSub', { a: eur2(H.total) }))}</p>${hbars(costs)}</div>` : ''}
      ${planCard}
      ${D.sell.length ? `<div class="card w6"><h2>${esc(t('ho.sell'))}</h2><p class="sub">${esc(t('ho.sellSub'))}</p><div class="tbl">${tableHtml([t('col.scenario'), t('col.price'), t('col.proceeds'), t('col.net')], D.sell.map(r => [esc(t.has('sell.' + r[0]) ? t('sell.' + r[0]) : r[0]), eur(r[1]), eur(r[2]), eur(r[3])]), [1, 2, 3])}</div></div>` : ''}</div>`;
  }

  function tabPayments() {
    const today = new Date(new Date().toDateString()), lim = new Date(today.getTime() + P.payDays * 864e5);
    const upc = D.scheduled.map(r => ({ d: r[0], v: r[1], n: r[2], dt: new Date(r[0] + 'T12:00:00') })).filter(r => r.dt >= today).sort((a, b) => a.dt.getTime() - b.dt.getTime());
    const byMonth: Record<string, number> = {}; upc.forEach(r => { const k = r.d.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + r.v; });
    const bm = Object.entries(byMonth).map(([k, v]) => ({ l: MFULL[+k.slice(5) - 1] + ' ' + k.slice(2, 4), v, c: '--s2' }));
    const next = upc[0], in30 = sum(upc.filter(r => r.dt <= lim).map(r => r.v));
    return `<div class="kpis">
      ${kpi(t('k.toPay'), eur(sum(upc.map(r => r.v))), esc(t('k.nPay', { n: upc.length })))}
      ${kpi(t('k.next'), next ? eur2(next.v) : '–', next ? esc(dmy(next.d) + ' · ' + next.n) : '')}
      ${kpi(t('k.next30', { n: P.payDays }), eur(in30), esc(t('k.nPay', { n: upc.filter(r => r.dt <= lim).length })))}
    </div><div class="grid">
      <div class="card w7"><h2>${esc(t('ho.cal'))}</h2><p class="sub">${esc(t('ho.calSub'))}</p>
        ${upc.length ? `<div class="tbl">${tableHtml([t('col.date'), t('col.item'), t('col.amount')], upc.map(r => [dmy(r.d), esc(r.n), eur2(r.v)]), [2])}</div>` : `<div class="empty">${esc(t('ho.noPay'))}</div>`}</div>
      <div class="card w5"><h2>${esc(t('ho.byMonth'))}</h2><p class="sub">${esc(t('ho.byMonthSub'))}</p>${bm.length ? hbars(bm, eur2) : `<div class="empty">${esc(t('ho.noPay'))}</div>`}</div></div>`;
  }

  const BUILD: Record<string, () => string> = { overview: tabOverview, spending: tabSpending, income: tabIncome, wealth: tabWealth, invest: tabInvest, home: tabHome, payments: tabPayments };

  /* ----- shell ----- */
  function oneOffTip() { const a = sum(EX.filter(isOne).map(e => e.v)); return t('ctl.oneoffTip', { a: eur(a), c: ctx.oneOff }); }
  /* ----- phone layout: bottom bar, compact top bar ----- */
  const IC: Record<string, string> = {
    overview: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
    spending: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
    income: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 19h16"/>',
    wealth: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    invest: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    payments: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  };
  const svg = (k: string, sz = 22) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;
  const ib = (act: string, icon: string, label: string, pressed?: boolean, dot?: boolean) => `<button class="ib${act === 'reload' && ctx.getState().loading ? ' spin' : ''}" data-act="${act}" ${pressed != null ? `aria-pressed="${pressed}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${svg(icon, 20)}${dot ? '<i class="dot"></i>' : ''}</button>`;
  const topHtml = (st: DashState) => `<div class="mtop"><h1>${esc(t('tab.' + S.tab))}</h1><div class="mact">${st.data ? ib('hide', S.hide ? 'eyeoff' : 'eye', t(S.hide ? 'ctl.showAmt' : 'ctl.hideAmt'), S.hide) + ib('fopen', 'filter', t('ctl.filters'), S.fOpen, hasFilter()) : ''}${ib('reload', 'refresh', t('ctl.refresh'))}${ctx.prefs ? ib('prefs', 'gear', t('ctl.custom')) : ''}</div></div>`;
  const barHtml = () => {
    const tabs = P.tabs, main = tabs.length > 5 ? tabs.slice(0, 4) : tabs, rest = tabs.length > 5 ? tabs.slice(4) : [];
    const item = (id: string) => `<button class="mi" data-act="tab" data-t="${id}" aria-selected="${S.tab === id}">${svg(id)}<span>${esc(t('tab.' + id))}</span></button>`;
    const more = rest.length ? `<button class="mi" data-act="mmore" aria-selected="${rest.includes(S.tab)}" aria-expanded="${S.mOpen}">${svg('more')}<span>${esc(t('ctl.more'))}</span></button>` : '';
    const menu = rest.length && S.mOpen ? `<div class="mmenu" role="menu">${rest.map(id => `<button class="mr" data-act="tab" data-t="${id}" aria-selected="${S.tab === id}">${svg(id, 20)}<span>${esc(t('tab.' + id))}</span></button>`).join('')}</div>` : '';
    return main.map(item).join('') + more + menu;
  };

  function header(st: DashState) {
    const tabs = P.tabs.map(id => `<button role="tab" data-act="tab" data-t="${id}" aria-selected="${S.tab === id}">${esc(t('tab.' + id))}</button>`).join('');
    const when = st.mtime ? new Date(st.mtime).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const per = ['overview', 'spending', 'wealth', 'home'].includes(S.tab) && st.data;
    const opt = (sel: number) => MFULL.slice(0, NM).map((m, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${esc(m)}</option>`).join('');
    const sel = (act: string, label: string, opts: [string, string][], cur: string) => `<label>${esc(label)} <select data-act="${act}">${opts.map(o => `<option value="${esc(o[0])}" ${cur === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
    let extra = '';
    if (st.data) {
      if (per) extra += `<label>${esc(t('ctl.from'))} <select data-act="from">${opt(S.from)}</select></label><label>${esc(t('ctl.to'))} <select data-act="to">${opt(S.to)}</select></label>`;
      if (S.tab === 'income') {
        const ys = incYears();
        extra += sel('iy0', t('ctl.yearFrom'), ys.map(y => [String(y), String(y)] as [string, string]), String(S.iy0 ?? ys[0]))
          + sel('iy1', t('ctl.yearTo'), ys.map(y => [String(y), String(y)] as [string, string]), String(S.iy1 ?? YEAR));
      }
      if (hasFilter()) extra += `<button class="chip" data-act="reset">${esc(t('ctl.reset'))}</button>`;
    }
    const hasCtl = !!st.data && (per || (ooP && ['overview', 'spending'].includes(S.tab)) || S.tab === 'income');
    return `${topHtml(st)}<div class="brand"><nav class="tabs" role="tablist">${tabs}</nav>
      <div class="asof" title="${when ? esc(t('status.updated', { when })) : ''}"><span>${st.loading ? esc(t('status.loading')) : when ? esc(t('status.updated', { when })) : ''}</span>${st.data ? `<span class="psum">${per ? esc(MFULL[S.from - 1].slice(0, 3) + '–' + MFULL[S.to - 1].slice(0, 3)) : ''}</span><div class="seg vseg" role="group" aria-label="${esc(t('ctl.view'))}"><button data-act="view" data-v="c" aria-pressed="${!S.table}">${esc(t('ctl.charts'))}</button><button data-act="view" data-v="t" aria-pressed="${S.table}">${esc(t('ctl.tables'))}</button></div>${hasCtl ? ib('fopen', 'filter', t('ctl.filters'), S.fOpen, hasFilter()) : ''}${ib('hide', S.hide ? 'eyeoff' : 'eye', t(S.hide ? 'ctl.showAmt' : 'ctl.hideAmt'), S.hide)}${ib('reload', 'refresh', t('ctl.refresh'))}${ctx.prefs ? ib('prefs', 'gear', t('ctl.custom')) : ''}` : ''}<button class="chip" data-act="hide" aria-pressed="${S.hide}" title="${esc(t('ctl.hideTip'))}">${esc(t(S.hide ? 'ctl.showAmt' : 'ctl.hideAmt'))}</button><button class="chip" data-act="reload">${esc(t('ctl.refresh'))}</button>${ctx.prefs ? `<button class="chip" data-act="prefs" title="${esc(t('ctl.custom'))}" aria-label="${esc(t('ctl.custom'))}">⚙ ${esc(t('ctl.custom'))}</button>` : ''}</div></div>
      ${st.data ? `<div class="ctl bar ${S.fOpen ? 'fo' : ''}"><div class="seg" role="group" aria-label="${esc(t('ctl.view'))}"><button data-act="view" data-v="c" aria-pressed="${!S.table}">${esc(t('ctl.charts'))}</button><button data-act="view" data-v="t" aria-pressed="${S.table}">${esc(t('ctl.tables'))}</button></div>
        ${ooP && ['overview', 'spending'].includes(S.tab) ? `<button class="chip" data-act="oneoff" aria-pressed="${S.oneOff}" title="${esc(oneOffTip())}">${esc(t(S.oneOff ? 'ctl.oneoff' : 'ctl.oneoffOff'))}</button>` : ''}${extra}</div>` : ''}`;
  }
  function errorHtml(e: { code: string; detail: string }) {
    const k = ['nofile', 'missingSheet', 'missingRow', 'noRows', 'nosheet', 'notconnected', 'auth', 'access', 'net', 'oauth'].includes(e.code) ? e.code : 'read';
    return `<div class="card err"><h2>${esc(t('err.' + k + '.title'))}</h2><p class="sub">${esc(t('err.' + k + '.body', { d: e.detail }))}</p>
      <div class="ctl"><button class="chip" data-act="settings">${esc(t('err.open'))}</button><button class="chip" data-act="reload">${esc(t('err.retry'))}</button></div></div>`;
  }
  root.classList.add('tally');
  const applyHide = () => { root.classList.toggle('ty-hide', !!S.hide); tip.classList.toggle('ty-hide', !!S.hide); };
  applyHide();
  applyLook(root, tip, P);
  const offPrefs = ctx.prefs ? ctx.prefs.onChange(() => {
    const o = P; P = ctx.prefs!.get(); buildFmt(); applyLook(root, tip, P);
    if (o.period !== P.period) { S.from = defFrom(); S.autoTo = true; S.to = NM; }
    if (o.defView !== P.defView) S.table = P.defView === 't';
    if (o.oneOffDefault !== P.oneOffDefault) S.oneOff = P.oneOffDefault;
    if (o.zeroDefault !== P.zeroDefault) S.wz = P.zeroDefault;
    if (o.cmpDefault !== P.cmpDefault) S.wcmp = P.cmpDefault;
    if (o.hideDefault !== P.hideDefault) { S.hide = P.hideDefault; applyHide(); }
    if (o.pageSize !== P.pageSize) S.shown = P.pageSize;
    render();
  }) : () => {};
  root.innerHTML = `<div class="ty-head"></div><nav class="mbar" aria-label="Tally"></nav><div class="ty-main"></div><p class="foot"></p>`;
  const mbarEl = q('.mbar')!, headEl = q('.ty-head')!, mainEl = q('.ty-main')!, footEl = q('.foot')!;
  let lastKey = '', hasData = false;

  const applyHidden = () => {
    const hc = P.hiddenCards, hk = P.hiddenKpis; if (!hc.length && !hk.length) return;
    mainEl.querySelectorAll('.card').forEach(c => { const h = c.querySelector('h2'); if (h && hc.includes(S.tab + '|' + h.textContent)) c.remove(); });
    mainEl.querySelectorAll('.kpi').forEach(k => { const l = k.querySelector('.l'); if (l && hk.includes(S.tab + '|' + l.textContent)) k.remove(); });
  };
  const listItems = () => {
    const cards: Record<string, string[]> = {}, kpis: Record<string, string[]> = {};
    if (!hasData) return { cards, kpis };
    const keep = S.tab;
    TABS.forEach(id => { try { S.tab = id; const tpl = doc.createElement('template'); tpl.innerHTML = BUILD[id](); cards[id] = Array.from(tpl.content.querySelectorAll('.card h2')).map(x => x.textContent || ''); kpis[id] = Array.from(tpl.content.querySelectorAll('.kpi .l')).map(x => x.textContent || ''); } catch { /* tab not buildable */ } });
    S.tab = keep;
    return { cards, kpis };
  };
  let closeDlg: (() => void) | null = null;
  const openDlg = () => {
    if (!ctx.prefs) return; closeDlg?.();
    const pr = ctx.prefs;
    closeDlg = openPrefsDialog({ doc, lang: ctx.lang || (locale.startsWith('it') ? 'it' : 'en'), get: () => pr.get(), set: v => pr.set(v), reset: () => pr.reset(), tabLabel: id => t('tab.' + id), items: listItems });
  };

  function render(keepScroll = true) {
    if (!P.tabs.includes(S.tab)) S.tab = P.tabs[0];
    const st = ctx.getState();
    if (st.data && st.data !== D) { try { prepare(st.data); hasData = true; } catch (e) { hasData = false; } }
    headEl.innerHTML = header(hasData ? st : { ...st, data: null });
    mbarEl.innerHTML = barHtml();
    fitMode();
    if (!st.data && st.error) { mainEl.innerHTML = errorHtml(st.error); footEl.textContent = ''; return; }
    if (!hasData) { mainEl.innerHTML = `<div class="empty">${esc(t('status.loading'))}</div>`; footEl.textContent = ''; return; }
    const scEl = (root.closest('.view-content') || root.parentElement || root) as HTMLElement;
    const sy = scEl.scrollTop;
    if (keepScroll) mainEl.style.minHeight = mainEl.offsetHeight + 'px';
    mainEl.innerHTML = BUILD[S.tab]();
    footEl.textContent = t('foot.src', { f: st.fileName });
    if (S.tab === 'spending') renderMovements();
    applyHidden();
    if (keepScroll) scEl.scrollTop = sy;
    requestAnimationFrame(() => { drawCharts(); if (keepScroll) { scEl.scrollTop = sy; setTimeout(() => { mainEl.style.minHeight = ''; scEl.scrollTop = sy; }, 150); } else mainEl.style.minHeight = ''; });
  }

  /* ----- events (delegated, one set for the whole life of the view) ----- */
  const onClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null; if (!b || !root.contains(b)) return;
    const a = b.dataset.act;
    if (a === 'tab') { S.mOpen = false; S.tab = b.dataset.t; try { window.localStorage.setItem('tally-tab', S.tab); } catch { /* optional */ } S.sel = null; render(false); const sc = (root.closest('.view-content') || root.parentElement) as HTMLElement | null; if (sc) sc.scrollTop = 0; }
    else if (a === 'view') { S.table = b.dataset.v === 't'; render(); }
    else if (a === 'oneoff') { S.oneOff = !S.oneOff; S.shown = P.pageSize; render(); }
    else if (a === 'extra') { S.extra = !S.extra; S.shown = P.pageSize; render(); }
    else if (a === 'amex') { S.amex = !S.amex; S.shown = P.pageSize; render(); }
    else if (a === 'cg') { const k = b.dataset.k!; S.cg = S.cg.includes(k) ? S.cg.filter((x: string) => x !== k) : [...S.cg, k]; S.sub = ''; S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'ivH') { const k = b.dataset.k!; S.ivH = S.ivH.includes(k) ? S.ivH.filter((x: string) => x !== k) : [...S.ivH, k]; render(); }
    else if (a === 'ig') { const k = b.dataset.k!; S.ig = S.ig.includes(k) ? S.ig.filter((x: string) => x !== k) : [...S.ig, k]; render(); }
    else if (a === 'wz') { S.wz = !S.wz; render(); }
    else if (a === 'wcmp') { S.wcmp = !S.wcmp; render(); }
    else if (a === 'wsec') { const k = b.dataset.k!; S.wsec = S.wsec.includes(k) ? S.wsec.filter((x: string) => x !== k) : [...S.wsec, k]; render(); }
    else if (a === 'planreset') { ctx.plan?.set({}); render(); }
    else if (a === 'reset') { resetFilters(); render(); }
    else if (a === 'clear') { S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'more') { S.shown += P.pageSize; renderMovements(); }
    else if (a === 'hide') { S.hide = !S.hide; try { window.localStorage.setItem('tally-hide', S.hide ? '1' : '0'); } catch { /* optional */ } applyHide(); render(); }
    else if (a === 'prefs') openDlg();
    else if (a === 'fopen') { S.fOpen = !S.fOpen; render(); }
    else if (a === 'mmore') { S.mOpen = !S.mOpen; render(); }
    else if (a === 'reload') ctx.reload();
    else if (a === 'settings') ctx.openSettings();
  };
  const onChange = (e: Event) => {
    const el = e.target as HTMLSelectElement; const a = el.dataset?.act;
    if (a === 'from') { S.from = +el.value; if (S.to < S.from) S.to = S.from; S.autoTo = false; S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'to') { S.autoTo = false; S.to = +el.value; if (S.from > S.to) S.from = S.to; S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'sort') { S.sort = el.value; renderMovements(); }
    else if (a === 'sub') { S.sub = el.value; S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'min' || a === 'max') { S[a] = el.value.trim() === '' || isNaN(+el.value) ? '' : String(Math.max(0, +el.value)); S.sel = null; S.shown = P.pageSize; render(); }
    else if (a === 'plan') {
      const k = (el as any).dataset.k as string, raw = (el as any).value as string; const ov = JSON.parse(JSON.stringify(planOv())); ov.items = ov.items || {};
      if (raw.trim() === '' || isNaN(+raw)) { if (k === '_start') delete ov.start; else delete ov.items[k]; } else if (k === '_start') ov.start = +raw; else ov.items[k] = +raw;
      ctx.plan?.set(ov); render();
    }
    else if (a === 'iy0') { S.iy0 = +el.value; render(); }
    else if (a === 'iy1') { S.iy1 = +el.value; render(); }
    else if (a === 'wpos') { const k = (el as any).dataset.k as string; S.wpos = (el as any).checked ? S.wpos.filter((x: string) => x !== k) : [...S.wpos, k]; render(); }
    else if (a === 'ivA' || a === 'ivB') { S[a] = el.value; render(); }
  };
  const onInput = (e: Event) => { const el = e.target as HTMLInputElement; if (el.dataset?.act === 'q') { S.q = el.value; S.shown = P.pageSize; renderMovements(); } };
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
  // Touch screens never fire pointerleave: close the chart tooltip on tap elsewhere, after a short delay, or on scroll.
  let tipT: any;
  const onTapUp = (e: PointerEvent) => { if (e.pointerType === 'mouse') return; clearTimeout(tipT); tipT = setTimeout(hideTip, 2500); };
  const onTapDown = (e: PointerEvent) => { if (e.pointerType !== 'mouse' && !(e.target as Element).closest?.('svg')) hideTip(); };
  const onScrollTip = () => hideTip();
  root.addEventListener('pointerup', onTapUp); root.addEventListener('pointerdown', onTapDown);
  const scroller = root.closest('.view-content') as HTMLElement | null; scroller?.addEventListener('scroll', onScrollTip, { passive: true });

  const navLift = () => {
    root.classList.toggle('ty-hidenav', !!P.hideNav);
    let v = 0;
    const vc = (root.closest('.view-content') || root.parentElement) as HTMLElement | null;
    if (vc && !P.hideNav && root.classList.contains('ty-m')) {
      const vr = vc.getBoundingClientRect();
      // 1) known navbar element(s)
      document.querySelectorAll('.mobile-navbar, .mobile-navbar-actions').forEach(n => { const r = (n as HTMLElement).getBoundingClientRect(); if (r.height > 0 && r.width > 0 && r.top < vr.bottom && r.bottom > vr.top) v = Math.max(v, Math.round(vr.bottom - r.top)); });
      // 2) anything else stacked over the bottom edge of the view (selector-independent)
      try {
        const cx = vr.left + vr.width / 2;
        for (const y of [vr.bottom - 6, vr.bottom - 40]) {
          document.elementsFromPoint(cx, y).forEach(e => {
            if (e === root || vc.contains(e) || e.contains(vc) || e === document.body || e === document.documentElement) return;
            const r = e.getBoundingClientRect(); if (r.height > 0 && r.height < 200 && r.top > vr.top + vr.height / 2) v = Math.max(v, Math.round(vr.bottom - r.top));
          });
        }
      } catch { /* ignore */ }
      v = Math.min(v, 220);
    }
    root.style.setProperty('--ty-nav', v + 'px'); root.classList.toggle('ty-lift', v > 0);
    if (ctx.debug) ctx.debug('navLift v=' + v);
  };
  const fitMode = () => { const w = root.clientWidth; if (w) root.classList.toggle('ty-m', w <= 600); navLift(); };
  const onWin = () => navLift(); window.addEventListener('resize', onWin); const navT = setTimeout(navLift, 400), navT2 = setTimeout(navLift, 1500);
  let lw = 0, rz: any; const ro = new ResizeObserver(() => { const w = root.clientWidth; if (!w || w === lw) return; lw = w; fitMode(); clearTimeout(rz); rz = setTimeout(drawCharts, 80); });
  ro.observe(root);
  // a background refresh that brings the same data must not rebuild the page (it would reset scroll and flicker): update the header only
  let lastD: any = null;
  const off = ctx.onChange(() => {
    const st = ctx.getState();
    if (hasData && st.data && st.data === lastD && !st.error) { headEl.innerHTML = header(st); return; }
    lastD = st.data; lastKey = ''; render();
  });
  render(false); lastD = ctx.getState().data;
  return () => { root.removeEventListener('pointerup', onTapUp); root.removeEventListener('pointerdown', onTapDown); scroller?.removeEventListener('scroll', onScrollTip); clearTimeout(tipT); window.removeEventListener('resize', onWin); clearTimeout(navT); clearTimeout(navT2); off(); offPrefs(); closeDlg?.(); ro.disconnect(); clearTimeout(rz); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); tip.remove(); root.innerHTML = ''; root.classList.remove('tally'); };
}

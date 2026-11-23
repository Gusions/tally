/** User preferences for the dashboard look and behaviour. Stored in the plugin settings (settings.ui). */
export interface Prefs {
  // look
  theme: 'auto' | 'light' | 'dark';
  accent: string; // '' = Obsidian accent
  palette: 'default' | 'cb' | 'mono' | 'warm' | 'pastel' | 'refined' | 'nordic';
  density: 'compact' | 'normal' | 'roomy';
  fontSize: number;
  maxWidth: number; // px, 0 = full width
  chartScale: number; // percent
  cardStyle: 'filled' | 'outline';
  look: 'classic' | 'kith';
  numFont: 'mono' | 'ui';
  radius: number;
  // numbers and dates
  currency: 'EUR' | 'USD' | 'GBP' | 'CHF' | 'none';
  decimals: boolean;
  dateFmt: 'dmy' | 'ymd' | 'mdy';
  // behaviour
  defaultTab: string; // 'last' or a tab id
  tabs: string[]; // visible tabs, in order
  defView: 'c' | 't';
  period: 'ytd' | 'month' | 'last3' | 'last6';
  oneOffDefault: boolean;
  hideDefault: boolean;
  hideNav: boolean;
  zeroDefault: boolean;
  cmpDefault: boolean;
  pageSize: number;
  payDays: number;
  refreshMin: number; // 0 = manual only
  hiddenCards: string[]; // "tab|title"
  hiddenKpis: string[]; // "tab|label"
}

export const ALL_TABS = ['overview', 'spending', 'income', 'wealth', 'invest', 'home', 'payments'];

export const DEFAULT_PREFS: Prefs = {
  theme: 'auto', accent: '', palette: 'default', density: 'normal', fontSize: 14, maxWidth: 1180, chartScale: 100, cardStyle: 'filled', look: 'classic', numFont: 'mono', radius: 8,
  currency: 'EUR', decimals: false, dateFmt: 'dmy',
  defaultTab: 'overview', tabs: ALL_TABS.slice(), defView: 'c', period: 'ytd', oneOffDefault: true, hideDefault: false, hideNav: false, zeroDefault: false, cmpDefault: false,
  pageSize: 40, payDays: 30, refreshMin: 5, hiddenCards: [], hiddenKpis: []
};

const num = (v: any, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const pick = <T extends string>(v: any, ok: readonly T[], d: T): T => (ok as readonly string[]).includes(v) ? v : d;
const strs = (v: any) => Array.isArray(v) ? v.filter(x => typeof x === 'string') as string[] : [];

/** Accepts anything (saved data, an imported file) and returns a complete, valid Prefs. */
export function sanitizePrefs(raw: any): Prefs {
  const r = raw && typeof raw === 'object' ? raw : {};
  const D = DEFAULT_PREFS;
  let tabs = strs(r.tabs).filter(x => ALL_TABS.includes(x)); tabs = tabs.filter((x, i) => tabs.indexOf(x) === i);
  if (!tabs.length) tabs = D.tabs.slice();
  const accent = typeof r.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.accent) ? r.accent : '';
  return {
    theme: pick(r.theme, ['auto', 'light', 'dark'], D.theme), accent, palette: pick(r.palette, ['default', 'cb', 'mono', 'warm', 'pastel', 'refined', 'nordic'], D.palette),
    density: pick(r.density, ['compact', 'normal', 'roomy'], D.density), fontSize: num(r.fontSize, 11, 20, D.fontSize), maxWidth: [0, 900, 1180, 1500].includes(+r.maxWidth) ? +r.maxWidth : D.maxWidth,
    chartScale: num(r.chartScale, 60, 160, D.chartScale), cardStyle: pick(r.cardStyle, ['filled', 'outline'], D.cardStyle), look: pick(r.look, ['classic', 'kith'], D.look), numFont: pick(r.numFont, ['mono', 'ui'], D.numFont), radius: num(r.radius, 0, 20, D.radius),
    currency: pick(r.currency, ['EUR', 'USD', 'GBP', 'CHF', 'none'], D.currency), decimals: r.decimals === true, dateFmt: pick(r.dateFmt, ['dmy', 'ymd', 'mdy'], D.dateFmt),
    defaultTab: r.defaultTab === 'last' || ALL_TABS.includes(r.defaultTab) ? r.defaultTab : D.defaultTab, tabs,
    defView: pick(r.defView, ['c', 't'], D.defView), period: pick(r.period, ['ytd', 'month', 'last3', 'last6'], D.period),
    oneOffDefault: r.oneOffDefault !== false, hideDefault: r.hideDefault === true, hideNav: r.hideNav === true, zeroDefault: r.zeroDefault === true, cmpDefault: r.cmpDefault === true,
    pageSize: num(r.pageSize, 10, 500, D.pageSize), payDays: num(r.payDays, 1, 365, D.payDays), refreshMin: [0, 1, 5, 15, 30, 60].includes(+r.refreshMin) ? +r.refreshMin : D.refreshMin,
    hiddenCards: strs(r.hiddenCards), hiddenKpis: strs(r.hiddenKpis)
  };
}

export const PALETTES: Record<string, string[]> = {
  cb: ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#8c8c3a'],
  mono: ['#1f4e8c', '#3a73b5', '#6aa0d4', '#8fb8de', '#274c77', '#5b8cbf', '#a9c8e8'],
  warm: ['#c8553d', '#f28f3b', '#e0a526', '#8d6a9f', '#588157', '#3a5a40', '#d1495b'],
  pastel: ['#7aa6e8', '#f0a07c', '#7fd1b0', '#f2cd6b', '#eea3c0', '#8ccf7f', '#a69be0'],
  refined: ['#4a6fa0', '#cf7455', '#78a08d', '#d8aa58', '#ae7597', '#5a90a2', '#8a7ca5'],
  nordic: ['#5f7f9f', '#cf9068', '#7fa598', '#c6b25a', '#b18396', '#7794ab', '#8f84a9']
};
export const ACCENTS = ['', '#2a78d6', '#1baf7a', '#eb6834', '#7a5af8', '#e87ba4', '#4b5563'];

const inkOn = (hex: string) => { const n = parseInt(hex.slice(1), 16); const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? '#111111' : '#ffffff'; };

/** Applies the look-related preferences to the dashboard root. */
export function applyLook(root: HTMLElement, tip: HTMLElement | null, p: Prefs) {
  const s = root.style;
  s.fontSize = p.fontSize + 'px';
  s.maxWidth = p.maxWidth ? p.maxWidth + 'px' : 'none';
  s.setProperty('--ty-radius', p.radius + 'px');
  if (p.accent) { s.setProperty('--ty-accent', p.accent); s.setProperty('--ty-accent-ink', inkOn(p.accent)); } else { s.removeProperty('--ty-accent'); s.removeProperty('--ty-accent-ink'); }
  const pal = PALETTES[p.palette];
  for (let i = 0; i < 7; i++) { if (pal) s.setProperty('--s' + (i + 1), pal[i]); else s.removeProperty('--s' + (i + 1)); }
  ['light', 'dark'].forEach(m => root.classList.toggle('ty-theme-' + m, p.theme === m));
  ['compact', 'normal', 'roomy'].forEach(m => root.classList.toggle('ty-d-' + m, p.density === m));
  root.classList.toggle('ty-outline', p.cardStyle === 'outline');
  root.classList.toggle('ty-kith', p.look === 'kith');
  root.classList.toggle('ty-numui', p.numFont === 'ui');
  if (tip) { tip.classList.toggle('ty-theme-dark', p.theme === 'dark'); tip.classList.toggle('ty-theme-light', p.theme === 'light'); const pp = PALETTES[p.palette]; for (let i = 0; i < 7; i++) { if (pp) tip.style.setProperty('--s' + (i + 1), pp[i]); else tip.style.removeProperty('--s' + (i + 1)); } }
}

/* ------------------------------------------------------------------ dialog ------------------------------------------------------------------ */

type L = Record<string, string>;
const TXT: Record<'it' | 'en', L> = {
  it: {
    title: 'Personalizza Tally', close: 'Chiudi', reset: 'Ripristina predefiniti', exp: 'Esporta', imp: 'Importa', expHint: 'Copia questo testo per salvare le tue preferenze. Incollalo qui sotto e premi Importa per ripristinarle.', impOk: 'Preferenze importate.', impBad: 'Testo non valido.',
    s_look: 'Aspetto', s_num: 'Numeri e date', s_beh: 'Comportamento', s_tabs: 'Schede', s_hide: 'Riquadri e indicatori', s_data: 'Preferenze', s_oneoff: 'Spese acquisto casa',
    theme: 'Tema', auto: 'Come Obsidian', light: 'Chiaro', dark: 'Scuro', accent: 'Colore principale', accentDef: 'Obsidian', palette: 'Palette dei grafici', pDefault: 'Predefinita', pCb: 'Accessibile (daltonici)', pMono: 'Blu monocromatica', pWarm: 'Calda', pPastel: 'Pastello', pRefined: 'Raffinata', pNordic: 'Nordica',
    density: 'Densità', dCompact: 'Compatta', dNormal: 'Normale', dRoomy: 'Ampia', fontSize: 'Dimensione del testo', maxWidth: 'Larghezza massima', wFull: 'Tutta la finestra', chartScale: 'Altezza dei grafici', look: 'Stile grafico', lkClassic: 'Classico', lkKith: 'Piatto (come Kith)', cardStyle: 'Stile dei riquadri', csFilled: 'Pieno', csOutline: 'Solo bordo', numFont: 'Carattere dei numeri', nfMono: 'Monospazio', nfUi: 'Come l’interfaccia', radius: 'Angoli arrotondati',
    currency: 'Valuta', cNone: 'Nessun simbolo', decimals: 'Mostra sempre i centesimi', dateFmt: 'Formato data', dmy: 'giorno/mese/anno', ymd: 'anno-mese-giorno', mdy: 'mese/giorno/anno',
    defaultTab: 'Scheda all’apertura', last: 'Ultima usata', defView: 'Vista predefinita', vC: 'Grafici', vT: 'Tabelle', period: 'Periodo predefinito', pYtd: 'Da inizio anno', pMonth: 'Solo il mese corrente', pL3: 'Ultimi 3 mesi', pL6: 'Ultimi 6 mesi',
    oneOffDefault: 'Escludi le spese di acquisto casa all’apertura', hideDefault: 'Importi nascosti all’apertura', hideNav: 'Nascondi la barra di Obsidian in basso (telefono)', zeroDefault: 'Mostra le posizioni a zero', cmpDefault: 'Mostra il confronto con dicembre', pageSize: 'Movimenti per pagina', payDays: 'Giorni per “prossime scadenze”', refresh: 'Aggiornamento automatico', rManual: 'Solo manuale', rMin: 'ogni {n} min', rHour: 'ogni ora',
    tabsHint: 'Scegli quali schede mostrare e in che ordine.', up: 'Su', down: 'Giù', cardsHint: 'Togli la spunta per nascondere un riquadro o un indicatore. I riquadri con nomi che cambiano (per esempio con il mese) possono tornare visibili.', noItems: 'Nessun elemento', empty: 'Apri prima i dati: nessun riquadro da mostrare.'
  },
  en: {
    title: 'Customize Tally', close: 'Close', reset: 'Reset to defaults', exp: 'Export', imp: 'Import', expHint: 'Copy this text to save your preferences. Paste it below and press Import to restore them.', impOk: 'Preferences imported.', impBad: 'Invalid text.',
    s_look: 'Appearance', s_num: 'Numbers and dates', s_beh: 'Behaviour', s_tabs: 'Tabs', s_hide: 'Cards and indicators', s_data: 'Preferences', s_oneoff: 'Home purchase costs',
    theme: 'Theme', auto: 'Like Obsidian', light: 'Light', dark: 'Dark', accent: 'Accent colour', accentDef: 'Obsidian', palette: 'Chart palette', pDefault: 'Default', pCb: 'Colour-blind safe', pMono: 'Blue monochrome', pWarm: 'Warm', pPastel: 'Pastel', pRefined: 'Refined', pNordic: 'Nordic',
    density: 'Density', dCompact: 'Compact', dNormal: 'Normal', dRoomy: 'Roomy', fontSize: 'Text size', maxWidth: 'Maximum width', wFull: 'Full window', chartScale: 'Chart height', look: 'Visual style', lkClassic: 'Classic', lkKith: 'Flat (Kith-like)', cardStyle: 'Card style', csFilled: 'Filled', csOutline: 'Outline only', numFont: 'Number font', nfMono: 'Monospace', nfUi: 'Interface font', radius: 'Corner radius',
    currency: 'Currency', cNone: 'No symbol', decimals: 'Always show cents', dateFmt: 'Date format', dmy: 'day/month/year', ymd: 'year-month-day', mdy: 'month/day/year',
    defaultTab: 'Tab on open', last: 'Last used', defView: 'Default view', vC: 'Charts', vT: 'Tables', period: 'Default period', pYtd: 'Year to date', pMonth: 'Current month only', pL3: 'Last 3 months', pL6: 'Last 6 months',
    oneOffDefault: 'Exclude home purchase costs on open', hideDefault: 'Amounts hidden on open', hideNav: 'Hide Obsidian’s bottom bar (phone)', zeroDefault: 'Show zero positions', cmpDefault: 'Show the comparison with December', pageSize: 'Movements per page', payDays: 'Days for “upcoming payments”', refresh: 'Automatic refresh', rManual: 'Manual only', rMin: 'every {n} min', rHour: 'every hour',
    tabsHint: 'Choose which tabs to show and in what order.', up: 'Up', down: 'Down', cardsHint: 'Untick to hide a card or an indicator. Cards whose names change (for example with the month) may reappear.', noItems: 'Nothing here', empty: 'Load the data first: no cards to list yet.'
  }
};

export interface DialogOpts {
  doc: Document;
  lang: 'it' | 'en';
  get: () => Prefs;
  set: (p: Partial<Prefs>) => void;
  reset: () => void;
  tabLabel: (id: string) => string;
  items: () => { cards: Record<string, string[]>; kpis: Record<string, string[]> };
}

export function openPrefsDialog(o: DialogOpts): () => void {
  const L = TXT[o.lang], doc = o.doc;
  const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  const wrap = doc.createElement('div'); wrap.className = 'tally-modal';
  doc.body.appendChild(wrap);
  let msg = '';
  const opt = (v: string, label: string, cur: string) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const row = (label: string, ctl: string, hint = '') => `<div class="pf-row"><label><span>${esc(label)}</span>${ctl}</label>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  const sel = (k: string, opts: [string, string][], cur: string) => `<select data-k="${k}">${opts.map(x => opt(x[0], x[1], cur)).join('')}</select>`;
  const chk = (k: string, on: boolean) => `<input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}>`;
  const rng = (k: string, v: number, a: number, b: number, st: number, unit: string) => `<span class="pf-rng"><input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${v}"><output>${v}${unit}</output></span>`;

  function body() {
    const p = o.get();
    const accents = ACCENTS.map(c => `<button class="pf-sw ${p.accent === c ? 'on' : ''}" data-accent="${c}" style="background:${c || 'var(--interactive-accent)'}" title="${c || L.accentDef}"></button>`).join('')
      + `<input type="color" data-k="accent" value="${p.accent || '#2a78d6'}" aria-label="${esc(L.accent)}">`;
    const tabsRows = (() => {
      const order = p.tabs.concat(ALL_TABS.filter(x => !p.tabs.includes(x)));
      return order.map((id, i) => `<div class="pf-tab"><label><input type="checkbox" data-tab="${id}" ${p.tabs.includes(id) ? 'checked' : ''}> ${esc(o.tabLabel(id))}</label><span><button data-mv="${id}:-1" ${i === 0 ? 'disabled' : ''} title="${esc(L.up)}">↑</button><button data-mv="${id}:1" ${i === order.length - 1 ? 'disabled' : ''} title="${esc(L.down)}">↓</button></span></div>`).join('');
    })();
    const it = o.items();
    const lists = ALL_TABS.map(id => {
      const cards = it.cards[id] || [], kpis = it.kpis[id] || [];
      if (!cards.length && !kpis.length) return '';
      const li = (kind: string, arr: string[], hidden: string[]) => arr.map(x => { const key = id + '|' + x; return `<label class="pf-li"><input type="checkbox" data-hide="${kind}" data-key="${esc(key)}" ${hidden.includes(key) ? '' : 'checked'}> ${esc(x)}</label>`; }).join('');
      return `<details><summary>${esc(o.tabLabel(id))}</summary>${li('kpi', kpis, p.hiddenKpis)}${li('card', cards, p.hiddenCards)}</details>`;
    }).join('') || `<p class="pf-empty">${esc(L.empty)}</p>`;
    const refreshOpts: [string, string][] = [['0', L.rManual], ['1', L.rMin.replace('{n}', '1')], ['5', L.rMin.replace('{n}', '5')], ['15', L.rMin.replace('{n}', '15')], ['30', L.rMin.replace('{n}', '30')], ['60', L.rHour]];
    return `
      <section><h3>${esc(L.s_look)}</h3>
        ${row(L.theme, sel('theme', [['auto', L.auto], ['light', L.light], ['dark', L.dark]], p.theme))}
        <div class="pf-row"><label><span>${esc(L.accent)}</span><span class="pf-acc">${accents}</span></label></div>
        ${row(L.palette, sel('palette', [['default', L.pDefault], ['cb', L.pCb], ['mono', L.pMono], ['warm', L.pWarm], ['pastel', L.pPastel], ['refined', L.pRefined], ['nordic', L.pNordic]], p.palette))}
        ${row(L.density, sel('density', [['compact', L.dCompact], ['normal', L.dNormal], ['roomy', L.dRoomy]], p.density))}
        ${row(L.fontSize, rng('fontSize', p.fontSize, 11, 20, 1, ' px'))}
        ${row(L.maxWidth, sel('maxWidth', [['900', '900 px'], ['1180', '1180 px'], ['1500', '1500 px'], ['0', L.wFull]], String(p.maxWidth)))}
        ${row(L.chartScale, rng('chartScale', p.chartScale, 60, 160, 5, ' %'))}
        ${row(L.look, sel('look', [['classic', L.lkClassic], ['kith', L.lkKith]], p.look))}
        ${row(L.cardStyle, sel('cardStyle', [['filled', L.csFilled], ['outline', L.csOutline]], p.cardStyle))}
        ${row(L.radius, rng('radius', p.radius, 0, 20, 1, ' px'))}
        ${row(L.numFont, sel('numFont', [['mono', L.nfMono], ['ui', L.nfUi]], p.numFont))}
      </section>
      <section><h3>${esc(L.s_num)}</h3>
        ${row(L.currency, sel('currency', [['EUR', 'EUR €'], ['USD', 'USD $'], ['GBP', 'GBP £'], ['CHF', 'CHF'], ['none', L.cNone]], p.currency))}
        ${row(L.decimals, chk('decimals', p.decimals))}
        ${row(L.dateFmt, sel('dateFmt', [['dmy', L.dmy], ['ymd', L.ymd], ['mdy', L.mdy]], p.dateFmt))}
      </section>
      <section><h3>${esc(L.s_beh)}</h3>
        ${row(L.defaultTab, sel('defaultTab', [['last', L.last], ...ALL_TABS.map(x => [x, o.tabLabel(x)] as [string, string])], p.defaultTab))}
        ${row(L.defView, sel('defView', [['c', L.vC], ['t', L.vT]], p.defView))}
        ${row(L.period, sel('period', [['ytd', L.pYtd], ['month', L.pMonth], ['last3', L.pL3], ['last6', L.pL6]], p.period))}
        ${row(L.oneOffDefault, chk('oneOffDefault', p.oneOffDefault))}
        ${row(L.hideDefault, chk('hideDefault', p.hideDefault))}
        ${row(L.hideNav, chk('hideNav', p.hideNav))}
        ${row(L.zeroDefault, chk('zeroDefault', p.zeroDefault))}
        ${row(L.cmpDefault, chk('cmpDefault', p.cmpDefault))}
        ${row(L.pageSize, `<input type="number" data-k="pageSize" min="10" max="500" step="10" value="${p.pageSize}">`)}
        ${row(L.payDays, `<input type="number" data-k="payDays" min="1" max="365" step="1" value="${p.payDays}">`)}
        ${row(L.refresh, sel('refreshMin', refreshOpts, String(p.refreshMin)))}
      </section>
      <section><h3>${esc(L.s_tabs)}</h3><p class="pf-hint">${esc(L.tabsHint)}</p>${tabsRows}</section>
      <section><h3>${esc(L.s_hide)}</h3><p class="pf-hint">${esc(L.cardsHint)}</p>${lists}</section>
      <section><h3>${esc(L.s_data)}</h3><p class="pf-hint">${esc(L.expHint)}</p>
        <textarea class="pf-json" rows="5" spellcheck="false">${esc(JSON.stringify(p, null, 1))}</textarea>
        <div class="pf-btns"><button data-do="import">${esc(L.imp)}</button><button data-do="reset">${esc(L.reset)}</button></div>
        <p class="pf-msg">${esc(msg)}</p>
      </section>`;
  }

  function draw() {
    const prev = wrap.querySelector('.pf-body') as HTMLElement | null, top = prev ? prev.scrollTop : 0;
    const openD = Array.from(wrap.querySelectorAll('details')).map(d => d.open);
    wrap.innerHTML = `<div class="pf-back"></div><div class="pf-dlg tally-modal-card" role="dialog" aria-modal="true" aria-label="${esc(L.title)}"><div class="pf-top"><h2>${esc(L.title)}</h2><button data-do="close" aria-label="${esc(L.close)}">✕</button></div><div class="pf-body">${body()}</div></div>`;
    const b = wrap.querySelector('.pf-body') as HTMLElement; b.scrollTop = top;
    wrap.querySelectorAll('details').forEach((d, i) => { if (openD[i]) (d as HTMLDetailsElement).open = true; });
  }
  draw();

  const close = () => { wrap.remove(); doc.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  doc.addEventListener('keydown', onKey, true);

  wrap.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('pf-back')) return close();
    const act = t.closest('[data-do]') as HTMLElement | null;
    if (act) {
      const d = act.dataset.do;
      if (d === 'close') return close();
      if (d === 'reset') { o.reset(); msg = ''; return draw(); }
      if (d === 'import') {
        try { const v = JSON.parse((wrap.querySelector('.pf-json') as HTMLTextAreaElement).value); o.set(sanitizePrefs(v)); msg = L.impOk; } catch { msg = L.impBad; }
        return draw();
      }
    }
    const acc = t.closest('[data-accent]') as HTMLElement | null;
    if (acc) { o.set({ accent: acc.dataset.accent || '' }); return draw(); }
    const mv = t.closest('[data-mv]') as HTMLElement | null;
    if (mv) {
      const [id, dir] = mv.dataset.mv!.split(':'); const p = o.get();
      const order = p.tabs.concat(ALL_TABS.filter(x => !p.tabs.includes(x))); const i = order.indexOf(id), j = i + +dir;
      if (j >= 0 && j < order.length) { [order[i], order[j]] = [order[j], order[i]]; o.set({ tabs: order.filter(x => p.tabs.includes(x)) }); }
      return draw();
    }
  });

  wrap.addEventListener('change', (e: Event) => {
    const el = e.target as HTMLInputElement;
    const p = o.get();
    if (el.dataset.tab) {
      const order = p.tabs.concat(ALL_TABS.filter(x => !p.tabs.includes(x)));
      const vis = order.filter(x => x === el.dataset.tab ? el.checked : p.tabs.includes(x));
      o.set({ tabs: vis.length ? vis : p.tabs }); return draw();
    }
    if (el.dataset.hide) {
      const key = el.dataset.key!; const f = el.dataset.hide === 'kpi' ? 'hiddenKpis' : 'hiddenCards';
      const cur = (p as any)[f] as string[]; o.set({ [f]: el.checked ? cur.filter(x => x !== key) : [...cur, key] } as any); return;
    }
    const k = el.dataset.k; if (!k) return;
    let v: any = el.type === 'checkbox' ? el.checked : el.value;
    if (['fontSize', 'chartScale', 'radius', 'maxWidth', 'pageSize', 'payDays', 'refreshMin'].includes(k)) v = Number(v);
    o.set({ [k]: v } as any); draw();
  });
  wrap.addEventListener('input', (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.type === 'range' && el.dataset.k) { const out = el.parentElement?.querySelector('output'); const unit = el.dataset.k === 'chartScale' ? ' %' : ' px'; if (out) out.textContent = el.value + unit; o.set({ [el.dataset.k]: Number(el.value) } as any); }
    if (el.type === 'color' && el.dataset.k === 'accent') o.set({ accent: el.value });
  });
  return close;
}

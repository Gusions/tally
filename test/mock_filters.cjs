const Module = require('module');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const BASE = '/tmp/claude-0/-home-claude/0f3c19af-0fe7-51b1-ac5c-1b32f4b40d74/scratchpad/';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.HTMLElement = dom.window.HTMLElement;
global.ResizeObserver = class { observe() {} disconnect() {} };
global.requestAnimationFrame = f => setTimeout(f, 0);
global.innerWidth = 1200; global.innerHeight = 900;
const P = dom.window.HTMLElement.prototype;
P.createDiv = function () { const d = document.createElement('div'); this.appendChild(d); return d; };
P.addClass = function (c) { this.classList.add(c); };
P.empty = function () { this.innerHTML = ''; };

class TFile { constructor(path, buf) { this.path = path; this.name = path.split('/').pop(); this.extension = path.split('.').pop(); this.stat = { mtime: Date.now() }; this.parent = { path: path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/' }; this.buf = buf; } }
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this.cmds = []; this.blocks = {}; this.views = {}; this.events = []; this.tabs = []; this.ribbon = []; }
  addCommand(c) { this.cmds.push(c); } addRibbonIcon(i, t, f) { this.ribbon.push([i, t, f]); } registerView(t, f) { this.views[t] = f; }
  registerMarkdownCodeBlockProcessor(l, f) { this.blocks[l] = f; } registerEvent(e) { this.events.push(e); } addSettingTab(t) { this.tabs.push(t); }
  registerInterval(id) { return id; } async loadData() { return null; } async saveData(d) { this.saved = d; global.__saved = d && d.plan; global.__ui = d && d.ui; }
}
class ItemView { constructor(leaf) { this.leaf = leaf; this.contentEl = document.createElement('div'); document.body.appendChild(this.contentEl); } }
class MarkdownRenderChild { constructor(el) { this.el = el; } }
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = document.createElement('div'); } }
class Setting { constructor(el) { this.el = el; el.__settings = (el.__settings || []); el.__settings.push(this); }
  setName(n) { this.name = n; return this; } setDesc(d) { return this; }
  addDropdown(f) { const d = { opts: [], addOption(k, v) { this.opts.push([k, v]); return this; }, setValue(v) { this.v = v; return this; }, onChange(fn) { this.fn = fn; return this; } }; f(d); this.dd = d; return this; }
  addText(f) { const x = { setPlaceholder() { return this; }, setValue(v) { this.v = v; return this; }, onChange(fn) { this.fn = fn; return this; } }; f(x); this.tx = x; return this; } }
class Notice { constructor(m) { Notice.last = m; } }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), 5); }; };
const Platform = { isMobile: false };
const fake = { Platform, Plugin, ItemView, MarkdownRenderChild, PluginSettingTab, Setting, Notice, TFile, WorkspaceLeaf: class {}, App: class {}, debounce, moment: { locale: () => 'it' }, normalizePath: p => p.replace(/\/+/g, '/') };
const orig = Module._load;
Module._load = function (req, ...r) { return req === 'obsidian' ? fake : orig.call(this, req, ...r); };

(async () => {
  const buf1 = fs.readFileSync(BASE + 'src/money.xlsx');
  const file = new TFile('Finanze/Money Tools 2026.xlsx');
  let current = fs.readFileSync(process.env.XF); const handlers = {};
  const created = {};
  const app = { vault: { adapter: { exists: async()=>true, list: async d => d==='' ? {files:[],folders:['Finanze']} : {files:['Finanze/Money Tools 2026.xlsx'],folders:[]}, readBinary: async () => current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength), stat: async()=>({mtime:Date.now()}) }, getFiles: () => [new TFile('Notes/a.md')], getAbstractFileByPath: p => p === file.path ? file : created[p] || null,
      readBinary: async () => current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength),
      on: (ev, fn) => { handlers[ev] = fn; return { ev }; },
      create: async (p, c) => { const f = new TFile(p); f.content = c; created[p] = f; return f; } },
    workspace: { getLeavesOfType: () => [], detachLeavesOfType() {}, getLeaf: () => ({ openFile: async f => { app.opened = f; }, setViewState: async () => {} }), revealLeaf() {} } };
  const mod = require(BASE + 'tally/main.js');
  const TallyPlugin = mod.default;
  const p = new TallyPlugin(app, { id: 'tally' });
  await p.onload();
  console.log('commands:', p.cmds.map(c => c.id).join(','), '| ribbon:', p.ribbon.length, '| view registered:', Object.keys(p.views).join(','), '| block:', Object.keys(p.blocks).join(','), '| events:', p.events.map(e => e.ev).join(','));
  // code block inside a note
  const el = document.createElement('div'); document.body.appendChild(el);
  let child; p.blocks['tally']('tab: spending', el, { addChild: c => { child = c; } });
  await new Promise(r => setTimeout(r, 400));
  console.log('block rendered KPIs:', [...el.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)).slice(0, 2));
  console.log('block opened on tab:', el.querySelector('[aria-selected="true"]').textContent, '| footer:', el.querySelector('.foot').textContent);

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const kp = () => [...el.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim().slice(0, 48));
  const sel = (act, val) => { const s = el.querySelector(`select[data-act="${act}"]`); if (!s) throw new Error('no select ' + act); s.value = val; s.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const inp = (act, val) => { const s = el.querySelector(`input[data-act="${act}"]`); if (!s) throw new Error('no input ' + act); s.value = val; s.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const click = sel2 => { const b = el.querySelector(sel2); if (!b) throw new Error('no ' + sel2); b.click(); };
  const tab = async t => { click(`[data-act="tab"][data-t="${t}"]`); await wait(60); };
  const ctls = () => [...el.querySelectorAll('.bar [data-act]')].map(x => x.dataset.act + (x.dataset.k ? ':' + x.dataset.k : '')).join(',');
  await tab('spending'); console.log('SPENDING ctl:', ctls()); console.log(' base:', kp()[0], '|', kp()[1]);
  sel('from', '3'); sel('to', '5'); console.log(' period 3-5:', kp()[0]);
  click('[data-act="cg"][data-k="casa"]'); await wait(30); console.log(' hide casa:', kp()[0], '| subs:', [...el.querySelectorAll('select[data-act="sub"] option')].length);
  click('[data-act="cg"][data-k="spesa"]'); await wait(30); console.log(' hide casa+spesa:', kp()[0]);
  click('[data-act="reset"]'); await wait(30); sel('from','3'); sel('to','5'); inp('min', '100'); console.log(' min 100:', kp()[0], '| rows:', el.querySelectorAll('#mov tbody tr').length);
  inp('max', '300'); console.log(' 100-300:', kp()[0]);
  click('[data-act="reset"]'); await wait(30); console.log(' reset:', kp()[0], '| reset chip gone:', !el.querySelector('[data-act="reset"]'));
  await tab('overview'); console.log('OVERVIEW ctl:', ctls()); const lines0 = el.querySelectorAll('[data-ch="trend"] svg circle, [data-ch="trend"] svg path').length;
  sel('from', '4'); sel('to', '8'); await wait(100); console.log(' where sub:', el.querySelector('.grid .card.w7:nth-of-type(3) .sub, .grid .card:nth-of-type(3) .sub')?.textContent, '| trend labels:', [...el.querySelectorAll('[data-ch="trend"] .ax')].map(x => x.textContent).slice(0, 8).join(' '));
  console.log('HIDE btn:', !!el.querySelector('[data-act="hide"]')); el.querySelector('[data-act="hide"]').click(); await wait(30); console.log(' hidden class:', !!el.querySelector('.tally.ty-hide') || el.classList.contains('ty-hide'), el.querySelector('[data-act="hide"]').textContent); el.querySelector('[data-act="hide"]').click(); await wait(30); console.log(' back:', el.querySelector('[data-act="hide"]').textContent);
  await tab('income'); console.log('INCOME ctl:', ctls()); console.log(' base:', kp().slice(0, 4).join(' | '));
  console.log(' sources total row:', [...el.querySelectorAll('.card:last-child tbody tr:last-child td')].map(x=>x.textContent).join('=')); console.log(' no Dipendente:', kp().slice(0, 4).join(' | '), '| sources rows:', el.querySelectorAll('.card:last-child tbody tr').length);
  sel('iy0', String(new Date().getFullYear())); console.log(' year 2026 only:', kp()[0]);
  await tab('income'); const kq=()=>[...el.querySelectorAll('.kpis > *')].map(x=>x.textContent.replace(/\s+/g,' ')).join(' || '); console.log('INC default:', kq()); sel('iy0','2019'); sel('iy1','2019'); console.log('INC 2019:', kq(), '| cards:', [...el.querySelectorAll('.card h2')].map(x=>x.textContent).join(',')); sel('iy0','2024'); sel('iy1','2025'); console.log('INC 24-25:', kq()); el.querySelector('[data-act="reset"]').click(); await wait(30);
  await tab('wealth'); console.log('WEALTH chips:', [...el.querySelectorAll('.tgl [data-act]')].map(x=>x.textContent).join(' | ')); console.log(' head:', [...el.querySelectorAll('.card .tbl thead th')].map(x=>x.textContent).join('|'), 'rows', el.querySelectorAll('.card .tbl tbody tr').length, 'hasRelai', el.textContent.includes('Relai')); const wz=el.querySelector('[data-act="wz"]'); wz.click(); await wait(30); console.log(' +zero rows', el.querySelectorAll('.card .tbl tbody tr').length, 'hasRelai', el.textContent.includes('Relai')); el.querySelector('[data-act="wz"]').click(); await wait(30); el.querySelector('[data-act="wcmp"]').click(); await wait(30); console.log(' nocmp heads:', [...el.querySelectorAll('.card .tbl thead')].map(h=>[...h.querySelectorAll('th')].map(x=>x.textContent).join('|')).join(' // ')); el.querySelector('[data-act="wcmp"]').click(); await wait(30); console.log(' monitor heads:', [...el.querySelectorAll('.card .tbl thead')].map(h=>[...h.querySelectorAll('th')].map(x=>x.textContent).join('|')).join(' // ')); console.log('WEALTH ctl:', ctls()); const rows0 = el.querySelectorAll('.card .tbl tbody tr').length;
  const first = el.querySelector('[data-act="wsec"]'); first.click(); await wait(30); console.log(' hide section', first.dataset.k, '-> rows', rows0, '->', el.querySelectorAll('.card .tbl tbody tr').length);
  const cbs = el.querySelectorAll('input[data-act="wpos"]'); const totRow = () => [...el.querySelectorAll('.card .tbl tbody tr:last-child td')].map(x => x.textContent).join('|');
  console.log(' checkboxes:', cbs.length, '| total row before:', [...el.querySelectorAll('.card .tbl')][1] ? '' : '', totRow());
  cbs[0].checked = false; cbs[0].dispatchEvent(new window.Event('change', { bubbles: true })); await wait(30);
  const tr = [...el.querySelectorAll('.card')].find(c => /osition|osizion/.test(c.querySelector('h2').textContent)).querySelectorAll('tbody tr'); console.log(' after unchecking first: dimmed cells', el.querySelectorAll('.dim').length, '| total row:', [...tr[tr.length - 1].querySelectorAll('td')].map(x => x.textContent).join('|'));
  await tab('invest'); console.log('INVEST ctl:', ctls()); console.log(' base:', kp().slice(0, 2).join(' | '));
  const tk = [...el.querySelectorAll('[data-act="ivH"]')].map(o => o.dataset.k); click('[data-act="ivH"][data-k="' + tk[0] + '"]'); await wait(30); console.log(' hide ticker', tk[0], 'of', tk.join(','), ':', kp().slice(0, 2).join(' | '));
  inp('ivA', '2026-06-01'); console.log(' from june:', kp().slice(0, 2).join(' | '));
  await tab('home'); console.log('HOME ctl:', ctls()); await tab('overview'); console.log('oneoff on overview:', !!el.querySelector('[data-act="oneoff"]')); await tab('wealth'); console.log('oneoff on wealth:', !!el.querySelector('[data-act="oneoff"]')); await tab('home'); sel('from', '2'); console.log(' home period ok, cost chart present:', !!el.querySelector('[data-ch="hcost"]'));

  await tab('home'); console.log('HOME tabs:', [...el.querySelectorAll('[data-act="tab"]')].map(x => x.textContent).join(' | '));
  console.log(' home cards:', [...el.querySelectorAll('.card h2')].map(h => h.textContent).join(' | '));
  const pk = () => [...el.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)); console.log(' home kpis:', pk().join(' || '));
  const planCard = () => [...el.querySelectorAll('.card')].find(c => /recap|Recap/.test(c.querySelector('h2').textContent));
  console.log(' plan rows:', [...planCard().querySelectorAll('tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' / '));
  const edit = (k, v) => { const i = el.querySelector('input[data-act="plan"][data-k="' + k + '"]'); i.value = v; i.dispatchEvent(new window.Event('change', { bubbles: true })); };
  edit('_start', '3500'); edit('mortage', '900'); await wait(40);
  console.log(' after edit (start 3500, mortgage 900):', [...planCard().querySelectorAll('tbody tr')].slice(-3).map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' / '), '| saved:', JSON.stringify(global.__saved));
  click('[data-act="planreset"]'); await wait(40); console.log(' reset ->', [...planCard().querySelectorAll('tbody tr')].slice(-3).map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' / '));
  await tab('payments'); console.log('PAYMENTS kpis:', pk().join(' || ')); console.log(' cards:', [...el.querySelectorAll('.card h2')].map(h => h.textContent).join(' | '), '| rows:', el.querySelectorAll('.card tbody tr').length);
  // ---- phone: not connected to Google, but the desktop left a cache copy ----
  { const keepS = { ...p.settings }; Platform.isMobile = true; p.settings.source = 'google'; p.settings.refreshToken = ''; p.settings.sheetUrl = 'https://docs.google.com/spreadsheets/d/abc123def456ghi789jkl/edit'; p.settings.clientId = 'x'; p.settings.clientSecret = 'y';
    await p.store.load(); console.log('MOBILE no token + cache -> data:', !!p.store.state.data, 'error:', p.store.state.error && p.store.state.error.code);
    Platform.isMobile = false; await p.store.load(); console.log('DESKTOP no token -> data:', !!p.store.state.data, 'error:', p.store.state.error && p.store.state.error.code);
    Object.assign(p.settings, keepS); await p.store.load(); console.log('restored local -> data:', !!p.store.state.data); }
  // ---- customisation dialog ----
  await tab('overview'); const RT = () => el.classList.contains('tally') ? el : (el.querySelector('.tally') || el);
  click('[data-act="prefs"]'); await wait(40);
  const dlg = () => document.querySelector('.tally-modal');
  console.log('PREFS dialog open:', !!dlg(), '| sections:', [...dlg().querySelectorAll('h3')].map(h => h.textContent).join(' / '), '| details:', dlg().querySelectorAll('details').length);
  const setv = async (k, v, ev = 'change') => { const i = dlg().querySelector('[data-k="' + k + '"]'); if (i.type === 'checkbox') i.checked = v; else i.value = v; i.dispatchEvent(new window.Event(ev, { bubbles: true })); await wait(40); };
  const kp0 = () => [...el.querySelectorAll('.kpi .v')].map(x => x.textContent).join(' | ');
  console.log(' before:', kp0());
  await setv('currency', 'USD'); console.log(' USD:', kp0());
  await setv('decimals', true); console.log(' decimals:', kp0());
  await setv('currency', 'none'); await setv('decimals', false); console.log(' none:', kp0());
  await setv('currency', 'EUR');
  await setv('fontSize', '17', 'input'); console.log(' font:', RT().style.fontSize, '| theme dark:'); await setv('theme', 'dark'); console.log('  class:', RT().classList.contains('ty-theme-dark'));
  await setv('theme', 'auto'); await setv('density', 'compact'); console.log(' density compact class:', RT().classList.contains('ty-d-compact'));
  await setv('palette', 'cb'); console.log(' palette --s1:', RT().style.getPropertyValue('--s1'));
  dlg().querySelector('[data-accent="#1baf7a"]').click(); await wait(40); console.log(' accent:', RT().style.getPropertyValue('--ty-accent'));
  await setv('chartScale', '150', 'input');
  // hide a tab and a card
  const tabsBefore = [...el.querySelectorAll('nav.tabs button')].map(b => b.textContent).join(',');
  dlg().querySelector('[data-tab="invest"]').checked = false; dlg().querySelector('[data-tab="invest"]').dispatchEvent(new window.Event('change', { bubbles: true })); await wait(40);
  console.log(' tabs:', tabsBefore, '->', [...el.querySelectorAll('nav.tabs button')].map(b => b.textContent).join(','));
  const cb = dlg().querySelector('input[data-hide="card"]'); const key = cb.dataset.key; cb.checked = false; cb.dispatchEvent(new window.Event('change', { bubbles: true })); await wait(40);
  console.log(' hid card', key, '-> present:', [...el.querySelectorAll('.card h2')].some(h => key.endsWith('|' + h.textContent)));
  const kb = dlg().querySelector('input[data-hide="kpi"]'); const kk = kb.dataset.key; kb.checked = false; kb.dispatchEvent(new window.Event('change', { bubbles: true })); await wait(40);
  console.log(' hid kpi', kk, '-> present:', [...el.querySelectorAll('.kpi .l')].some(h => kk.endsWith('|' + h.textContent)));
  await setv('period', 'last3'); console.log(' period last3: from=', el.querySelector('select[data-act="from"]').value, 'to=', el.querySelector('select[data-act="to"]').value);
  await setv('payDays', '60'); console.log(' payDays:', [...el.querySelectorAll('.card h2')].map(h => h.textContent).filter(x => /scad|Upcom/i.test(x)).join(), '| sub:', [...el.querySelectorAll('.card .sub')].map(x => x.textContent).filter(x => /giorni|days/.test(x)).join());
  console.log(' saved ui:', JSON.stringify(global.__ui).slice(0, 220));
  dlg().querySelector('[data-do="reset"]').click(); await wait(40);
  console.log(' after reset: tabs', [...el.querySelectorAll('nav.tabs button')].length, '| font', RT().style.fontSize, '| class compact:', RT().classList.contains('ty-d-compact'));
  dlg().querySelector('[data-do="close"]').click(); console.log(' closed:', !dlg());
  child.onunload(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });

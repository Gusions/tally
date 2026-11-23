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
  registerInterval(id) { return id; } async loadData() { return null; } async saveData(d) { this.saved = d; }
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
const fake = { Plugin, ItemView, MarkdownRenderChild, PluginSettingTab, Setting, Notice, TFile, WorkspaceLeaf: class {}, App: class {}, debounce, moment: { locale: () => 'it' }, normalizePath: p => p.replace(/\/+/g, '/') };
const orig = Module._load;
Module._load = function (req, ...r) { return req === 'obsidian' ? fake : orig.call(this, req, ...r); };

(async () => {
  const buf1 = fs.readFileSync(BASE + 'src/money.xlsx');
  const file = new TFile('Finanze/Money Tools 2026.xlsx');
  let current = fs.readFileSync('/tmp/xlsout/money.xls'); const handlers = {};
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
  // file modified on disk -> debounced reload
  current = fs.readFileSync(BASE + 'src/money_mod.xlsx'); file.stat.mtime += 1000;
  handlers['modify'](file); await new Promise(r => setTimeout(r, 400));
  console.log('after modify:', [...el.querySelectorAll('.kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim().slice(0, 40))[1]);
  // unrelated file does not reload
  const before = p.store.state; handlers['modify'](new TFile('x.md')); await new Promise(r => setTimeout(r, 100)); console.log('unrelated modify ignored:', before === p.store.state);
  // view
  const view = p.views['tally-dashboard']({}); await view.onOpen(); await new Promise(r => setTimeout(r, 200));
  console.log('view type/text/icon:', view.getViewType(), view.getDisplayText(), view.getIcon(), '| kpis in view:', view.contentEl.querySelectorAll('.kpi').length);
  await view.onClose(); console.log('view closed, tooltips left:', document.querySelectorAll('.tally-tip').length, '(block still mounted: 1 expected)');
  child.onunload(); console.log('block unloaded, tooltips left:', document.querySelectorAll('.tally-tip').length);
  // create note command
  await p.cmds.find(c => c.id === 'create-note').callback(); await new Promise(r => setTimeout(r, 50));
  console.log('note created:', Object.keys(created), JSON.stringify(created['Finanze/Dashboard.md']?.content), '| notice:', Notice.last);
  // settings
  const tab = p.tabs[0]; tab.display(); const ss = tab.containerEl.__settings.map(s => s.name); console.log('settings:', ss.join(' | '));
  const dd = tab.containerEl.__settings[0].dd; console.log('file dropdown options:', JSON.stringify(dd.opts));
  // missing file
  p.settings.filePath = 'nope.xlsx'; await p.store.load(); console.log('missing file ->', JSON.stringify(p.store.state.error));
  p.settings.filePath = ''; p.settings.language = 'en'; await p.store.load(); console.log('auto again ->', p.store.state.error, '| lang:', p.lang());
})().catch(e => { console.error('FAIL', e); process.exit(1); });

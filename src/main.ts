import { sanitizePrefs, DEFAULT_PREFS, type Prefs } from './prefs';
import { App, ItemView, Platform, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, debounce, moment, normalizePath } from 'obsidian';
import * as XLSX from 'xlsx/dist/xlsx.full.min.js';
import { parseWorkbook, SheetError } from './parser';
import { mountDashboard, DashCtx, DashState } from './dashboard';
import { makeT, Lang } from './i18n';
import { GoogleError, connect, extractFileId, fetchSheet } from './google';

const VIEW_TYPE = 'tally-dashboard';
const EXT = /^(xlsx|xls|xlsm)$/i;

interface TallySettings {
  filePath: string; // '' = automatic
  language: 'auto' | Lang;
  oneOff: string; // "Primary/Secondary" category of the expense that can be excluded
  noteName: string;
  source: 'local' | 'google';
  sheetUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  plan: any;
  ui: any;
}
const DEFAULTS: TallySettings = { filePath: '', language: 'auto', oneOff: 'Housing/Forniture', noteName: 'Dashboard', source: 'local', sheetUrl: '', clientId: '', clientSecret: '', refreshToken: '', plan: {}, ui: {} };

class Store {
  state: DashState = { data: null, error: null, loading: false, mtime: 0, fileName: '' };
  private subs = new Set<() => void>();
  private started = false;
  private token = 0;
  constructor(private plugin: TallyPlugin) {}

  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.subs.forEach(f => f()); }

  async resolveFile(): Promise<{ path: string; name: string } | null> {
    const { adapter } = this.plugin.app.vault;
    const p = this.plugin.settings.filePath;
    if (p) {
      const np = normalizePath(p);
      return (await adapter.exists(np)) ? { path: np, name: np.split('/').pop()! } : null;
    }
    const xs = await this.plugin.listXlsx();
    const hit = xs.find(x => /money/i.test(x.split('/').pop()!));
    return hit ? { path: hit, name: hit.split('/').pop()! } : null;
  }

  ensure() { if (!this.started) { this.started = true; void this.load(); } }

  lastLoad = 0;

  private async fromVault(): Promise<{ buf: ArrayBuffer; name: string; mtime: number } | null> {
    const file = await this.resolveFile();
    if (!file) return null;
    const { adapter } = this.plugin.app.vault;
    const buf = await adapter.readBinary(file.path);
    const st = await adapter.stat(file.path);
    return { buf, name: file.name, mtime: st?.mtime ?? 0 };
  }

  private sig = '';

  private cachePath() { return normalizePath(this.plugin.manifest.dir + '/cache.xlsx'); }

  /** null buf = the sheet did not change since the last read. */
  private async fromGoogle(): Promise<{ buf: ArrayBuffer | null; name: string; mtime: number; offline?: boolean }> {
    const s = this.plugin.settings;
    const id = extractFileId(s.sheetUrl);
    if (!id) throw new SheetError('nosheet', '');
    const { adapter } = this.plugin.app.vault;
    if (!s.clientId || !s.clientSecret || !s.refreshToken) {
      // phone/tablet: Google can only be linked from the desktop app; until the token syncs, show the copy the desktop saved
      if (Platform.isMobile && await adapter.exists(this.cachePath())) {
        const st = await adapter.stat(this.cachePath());
        return { buf: await adapter.readBinary(this.cachePath()), name: this.state.fileName || 'Google Sheets', mtime: st?.mtime ?? 0 };
      }
      throw new SheetError('notconnected', '');
    }
    try {
      // Drive's modifiedTime lags behind edits in Google Sheets by minutes, so never skip the download on it
      const known = 0;
      const r = await fetchSheet({ clientId: s.clientId, clientSecret: s.clientSecret, refreshToken: s.refreshToken }, id, known);
      if (r.buf) { try { await adapter.writeBinary(this.cachePath(), r.buf); } catch { /* cache is optional */ } }
      return { buf: r.buf, name: r.name, mtime: r.modified };
    } catch (e: any) {
      if (e instanceof GoogleError && e.code === 'net' && await adapter.exists(this.cachePath())) {
        const st = await adapter.stat(this.cachePath());
        return { buf: await adapter.readBinary(this.cachePath()), name: this.state.fileName || 'Google Sheets', mtime: st?.mtime ?? 0, offline: true };
      }
      if (e instanceof GoogleError) throw new SheetError(e.code, e.detail);
      throw e;
    }
  }

  async load() {
    this.started = true;
    this.lastLoad = Date.now();
    const my = ++this.token;
    this.state = { ...this.state, loading: true };
    this.emit();
    // stale-while-revalidate: paint the saved copy at once, refresh from Google in the background
    if (this.plugin.settings.source === 'google' && !this.state.data) {
      try {
        const { adapter } = this.plugin.app.vault;
        if (await adapter.exists(this.cachePath())) {
          const buf = await adapter.readBinary(this.cachePath());
          const st = await adapter.stat(this.cachePath());
          const u = new Uint8Array(buf); let h = 2166136261 >>> 0; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; }
          const data = parseWorkbook(XLSX, XLSX.read(buf, { type: 'array' }));
          if (my === this.token) {
            this.sig = u.length + ':' + h;
            this.state = { data, error: null, loading: true, mtime: st?.mtime ?? 0, fileName: this.state.fileName || 'Google Sheets' };
            this.emit();
          }
        }
      } catch { /* cache unreadable: fall through to the network */ }
    }
    let next: DashState;
    try {
      const src: any = this.plugin.settings.source === 'google' ? await this.fromGoogle() : await this.fromVault();
      if (!src) next = { data: null, error: { code: 'nofile', detail: '' }, loading: false, mtime: 0, fileName: '' };
      else if (src.buf === null && this.state.data) next = { ...this.state, loading: false };
      else {
        const sig = (() => { const u = new Uint8Array(src.buf); let h = 2166136261 >>> 0; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return u.length + ':' + h; })();
        if (this.state.data && sig === this.sig && !src.offline) { if (my === this.token) { this.state = { ...this.state, loading: false, error: null }; this.emit(); } return; }
        this.sig = sig;
        const wb = XLSX.read(src.buf, { type: 'array' });
        const data = parseWorkbook(XLSX, wb);
        next = { data, error: null, loading: false, mtime: src.mtime, fileName: src.name };
        if (src.offline) new Notice(this.plugin.t()('notice.offline'));
      }
    } catch (e: any) {
      const code = e instanceof SheetError ? e.code : 'read';
      const detail = e instanceof SheetError ? e.detail : String(e?.message ?? e);
      next = { data: null, error: { code, detail }, loading: false, mtime: 0, fileName: '' };
    }
    if (my !== this.token) return; // a newer load is running
    this.state = next;
    this.emit();
  }
}

class TallyView extends ItemView {
  private destroy: (() => void) | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: TallyPlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Tally'; }
  getIcon() { return 'wallet'; }
  async onOpen() {
    this.contentEl.addClass('tally-view');
    this.destroy = mountDashboard(this.contentEl.createDiv(), this.plugin.makeCtx());
    this.plugin.store.ensure();
    if (this.plugin.settings.source === 'google' && Date.now() - this.plugin.store.lastLoad > 60000) void this.plugin.store.load();
  }
  async onClose() { this.destroy?.(); this.destroy = null; }
}

export default class TallyPlugin extends Plugin {
  settings: TallySettings = { ...DEFAULTS };
  store!: Store;

  lang(): Lang {
    if (this.settings.language !== 'auto') return this.settings.language;
    return String(moment.locale()).toLowerCase().startsWith('it') ? 'it' : 'en';
  }
  t() { return makeT(this.lang()); }

  /** Small log next to the plugin files: lets a failure on a phone be read from the computer. */
  private async dbg(line: string) {
    try {
      const f = normalizePath(this.manifest.dir + '/tally-debug.log');
      const ad: any = this.app.vault.adapter;
      let prev = ''; try { if (await ad.exists(f)) prev = (await ad.read(f)).split('\n').slice(-40).join('\n') + '\n'; } catch { /* first line */ }
      await ad.write(f, prev + new Date().toISOString() + ' [' + (Platform.isMobile ? 'mobile' : 'desktop') + (Platform.isIosApp ? '/ios' : '') + '] v' + this.manifest.version + ' ' + line);
    } catch { /* logging is best effort */ }
  }

  prefListeners = new Set<() => void>();
  prefs(): Prefs { return sanitizePrefs(this.settings.ui); }
  setPrefs(p: Partial<Prefs>, replace = false) {
    this.settings.ui = sanitizePrefs(replace ? p : { ...this.prefs(), ...p });
    void this.saveSettings();
    this.prefListeners.forEach(f => { try { f(); } catch (e) { console.error('[Tally] prefs listener', e); } });
  }

  makeCtx(tab?: string): DashCtx {
    return {
      t: this.t(),
      locale: this.lang() === 'it' ? 'it-IT' : 'en-GB',
      oneOff: this.settings.oneOff,
      getState: () => this.store.state,
      onChange: fn => this.store.subscribe(fn),
      reload: () => { const before = this.store.state.data; void this.store.load().then(() => { const st = this.store.state; if (!st.error) new Notice(this.t()(st.data !== before ? 'notice.updated' : 'notice.same')); }); },
      plan: { get: () => this.settings.plan || {}, set: (v: any) => { this.settings.plan = v; void this.saveSettings(); } },
      openSettings: () => { const s = (this.app as any).setting; s?.open?.(); s?.openTabById?.(this.manifest.id); },
      prefs: {
        get: () => this.prefs(),
        set: (p: Partial<Prefs>) => this.setPrefs(p),
        reset: () => this.setPrefs(DEFAULT_PREFS, true),
        onChange: (fn: () => void) => { this.prefListeners.add(fn); return () => { this.prefListeners.delete(fn); }; }
      },
      lang: this.lang(), debug: (s: string) => { if (Platform.isMobile) void this.dbg(s); },
      tab
    };
  }

  async onload() {
    let stage = 'start';
    if (Platform.isMobile) void this.dbg('onload start | ' + navigator.userAgent);
    try {
      await this.onloadInner((x: string) => { stage = x; });
      console.log('[Tally] loaded');
      if (Platform.isMobile) void this.dbg('loaded ok');
    } catch (e: any) {
      console.error('[Tally] failed at stage "' + stage + '"', e);
      void this.dbg('FAILED at stage "' + stage + '": ' + String(e?.message ?? e) + ' | ' + String(e?.stack ?? '').split('\n').slice(0, 4).join(' / '));
      new Notice('Tally: ' + stage + ': ' + String(e?.message ?? e), 15000);
      throw e;
    }
  }

  private async onloadInner(mark: (s: string) => void) {
    mark('settings');
    await this.loadSettings();
    mark('store');
    this.store = new Store(this);
    const t = this.t();
    mark('view');

    this.registerView(VIEW_TYPE, leaf => new TallyView(leaf, this));
    mark('ribbon-and-commands');
    this.addRibbonIcon('wallet', t('cmd.open'), () => { void this.activateView(); });
    this.addCommand({ id: 'open-dashboard', name: t('cmd.open'), callback: () => { void this.activateView(); } });
    this.addCommand({ id: 'create-note', name: t('cmd.note'), callback: () => { void this.createNote(); } });
    this.addCommand({ id: 'reload', name: t('cmd.reload'), callback: () => { void this.store.load(); } });

    mark('code-block');
    this.registerMarkdownCodeBlockProcessor('tally', (src, el, ctx) => {
      const tab = /tab:\s*(\w+)/i.exec(src)?.[1]?.toLowerCase();
      const destroy = mountDashboard(el.createDiv(), this.makeCtx(tab));
      const child = new MarkdownRenderChild(el);
      child.onunload = destroy;
      ctx.addChild(child);
      this.store.ensure();
    });

    mark('settings-tab');
    this.addSettingTab(new TallySettingTab(this.app, this));
    mark('vault-events');

    this.watchSelf();

    // The xlsx is the single source of truth: reload whenever it changes on disk.
    const reload = debounce(() => { if (this.settings.source === 'local') void this.store.load(); }, 800, true);
    this.registerInterval(window.setInterval(() => { const m = this.prefs().refreshMin; if (m > 0 && this.settings.source === 'google' && this.store.state.data && Date.now() - this.store.lastLoad >= m * 60 * 1000 - 5000) void this.store.load(); }, 60 * 1000));
    const relevant = (f: any) => f instanceof TFile && EXT.test(f.extension);
    this.registerEvent((this.app.vault as any).on('raw', (path: string) => { if (EXT.test(String(path).split('.').pop()!)) reload(); }));
    this.registerEvent(this.app.vault.on('modify', f => { if (relevant(f)) reload(); }));
    this.registerEvent(this.app.vault.on('create', f => { if (relevant(f)) reload(); }));
    this.registerEvent(this.app.vault.on('delete', f => { if (relevant(f)) reload(); }));
    this.registerEvent(this.app.vault.on('rename', f => { if (relevant(f)) reload(); }));
  }

  /** All .xlsx paths in the vault, including files Obsidian does not index (default setting). */
  async listXlsx(): Promise<string[]> {
    const { vault } = this.app;
    const out = new Set<string>(vault.getFiles().filter(f => EXT.test(f.extension)).map(f => f.path));
    const walk = async (dir: string, depth: number) => {
      if (depth > 6) return;
      let l: { files: string[]; folders: string[] };
      try { l = await vault.adapter.list(dir); } catch { return; }
      l.files.forEach(f => { if (EXT.test(f.split('.').pop()!)) out.add(f); });
      for (const d of l.folders) { if (!d.split('/').pop()!.startsWith('.')) await walk(d, depth + 1); }
    };
    await walk('', 0);
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  /** Reload this plugin whenever its own main.js is replaced on disk (so updates apply without restarting Obsidian). */
  private watchSelf() {
    try {
      const req = (window as any).require; const base = (this.app.vault.adapter as any).getBasePath?.();
      if (!req || !base || !this.manifest.dir) return;
      const fs = req('fs'), path = req('path');
      const file = path.join(base, this.manifest.dir, 'main.js');
      const first = fs.statSync(file).mtimeMs;
      let last = first, timer: any = null;
      const w = fs.watch(file, () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const m = fs.statSync(file).mtimeMs; if (m === last) return; last = m;
            const plugins = (this.app as any).plugins;
            await plugins.disablePlugin(this.manifest.id); await plugins.enablePlugin(this.manifest.id);
            new Notice('Tally: aggiornato / updated');
          } catch (e) { console.error('[Tally] reload failed', e); }
        }, 1500);
      });
      this.register(() => { clearTimeout(timer); w.close(); });
    } catch (e) { console.warn('[Tally] self-watch unavailable', e); }
  }

  onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = workspace.getLeaf(true); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    workspace.revealLeaf(leaf);
  }

  async createNote() {
    const f = this.settings.source === 'google' ? null : await this.store.resolveFile();
    if (!f && this.settings.source !== 'google') { new Notice(this.t()('notice.noFile')); return; }
    const folder = f && f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    const name = (this.settings.noteName || 'Dashboard').replace(/[\\/:*?"<>|]/g, '').trim() || 'Dashboard';
    const path = normalizePath((folder ? folder + '/' : '') + name + '.md');
    let n = this.app.vault.getAbstractFileByPath(path);
    if (!n) { n = await this.app.vault.create(path, '```tally\n```\n'); new Notice(this.t()('notice.noteCreated', { p: path })); }
    if (n instanceof TFile) await this.app.workspace.getLeaf(true).openFile(n);
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULTS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
  rebuildViews() { this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(l => (l as any).rebuildView?.()); }
}

class TallySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TallyPlugin) { super(app, plugin); }
  display() {
    const { containerEl } = this; containerEl.empty();
    const p = this.plugin, t = p.t();

    new Setting(containerEl).setName(t('set.source')).setDesc(t('set.sourceDesc')).addDropdown(d => {
      d.addOption('local', t('set.srcLocal')).addOption('google', t('set.srcGoogle'));
      d.setValue(p.settings.source).onChange(async v => { p.settings.source = v as any; await p.saveSettings(); void p.store.load(); this.display(); });
    });
    if (p.settings.source === 'local') {
      new Setting(containerEl).setName(t('set.file')).setDesc(t('set.fileDesc')).addDropdown(d => {
        d.addOption('', t('set.auto'));
        if (p.settings.filePath) d.addOption(p.settings.filePath, p.settings.filePath);
        d.setValue(p.settings.filePath);
        void p.listXlsx().then(xs => {
          xs.forEach(x => { if (x !== p.settings.filePath) d.addOption(x, x); });
          d.setValue(p.settings.filePath);
        });
        d.onChange(async v => { p.settings.filePath = v; await p.saveSettings(); void p.store.load(); });
      });
    } else {
      new Setting(containerEl).setName(t('set.sheet')).setDesc(t('set.sheetDesc')).addText(x => {
        x.setPlaceholder('https://docs.google.com/spreadsheets/d/…').setValue(p.settings.sheetUrl).onChange(async v => { p.settings.sheetUrl = v.trim(); await p.saveSettings(); });
      });
      new Setting(containerEl).setName(t('set.clientId')).setDesc(t('set.clientDesc')).addText(x => {
        x.setValue(p.settings.clientId).onChange(async v => { p.settings.clientId = v.trim(); await p.saveSettings(); });
      });
      new Setting(containerEl).setName(t('set.clientSecret')).addText(x => {
        x.inputEl.type = 'password';
        x.setValue(p.settings.clientSecret).onChange(async v => { p.settings.clientSecret = v.trim(); await p.saveSettings(); });
      });
      const connected = !!p.settings.refreshToken;
      if (Platform.isMobile) new Setting(containerEl).setName(t('set.account')).setDesc(connected ? t('set.connected') : t('set.mobileNote'));
      else new Setting(containerEl).setName(t('set.account')).setDesc(connected ? t('set.connected') : t('set.notConnected'))
        .addButton(btn => btn.setButtonText(connected ? t('set.reconnect') : t('set.connect')).setCta().onClick(async () => {
          if (!p.settings.clientId || !p.settings.clientSecret) { new Notice(t('notice.needClient')); return; }
          try {
            new Notice(t('notice.browser'));
            p.settings.refreshToken = await connect(p.settings.clientId, p.settings.clientSecret, u => window.open(u));
            await p.saveSettings();
            new Notice(t('notice.connected'));
            void p.store.load(); this.display();
          } catch (e: any) { new Notice('Tally: ' + String(e?.detail || e?.message || e), 10000); }
        }))
        .addButton(btn => btn.setButtonText(t('set.disconnect')).setDisabled(!connected).onClick(async () => {
          p.settings.refreshToken = ''; await p.saveSettings(); this.display();
        }));
    }
    new Setting(containerEl).setName(t('set.lang')).setDesc(t('set.langDesc')).addDropdown(d => {
      d.addOption('auto', t('set.langAuto')).addOption('it', 'Italiano').addOption('en', 'English');
      d.setValue(p.settings.language).onChange(async v => { p.settings.language = v as any; await p.saveSettings(); p.rebuildViews(); this.display(); });
    });
    new Setting(containerEl).setName(t('set.oneoff')).setDesc(t('set.oneoffDesc')).addText(x => {
      x.setPlaceholder('Housing/Forniture').setValue(p.settings.oneOff).onChange(async v => { p.settings.oneOff = v.trim(); await p.saveSettings(); p.rebuildViews(); });
    });
    new Setting(containerEl).setName(t('set.note')).setDesc(t('set.noteDesc')).addText(x => {
      x.setPlaceholder('Dashboard').setValue(p.settings.noteName).onChange(async v => { p.settings.noteName = v; await p.saveSettings(); });
    });
  }
}

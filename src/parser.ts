/* Reads the "Money Tools" workbook (already parsed by SheetJS) into the data the dashboard needs.
   Nothing here is stored: the xlsx in the vault stays the single source of truth. */

export interface Section { name: string; rows: string[] }

export interface Data {
  year: number;
  expenses: [number, number, string, number, string, string, number, number][]; // month, day, name, amount, primary, secondary, extra, amex
  overview: Record<string, (number | null)[]>; // 13 values: previous year-end, Jan..Dec
  sections: Section[];
  giacenze: { years: number[]; saldo: number[]; media: number[] };
  btc: { buys: number[][]; spent: number; sold: number; sellDate: string; sellPrice: number };
  house: { costs: [string, number][]; total: number };
  housePlan: { items: [string, number][]; actual: number; saving: number };
  sell: [string, number, number, number][]; // scenario key, price, proceeds, net
  trades: [string, string, string, number, number][]; // iso date, asset, ticker, amount, fee
  scheduled: [string, number, string][]; // iso date, amount, what
  income: Record<string, Record<string, number>>; // group -> yyyy-mm -> amount
  sources: [string, number, string][]; // label, total, group
  avgIncome: number;
  daily: Record<string, number[]>; // month -> [budget, spent, vault]
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: any): number => {
  if (v == null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace('€', '').trim();
  if (s === '' || s === '-') return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const isSerial = (v: any) => typeof v === 'number' && v > 40000 && v < 60000;
const ser2d = (s: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(s * 864e5));
const iso = (s: number) => ser2d(s).toISOString().slice(0, 10);
const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

export class SheetError extends Error {
  constructor(public code: string, public detail: string) { super(code + ': ' + detail); }
}

export function parseWorkbook(XLSX: any, wb: any): Data {
  const sheet = (frag: string, optional = false): any[][] => {
    const n = wb.SheetNames.find((x: string) => norm(x).includes(frag));
    if (!n) {
      if (optional) return [];
      throw new SheetError('missingSheet', frag);
    }
    return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  };
  const bool = (v: any) => (v === true || v === 'TRUE' || v === 'true') ? 1 : 0;

  const daily = sheet('daily spending', true);
  const tabYears: number[] = [];
  wb.SheetNames.forEach((n: string) => { const m = /^\s*(\d{4})\s+expenses/i.exec(n); if (m) tabYears.push(+m[1]); });
  const nowY = new Date().getFullYear();
  const tabYear = tabYears.includes(nowY) ? nowY : tabYears.length ? Math.max(...tabYears) : nowY;
  const year = daily.length && typeof daily[0][0] === 'number' && daily[0][0] > 2000 && daily[0][0] < 2200
    ? daily[0][0] : tabYear;
  const D: Data = {
    year, expenses: [], overview: {}, sections: [], giacenze: { years: [], saldo: [], media: [] },
    btc: { buys: [], spent: 0, sold: 0, sellDate: '', sellPrice: 0 }, house: { costs: [], total: 0 },
    housePlan: { items: [], actual: 0, saving: 0 }, sell: [], trades: [], scheduled: [], income: {},
    sources: [], avgIncome: 0, daily: {}
  };

  // expenses (required)
  sheet(String(year) + ' expenses').slice(1).forEach(r => {
    if (typeof r[0] !== 'number' || typeof r[3] !== 'number') return;
    D.expenses.push([r[0], r[1], String(r[2] == null ? '' : r[2]).trim(), round2(r[3]), r[4], r[5], bool(r[6]), bool(r[8])]);
  });
  if (!D.expenses.length) throw new SheetError('noRows', year + ' Expenses');

  // overview (required): header rows (no numbers) open a section
  let cur: Section | null = null;
  sheet('overview').slice(1).forEach(r => {
    if (r[0] == null) return;
    let key = String(r[0]).trim();
    if (!D.overview['Somma'] && /^(somma|total|sum)$/i.test(key)) key = 'Somma';
    const vals = r.slice(1, 14).map((v: any) => typeof v === 'number' ? round2(v) : null);
    while (vals.length < 13) vals.push(null);
    if (!vals.some((v: any) => v != null)) {
      cur = { name: key, rows: [] };
      D.sections.push(cur);
      return;
    }
    D.overview[key] = vals;
    if (!cur) { cur = { name: '', rows: [] }; D.sections.push(cur); }
    cur.rows.push(key);
  });
  if (!D.overview['Somma']) throw new SheetError('missingRow', 'Overview / Total (or Somma)');

  // average and year-end balances
  const g = sheet('giacenze', true);
  if (g.length > 2) {
    for (let c = 1; c < g[0].length; c++) {
      const y = g[0][c];
      if (typeof y === 'number' && y > 2000) {
        D.giacenze.years.push(y);
        D.giacenze.saldo.push(round2(num(g[1][c])));
        D.giacenze.media.push(round2(num(g[2][c])));
      }
    }
  }

  // closed bitcoin position
  const rec: Record<string, any> = {};
  sheet('closed btc', true).slice(1).forEach(r => {
    if (typeof r[0] === 'number' && typeof r[1] === 'number' && typeof r[4] === 'number') D.btc.buys.push([r[0], r[1], r[2], r[3], r[4]]);
    if (typeof r[6] === 'string') rec[r[6].trim().toLowerCase()] = r[7];
  });
  D.btc.spent = num(rec['spent']);
  D.btc.sold = num(rec['actual price']);
  D.btc.sellDate = isSerial(rec['data of selling']) ? iso(rec['data of selling']) : '';
  D.btc.sellPrice = num(rec['btc price of selling']);

  // home
  const h = sheet('house recap', true);
  const ti = h.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'total');
  if (ti >= 0) {
    D.house.total = num(h[ti][1]);
    for (let i = 1; i < ti; i++) if (h[i][0] && typeof h[i][1] === 'number') D.house.costs.push([String(h[i][0]).trim(), h[i][1]]);
    const pi = h.findIndex((r, i) => i > ti && String(r[0] || '').trim().toLowerCase() === 'mortage');
    for (let i = pi; i >= 0 && i < h.length; i++) {
      const l = String(h[i][0] || '').trim().toLowerCase();
      if (l === 'actual') { D.housePlan.actual = num(h[i][1]); continue; }
      if (l === 'saving') { D.housePlan.saving = num(h[i][1]); break; }
      if (l && typeof h[i][1] === 'number') D.housePlan.items.push([l, h[i][1]]);
    }
  }
  h.forEach(r => {
    const l = String(r[0] || '').trim().toLowerCase();
    if (l.startsWith('sell price')) D.sell.push([l.split('-').pop()!.trim(), num(r[1]), num(r[2]), num(r[3])]);
  });

  // trade republic purchases
  sheet('investing', true).forEach(r => {
    if (isSerial(r[1]) && typeof r[4] === 'number' && typeof r[3] === 'string') D.trades.push([iso(r[1]), r[2], r[3], round2(r[4]), num(r[5])]);
  });

  // scheduled payments
  (sheet('pagamenti', true).length ? sheet('pagamenti', true) : sheet('scheduled payments', true)).forEach(r => {
    if (isSerial(r[0])) D.scheduled.push([iso(r[0]), round2(num(r[1])), r[2]]);
  });

  // income
  const inc = sheet('income', true);
  if (inc.length) {
    const cols: [number, number, number][] = [];
    inc[0].forEach((hd: any, i: number) => {
      if (i < 2) return;
      if (isSerial(hd)) { const d = ser2d(hd); cols.push([i, d.getUTCFullYear(), d.getUTCMonth() + 1]); }
      else if (typeof hd === 'string' && /^\d{4}\/\d+$/.test(hd.trim())) { const p = hd.trim().split('/'); cols.push([i, +p[0], +p[1]]); }
    });
    const grp: Record<string, Record<string, number>> = {};
    for (let i = 1; i < inc.length; i++) {
      const label = String(inc[i][0] || '').trim();
      if (!label) continue;
      if (/^total(e)?\b/i.test(label)) break;
      const gname = /P\.IVA|^freelance/i.test(label) ? 'P.IVA' : /Dipendente|^employee/i.test(label) ? 'Dipendente' : /^(naspi|unemployment)/i.test(label) ? 'NASpI' : 'Altro';
      let rowTot = 0;
      cols.forEach(([c, y, m]) => {
        const v = num(inc[i][c]);
        if (v) {
          rowTot += v;
          const k = y + '-' + String(m).padStart(2, '0');
          grp[gname] = grp[gname] || {};
          grp[gname][k] = (grp[gname][k] || 0) + v;
        }
      });
      // the per-source total is the sum of its months: the sheet's own "Totale" cell can be stale
      D.sources.push([label, round2(cols.length ? rowTot : num(inc[i][1])), gname]);
    }
    Object.keys(grp).forEach(k => { D.income[k] = {}; Object.keys(grp[k]).forEach(m => D.income[k][m] = round2(grp[k][m])); });
    const ai = inc.findIndex(r => String(r[0] || '').toLowerCase().includes('average income'));
    D.avgIncome = ai >= 0 && inc[ai + 1] && typeof inc[ai + 1][0] === 'number' ? round2(inc[ai + 1][0]) : 0;
  }

  // daily budget
  const agg: Record<number, number[]> = {};
  daily.forEach(r => {
    if (isSerial(r[0])) {
      const d = ser2d(r[0]);
      if (d.getUTCFullYear() !== year) return;
      const m = d.getUTCMonth() + 1;
      agg[m] = agg[m] || [0, 0, 0];
      agg[m][0] += num(r[1]); agg[m][1] += num(r[2]); agg[m][2] += num(r[3]);
    }
  });
  Object.keys(agg).forEach(m => D.daily[m] = agg[+m].map(round2));
  return D;
}

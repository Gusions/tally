"""Builds the Tally spreadsheet templates (empty + demo). Run: python3 build_template.py"""
import random, datetime as dt, subprocess, shutil, os
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter as L

YEAR = 2026
MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
# Entry (what you type in the expenses tab) -> Primary -> Secondary. Edit freely.
MAP = [
 ('rent','Housing','Rent'),('condo fees','Housing','CondoFees'),('internet','Housing','Internet'),('electricity','Housing','Electricity'),
 ('gas','Housing','Gas'),('phone','Housing','Phone'),('home insurance','Housing','Insurance'),('furniture','Housing','Furniture'),('cleaning','Housing','Cleaning'),
 ('restaurant','Out','Restaurants'),('dinner','Out','Restaurants'),('bar','Out','Bar'),('coffee','Out','Bar'),('food delivery','Out','Delivery'),('takeaway','Out','Delivery'),
 ('supermarket','Groceries','Supermarket'),('groceries','Groceries','Supermarket'),('market','Groceries','Market'),
 ('metro','Transport','PublicTransport'),('train ticket','Transport','PublicTransport'),('fuel','Transport','Fuel'),('taxi','Transport','Taxi'),('car sharing','Transport','CarSharing'),
 ('flight','Travel','Flights'),('hotel','Travel','Hotels'),('holiday train','Travel','Trains'),
 ('doctor','Health','Doctors'),('pharmacy','Health','Pharmacy'),('gym','Health','Sport'),('barber','Health','PersonalCare'),
 ('gift','Gifts','Gifts'),('clothes','Clothing','Clothing'),('shoes','Clothing','Clothing'),
 ('bank fee','Fees','BankFees'),('broker fee','Fees','BrokerFees'),('stamps','Fees','OtherFees'),
 ('cash withdrawal','OtherExpenses','Unknown'),('misc','OtherExpenses','Unknown'),
]
PRIMARIES = ['Housing','Out','Groceries','Transport','Travel','Health','Gifts','Clothing','Fees','OtherExpenses']
SECONDARIES = sorted({m[2] for m in MAP})
HEAD = Font(bold=True); FILL = PatternFill('solid', fgColor='EEF1F6'); NOTE = Font(italic=True, color='666666')
MAXROW = 1500

def hdr(ws, row, vals, col=1):
    for i, v in enumerate(vals):
        c = ws.cell(row, col + i, v); c.font = HEAD; c.fill = FILL

def build(demo, path):
    wb = Workbook()
    # ---- Start here
    s = wb.active; s.title = 'Start here'
    lines = [
     ('Tally spreadsheet template', HEAD),
     ('', None),
     ('1. Categories: edit the list of entries and categories. The expenses tab uses it to fill Primary and Secondary for you.', None),
     (f'2. {YEAR} Expenses: type month, day, expense name and amount. Primary and Secondary appear by themselves. Type over them to override.', None),
     (f'   {YEAR} Category: monthly totals per primary and secondary category, built automatically (needs no typing).', None),
     ('3. Overview: once a month, type the balance of each account. Keep the row named "Total" (it adds up your liquidity).', None),
     ('4. Investing Trades: one row per purchase (date, asset, ticker, amount, fee).', None),
     ('5. Income History and Scheduled Payments are optional.', None),
     ('', None),
     ('New year: rename the expenses tab (for example "2027 Expenses"). The year is read from the tab name.', NOTE),
     ('Do not rename the other tabs or the "Total" row. Section titles in Overview are recognised by their words: deposit, invest, monitor, amex, unclaimed.', NOTE),
     ('Primary categories Tally knows: ' + ', '.join(PRIMARIES) + '. Any other name is counted under "Other expenses and fees".', NOTE),
    ]
    for i, (t, f) in enumerate(lines, 1):
        c = s.cell(i, 1, t)
        if f: c.font = f
    s.column_dimensions['A'].width = 130

    # ---- Categories
    c = wb.create_sheet('Categories')
    hdr(c, 1, ['Entry', 'Primary', 'Secondary']); hdr(c, 1, ['Primary', 'Secondary'], 5)
    for i, (e, p, sc) in enumerate(MAP, 2):
        c.cell(i, 1, e); c.cell(i, 2, p); c.cell(i, 3, sc)
    for i, p in enumerate(PRIMARIES, 2): c.cell(i, 5, p)
    for i, sc in enumerate(SECONDARIES, 2): c.cell(i, 6, sc)
    c['H1'] = 'Add your own entries in the first block (case does not matter). The two lists on the right feed the drop-down menus.'; c['H1'].font = NOTE
    for col, w in zip('ABCEF', (26, 16, 18, 16, 18)): c.column_dimensions[col].width = w
    c.freeze_panes = 'A2'

    # ---- Expenses
    e = wb.create_sheet(f'{YEAR} Expenses')
    hdr(e, 1, ['M', 'D', 'Expense', 'Amount', 'Primary', 'Secondary', 'Extra?', 'Note', 'Amex'])
    for r in range(2, MAXROW + 1):
        e.cell(r, 5, f'=IF(C{r}="","",IFERROR(INDEX(Categories!$B$2:$B$400,MATCH(TRIM(C{r}),Categories!$A$2:$A$400,0)),"OtherExpenses"))')
        e.cell(r, 6, f'=IF(C{r}="","",IFERROR(INDEX(Categories!$C$2:$C$400,MATCH(TRIM(C{r}),Categories!$A$2:$A$400,0)),"Unknown"))')
    dv1 = DataValidation(type='list', formula1='=Categories!$E$2:$E$60', allow_blank=True, showErrorMessage=False)
    dv2 = DataValidation(type='list', formula1='=Categories!$F$2:$F$200', allow_blank=True, showErrorMessage=False)
    e.add_data_validation(dv1); e.add_data_validation(dv2)
    dv1.add(f'E2:E{MAXROW}'); dv2.add(f'F2:F{MAXROW}')
    for col, w in zip('ABCDEFGHI', (5, 5, 24, 11, 16, 18, 8, 30, 7)): e.column_dimensions[col].width = w
    e.freeze_panes = 'A2'

    # ---- Category summary (Primary/Secondary x months), like the original "<year> Category" tab
    g = wb.create_sheet(f'{YEAR} Category')
    hdr(g, 1, ['Primary', 'Secondary'] + MONTHS + ['Total'])
    X = f"'{YEAR} Expenses'"
    r = 2; prim_rows = []
    for pr in PRIMARIES:
        secs = []
        for _, p_, s_ in MAP:
            if p_ == pr and s_ not in secs: secs.append(s_)
        g.cell(r, 1, pr).font = HEAD; prim_rows.append(r)
        for j in range(12):
            g.cell(r, 3 + j, f'=SUMIFS({X}!$D$2:$D${MAXROW},{X}!$E$2:$E${MAXROW},$A{r},{X}!$A$2:$A${MAXROW},{j + 1})').font = HEAD
        g.cell(r, 15, f'=SUM(C{r}:N{r})').font = HEAD
        for c_ in range(1, 16): g.cell(r, c_).fill = FILL
        r += 1
        for sc in secs:
            g.cell(r, 2, sc)
            for j in range(12):
                g.cell(r, 3 + j, f'=SUMIFS({X}!$D$2:$D${MAXROW},{X}!$E$2:$E${MAXROW},$A${prim_rows[-1]},{X}!$F$2:$F${MAXROW},$B{r},{X}!$A$2:$A${MAXROW},{j + 1})')
            g.cell(r, 15, f'=SUM(C{r}:N{r})')
            r += 1
    g.cell(r, 1, 'Total Spent').font = HEAD
    for j in range(13):
        cl = L(3 + j); g.cell(r, 3 + j, '=' + '+'.join(f'{cl}{x}' for x in prim_rows)).font = HEAD
    tot = r; r += 1
    g.cell(r, 1, 'Income').font = HEAD
    for j in range(12): g.cell(r, 3 + j, f"=IFERROR('Income History'!{L(3 + j)}4,0)")
    g.cell(r, 15, f'=SUM(C{r}:N{r})'); inc = r; r += 1
    g.cell(r, 1, 'Savings').font = HEAD
    for j in range(13): g.cell(r, 3 + j, f'={L(3 + j)}{inc}-{L(3 + j)}{tot}')
    g.cell(r + 2, 1, 'Fills itself from the expenses tab. A secondary category you add in "Categories" needs a new row here: copy any secondary row under its primary and change column B.').font = NOTE
    for row in g.iter_rows(min_row=2, max_row=r, min_col=3, max_col=15):
        for c_ in row: c_.number_format = '#,##0.00;-#,##0.00;"-"'
    g.column_dimensions['A'].width = 16; g.column_dimensions['B'].width = 18
    for j in range(13): g.column_dimensions[L(3 + j)].width = 10
    g.freeze_panes = 'C2'

    # ---- Overview
    o = wb.create_sheet('Overview')
    hdr(o, 1, ['Account', YEAR - 1] + MONTHS)
    rnd = random.Random(7)
    def acct(row, name, start, drift, demo_months=10):
        o.cell(row, 1, name)
        for j in range(13):
            col = 2 + j
            if not demo: o.cell(row, col, 0 if j == 0 else None); continue
            if j <= demo_months:
                start_v = start + drift * j + rnd.uniform(-1, 1) * abs(drift) * 0.8
                o.cell(row, col, round(start_v, 2))
    rows = [
     ('sec', 'Cash - Liquidity'),
     ('acct', 'Main account', 4200, 180), ('acct', 'Savings account', 6500, 120),
     ('sum',), ('growth',),
     ('sec', 'Amex Spending'),
     ('acct', 'Credit card', 700, 15),
     ('sec', 'Savings deposit'),
     ('acct', 'Fixed-term deposit', 8000, 25),
     ('sec', 'Investments'),
     ('acct', 'Broker', 1200, 150), ('acct', 'Crypto', 400, 30),
     ('sec', 'Monitoring'),
     ('acct', 'Pension fund', 5200, 90), ('acct', 'Company shares', 3000, 60),
     ('sec', 'Unclaimed'),
     ('acct', 'Expenses to be refunded', 150, 0),
    ]
    r = 2; acc_first = None; acc_last = None
    for item in rows:
        if item[0] == 'sec': o.cell(r, 1, item[1]).font = HEAD
        elif item[0] == 'acct':
            if acc_first is None: acc_first = r
            acct(r, item[1], item[2], item[3]); acc_last = r
            if item[1] == 'Savings account': sav = r
        elif item[0] == 'sum':
            sum_row = r; o.cell(r, 1, 'Total').font = HEAD
            for j in range(13):
                cl = L(2 + j); o.cell(r, 2 + j, f'=IF(COUNT({cl}{acc_first}:{cl}{sav})=0,"",SUM({cl}{acc_first}:{cl}{sav}))')
        elif item[0] == 'growth':
            o.cell(r, 1, 'Growth MoM €')
            for j in range(1, 13):
                cl, pl = L(2 + j), L(1 + j); o.cell(r, 2 + j, f'=IF(OR({cl}{sum_row}="",{pl}{sum_row}=""),0,{cl}{sum_row}-{pl}{sum_row})')
        r += 1
    o.column_dimensions['A'].width = 26
    o.freeze_panes = 'B2'

    # ---- Income History
    i = wb.create_sheet('Income History')
    hdr(i, 1, ['Source', 'Total'] + [f'{YEAR}/{m}' for m in range(1, 13)])
    srcs = [('Employee - Main job', 2600), ('Other - Side projects', 300)] if demo else [('Employee - Main job', None), ('Other - Other income', None)]
    for k, (n, v) in enumerate(srcs, 2):
        i.cell(k, 1, n)
        for m in range(1, 13):
            if demo and m <= 10: i.cell(k, 2 + m, round(v * (1 if k == 2 else rnd.uniform(0, 1.5)), 2))
        i.cell(k, 2, f'=SUM(C{k}:N{k})')
    i.cell(4, 1, 'Total').font = HEAD
    for m in range(0, 13): i.cell(4, 2 + m, f'=SUM({L(2 + m)}2:{L(2 + m)}3)')
    i.cell(6, 1, 'Average income').font = HEAD
    i.cell(7, 1, '=IFERROR(AVERAGE(C4:N4),0)')
    i.cell(9, 1, 'Names starting with "Employee" count as employee income, "Freelance" as freelance income, "Unemployment" as unemployment benefit, anything else as Other.').font = NOTE
    i.column_dimensions['A'].width = 30

    # ---- Investing trades: one row per purchase
    v = wb.create_sheet('Investing Trades')
    v['A1'] = 'INVESTING - PURCHASES'; v['A1'].font = HEAD
    hdr(v, 2, ['Month', 'Date', 'Asset', 'Ticker', 'Amount (€)', 'Fee'])
    if demo:
        assets = [('FTSE All-World UCITS ETF (Acc)', 'VWCE', 120), ('S&P 500 UCITS ETF (Acc)', 'VUAA', 80), ('Emerging Markets ETF (Acc)', 'EMIM', 40)]
        k = 3
        for m in range(1, 11):
            for name, tk, base in assets:
                if tk == 'EMIM' and m % 2: continue
                d0 = dt.date(YEAR, m, rnd.randint(2, 6))
                v.cell(k, 1, dt.date(YEAR, m, 1)); v.cell(k, 2, d0); v.cell(k, 3, name); v.cell(k, 4, tk)
                v.cell(k, 5, round(base * rnd.uniform(0.8, 1.3), 2)); v.cell(k, 6, 1)
                v.cell(k, 1).number_format = 'yyyy-mm'; v.cell(k, 2).number_format = 'yyyy-mm-dd'; k += 1
    for col, w in zip('ABCDEF', (10, 12, 34, 9, 12, 6)): v.column_dimensions[col].width = w

    # ---- Scheduled payments
    p = wb.create_sheet('Scheduled Payments')
    hdr(p, 1, ['Date', 'Amount', 'Description'])
    if demo:
        base = dt.date(YEAR, 12, 1)
        for k, (n, v, off) in enumerate([('Gym membership', 39, 3), ('Streaming plan', 12.99, 9), ('Car insurance', 310, 15), ('Phone plan', 9.99, 20)], 2):
            p.cell(k, 1, base + dt.timedelta(days=off)); p.cell(k, 1).number_format = 'yyyy-mm-dd'; p.cell(k, 2, v); p.cell(k, 3, n)
    p.column_dimensions['C'].width = 30

    if not demo:
        e.cell(2, 1, 1); e.cell(2, 2, 1); e.cell(2, 3, 'rent'); e.cell(2, 4, 0); e.cell(2, 8, 'Starter row (the dashboard needs at least one). Overwrite it with your first expense.')

    # ---- Demo expenses
    if demo:
        fixed = [('rent', 850), ('condo fees', 60), ('internet', 29.9), ('electricity', 55), ('gas', 40), ('phone', 9.99), ('gym', 39)]
        var = [('supermarket', 25, 90, 7), ('restaurant', 18, 60, 4), ('dinner', 25, 70, 2), ('coffee', 1.5, 4, 8), ('metro', 1.5, 12, 6), ('pharmacy', 8, 40, 1), ('food delivery', 12, 28, 2), ('clothes', 30, 110, 1), ('gift', 20, 80, 1), ('taxi', 9, 25, 1), ('fuel', 35, 65, 1)]
        rows = []
        for m in range(1, 11):
            for n, a in fixed: rows.append((m, 1 if n in ('rent', 'condo fees') else 5, n, round(a * rnd.uniform(0.95, 1.05) if n in ('electricity', 'gas') else a, 2)))
            for n, lo, hi, k in var:
                for _ in range(rnd.randint(max(1, k - 2), k)): rows.append((m, rnd.randint(1, 28), n, round(rnd.uniform(lo, hi), 2)))
        rows += [(8, 3, 'flight', 420.0), (8, 4, 'hotel', 640.0), (3, 12, 'doctor', 90.0), (6, 9, 'furniture', 380.0)]
        rows.sort(key=lambda x: (x[0], x[1]))
        for k, (m, dd, n, a) in enumerate(rows, 2):
            e.cell(k, 1, m); e.cell(k, 2, dd); e.cell(k, 3, n); e.cell(k, 4, a); e.cell(k, 7, False); e.cell(k, 9, False)
    wb.move_sheet('Start here', offset=-wb.index(wb['Start here']))
    wb.save(path)

def recalc(src, dst_dir):
    # LibreOffice computes the formula results and stores them, so the file also works when read without Excel/Google
    subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', dst_dir, src], check=True, capture_output=True)

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__)); tmp = os.path.join(here, '_tmp'); os.makedirs(tmp, exist_ok=True)
    for demo, name in ((False, 'Tally-template-empty.xlsx'), (True, 'Tally-template-demo.xlsx')):
        raw = os.path.join(tmp, name); build(demo, raw); recalc(raw, here)
    shutil.rmtree(tmp)
    print('ok')

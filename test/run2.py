import asyncio, base64, sys
sys.path.insert(0,'/tmp/claude-0/-home-claude/0f3c19af-0fe7-51b1-ac5c-1b32f4b40d74/scratchpad/tally/test')
from run import *
async def scenario_mod(pg,out): pass
async def main():
    # 1. modified file (November rows + November liquidity): the dashboard must show November without code changes
    async def extra(pg,out):
        opts=await pg.eval_on_selector_all('[data-act=to] option','e=>e.map(x=>x.textContent)') if False else None
    await run('mod',1200,900,'it','light',['overview','spending'],b64=B64M)
    # 2. error states and live reload
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1200,'height':900}); pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('file://'+BASE+'tally/test/page.html')
        await pg.evaluate(SETUP,{'b64':B64,'lang':'it','oneOff':'Housing/Forniture','theme':'light','tab':None})
        await pg.wait_for_timeout(300)
        # swap file under the live view (simulates the vault 'modify' event)
        await pg.evaluate("(b64)=>{const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));window.__load(bin.buffer)}",B64M)
        await pg.wait_for_timeout(300)
        print('after swap ->',(await pg.inner_text('.kpi:nth-child(3)')).replace('\n',' | '))
        await pg.click('[data-act=tab][data-t=spending]'); await pg.wait_for_timeout(300)
        print('month options:',await pg.eval_on_selector_all('[data-act=to] option','e=>e.map(x=>x.textContent).slice(-3)'))
        # filters: search + only extra + sort by date + month click
        await pg.fill('[data-act=q]','cena'); await pg.wait_for_timeout(200)
        print('search cena ->',await pg.inner_text('#mov .note'))
        await pg.fill('[data-act=q]',''); await pg.click('[data-act=extra]'); await pg.wait_for_timeout(200)
        print('only extra ->',await pg.inner_text('#mov .note'))
        await pg.click('[data-act=extra]'); await pg.click('[data-act=oneoff]'); await pg.wait_for_timeout(200)
        print('one-off included ->',(await pg.inner_text('.kpi:nth-child(1)')).replace('\n',' | '))
        await pg.click('[data-act=oneoff]')
        await pg.click('[data-act=view][data-v=t]'); await pg.wait_for_timeout(200)
        print('table mode: svgs=',await pg.evaluate('document.querySelectorAll(".plot svg").length'),'tables=',await pg.evaluate('document.querySelectorAll(".card .tbl table").length'))
        await pg.click('[data-act=view][data-v=c]'); await pg.wait_for_timeout(200)
        # chart click selects a month
        box=await pg.query_selector('.plot svg'); bb=await box.bounding_box()
        await pg.mouse.click(bb['x']+bb['width']*0.62,bb['y']+bb['height']*0.5); await pg.wait_for_timeout(300)
        print('month click -> title:',await pg.inner_text('.grid .card.w5 h2'))
        await pg.mouse.move(bb['x']+bb['width']*0.3,bb['y']+bb['height']*0.5); await pg.wait_for_timeout(200)
        print('tooltip visible:',await pg.evaluate('!document.querySelector(".tally-tip").hidden'))
        # errors
        import io, openpyxl
        wb=openpyxl.load_workbook(BASE+'src/money.xlsx'); del wb['2026 Expenses']; bio=io.BytesIO(); wb.save(bio)
        await pg.evaluate("(b64)=>{const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));window.__load(bin.buffer)}",base64.b64encode(bio.getvalue()).decode())
        await pg.wait_for_timeout(300); print('missing sheet ->',(await pg.inner_text('.card.err')).replace('\n',' | '))
        await pg.screenshot(path=BASE+'tally/test/shot_err.png')
        await pg.evaluate("()=>{window.__load(new Uint8Array([1,2,3,4]).buffer)}"); await pg.wait_for_timeout(300)
        print('garbage file ->',(await pg.inner_text('.card.err')).replace('\n',' | ')[:160])
        await pg.click('.card.err [data-act=reload]'); await pg.wait_for_timeout(300)
        print('retry -> kpis:',await pg.evaluate('document.querySelectorAll(".kpi").length'))
        # destroy cleans up
        await pg.evaluate('window.__destroy()'); print('after destroy: tooltips in body =',await pg.evaluate('document.querySelectorAll(".tally-tip").length'),' host empty =',await pg.evaluate('document.getElementById("host").innerHTML===""'))
        print('page errors:',errs); await b.close()
asyncio.run(main()) if __name__=='__main__' and 'run2' in sys.argv[0] else None

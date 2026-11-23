import asyncio, base64, json, sys
from playwright.async_api import async_playwright
BASE='/tmp/claude-0/-home-claude/0f3c19af-0fe7-51b1-ac5c-1b32f4b40d74/scratchpad/'
B64=base64.b64encode(open(BASE+'src/money.xlsx','rb').read()).decode()
B64M=base64.b64encode(open(BASE+'src/money_mod.xlsx','rb').read()).decode()
SETUP="""
async (args) => {
  const {b64, lang, oneOff, theme, tab} = args;
  document.body.className = 'theme-'+theme;
  const {XLSX, parseWorkbook, mountDashboard, makeT} = window.TALLY;
  const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
  window.__state = {data:null,error:null,loading:false,mtime:Date.UTC(2026,9,22,16,0),fileName:'Money Tools 2026.xlsx'};
  const subs = new Set();
  function load(buf){ try{ const wb=XLSX.read(buf,{type:'array'}); window.__state={...window.__state,data:parseWorkbook(XLSX,wb),error:null}; }catch(e){ window.__state={...window.__state,data:null,error:{code:e.code||'read',detail:e.detail||String(e.message)}}; } subs.forEach(f=>f()); }
  window.__load = load; window.__reload = ()=>load(bin.buffer);
  const ctx = { t: makeT(lang), locale: lang==='it'?'it-IT':'en-GB', oneOff, getState:()=>window.__state, onChange:fn=>{subs.add(fn);return()=>subs.delete(fn)}, reload:()=>window.__reload(), openSettings:()=>{window.__settings=true}, tab };
  window.__destroy = mountDashboard(document.getElementById('host'), ctx);
  load(bin.buffer);
}
"""
async def run(name, vw, vh, lang, theme, tabs, b64=B64, oneOff='Housing/Forniture', extra=None):
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':vw,'height':vh})
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
        pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' else None)
        await pg.goto('file://'+BASE+'tally/test/page.html')
        await pg.evaluate(SETUP,{'b64':b64,'lang':lang,'oneOff':oneOff,'theme':theme,'tab':None})
        await pg.wait_for_timeout(500)
        out={}
        for tab in tabs:
            await pg.click(f'[data-act=tab][data-t={tab}]'); await pg.wait_for_timeout(350)
            kp=await pg.eval_on_selector_all('.kpi','e=>e.map(x=>x.innerText.replace(/\\n/g," | "))')
            ov=await pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth')
            nsvg=await pg.evaluate('document.querySelectorAll(".plot svg").length')
            out[tab]=(kp,ov,nsvg)
            await pg.screenshot(path=BASE+f'tally/test/shot_{name}_{tab}.png',full_page=True)
        if extra: await extra(pg,out)
        print(f'== {name}: errors={errs}')
        for t,(kp,ov,n) in out.items(): print(f'  [{t}] overflowX={ov} charts={n}'); [print('     ',k) for k in kp]
        await b.close()
async def main():
    which=sys.argv[1]
    if which=='it':
        await run('it_light',1200,900,'it','light',['overview','spending','income','wealth','invest','home'])
    if which=='en':
        await run('en_dark',1200,900,'en','dark',['overview','spending','wealth'])
    if which=='phone':
        await run('phone_it_dark',390,800,'it','dark',['overview','spending','home'])
if __name__=="__main__": asyncio.run(main())

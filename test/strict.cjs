const fs=require('fs'); const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body></body>'); global.window=dom.window; global.document=dom.window.document;
const mock=new Proxy({moment:{locale:()=> 'it'}, debounce:f=>f, normalizePath:p=>p},{get:(t,k)=>k in t?t[k]:class{ constructor(){} }});
const code=fs.readFileSync('main.js','utf8');
for (const mode of ['strict','sloppy']) {
  try {
    const m={exports:{}};
    const fn=new Function('module','exports','require',(mode==='strict'?'"use strict";':'')+code);
    fn(m,m.exports,n=>n==='obsidian'?mock:require(n));
    console.log(mode,'-> loaded, default export:',typeof m.exports.default, m.exports.default&&m.exports.default.name);
  } catch(e){ console.log(mode,'-> ERROR',e.constructor.name+':',e.message); console.log((e.stack||'').split('\n').slice(0,4).join('\n')); }
}

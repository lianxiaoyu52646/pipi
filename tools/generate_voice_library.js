// Generate exact same original book sentence texts as browser's narration pipeline.
// Run with Node at build/release preparation time; no network dependency.
const fs=require('fs'),path=require('path'),vm=require('vm');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const sandbox={window:{},localStorage:{getItem:()=>null},console};
sandbox.globalThis=sandbox.window;
for(const f of ['original-books.js','reader-paragraphs.js','reader-sentences.js']) {
 vm.runInNewContext(fs.readFileSync(path.join(assets,f),'utf8'),sandbox,{filename:f});
}
// Reuse the actual browser parsing function, not an approximation in Kotlin.
const original=fs.readFileSync(path.join(assets,'originals-reader.js'),'utf8');
const end=original.indexOf('async function downloadBook(');
if(end<0)throw Error('reader parsing boundary not found');
vm.runInNewContext(original.slice(0,end)+'\nwindow.__parseOriginal=parseOriginal;})();',sandbox,{filename:'originals-reader.js'});
const outDir=path.join(assets,'voice-library');fs.mkdirSync(outDir,{recursive:true});
const index=[];
for(const b of sandbox.window.OriginalBooks){
 const filename=path.join(assets,'books',b.id+'.txt');
 if(!fs.existsSync(filename)){console.warn('SKIP missing book',b.id);continue;}
 const work=sandbox.window.__parseOriginal(fs.readFileSync(filename,'utf8'),b);
 const sections=work.sections.map(s=>({title:s.title, sentences:s.paragraphs.flatMap(p=>sandbox.window.PipiReaderSentences.forNarration(p,1400).map(a=>a.text))}));
 const count=sections.reduce((n,s)=>n+s.sentences.length,0);
 if(!count) throw Error('empty narration '+b.id);
 fs.writeFileSync(path.join(outDir,b.id+'.json'),JSON.stringify({id:b.id,sections}));
 index.push({id:b.id,title:b.zhTitle,chapters:sections.length,sentences:count});
 console.log(b.id,sections.length,count)
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify(index));
console.log('TOTAL',index.reduce((s,x)=>s+x.sentences,0));

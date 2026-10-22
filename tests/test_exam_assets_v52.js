'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../app/src/main/assets');
const min={cet4:3600,cet6:5000,ielts:4600,toefl:6500};
const sizes={cet4:3846,cet6:5406,ielts:5038,toefl:6970};
const ctx={window:{},indexedDB:undefined,Promise,Map,Set,Date,console,AbortController,setTimeout,clearTimeout};
ctx.window=ctx;
ctx.fetch=async url=>{
 const p=path.join(root,String(url).replace(/^\.\//,''));
 return {ok:fs.existsSync(p),status:fs.existsSync(p)?200:404,text:async()=>fs.readFileSync(p,'utf8')};
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'wordbooks.js'),'utf8'),ctx,{filename:'wordbooks.js'});
(async()=>{
 for(const [key,limit] of Object.entries(min)){
   const file=path.join(root,'wordbooks-data',key+'.txt');
   const raw=fs.readFileSync(file,'utf8');
   assert(fs.statSync(file).size>200000);
   const parsed=ctx.SprintBooks.parseText(raw,key);
   assert.equal(parsed.length,sizes[key],key+' all tagged dictionary rows must parse');
   assert(parsed.length>=limit);
   assert.equal(new Set(parsed.map(x=>x.word)).size,parsed.length);
   assert(parsed.every(x=>x.id.startsWith('lex:')&&x.zh.length>0&&x.book===key));
   const loaded=await ctx.SprintBooks.load(key);
   assert.equal(loaded.length,sizes[key],'load only from local disk');
   assert.equal(ctx.SprintBooks.stats(key).origin,'bundled');
   const first=parsed[0];
   assert(ctx.SprintBooks.lookup(first.id).zh);
   console.log('PASS',key,parsed.length,'unique community-labelled offline words');
 }
})().catch(e=>{console.error(e);process.exitCode=1});

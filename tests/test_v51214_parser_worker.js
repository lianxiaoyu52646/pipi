const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const assets=path.join(__dirname,'../app/src/main/assets');
const readerParagraphs=fs.readFileSync(path.join(assets,'reader-paragraphs.js'),'utf8');
const workerText=fs.readFileSync(path.join(assets,'reader-parser-worker.js'),'utf8');
const booksText=fs.readFileSync(path.join(assets,'original-books.js'),'utf8');
const ctx={console,Date,Error,RegExp,Math,String,Number,Map,Set};ctx.self=ctx;ctx.window=ctx;
ctx.importScripts=(p)=>{assert.equal(p,'./reader-paragraphs.js');vm.runInContext(readerParagraphs,ctx)};
let result;ctx.postMessage=x=>{result=x};vm.createContext(ctx);
vm.runInContext(booksText,ctx);vm.runInContext(workerText,ctx);
assert.equal(ctx.OriginalBooks.length,20);
let count=0;
for(const book of ctx.OriginalBooks){
 const src=path.join(assets,'books',book.id+'.txt');const raw=fs.readFileSync(src,'utf8');result=null;
 ctx.onmessage({data:{raw,book}});
 assert(result,'worker did not return for '+book.id);
 assert(result.ok,book.id+': '+result.error);
 assert(result.work.sections.length>=book.expectedSections,book.id);
 assert(result.work.wordCount>7000,book.id);
 count++;
}
console.log('PASS V5.12.14: worker parsed '+count+' complete offline novels');

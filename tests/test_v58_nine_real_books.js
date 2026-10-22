'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.resolve(__dirname,'../app/src/main/assets');
const P=require(path.join(base,'reader-paragraphs.js'));
const S=require(path.join(base,'reader-sentences.js'));
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(base,'original-books.js'),'utf8'),context);
const books=context.window.OriginalBooks;
const source=fs.readFileSync(path.join(base,'originals-reader.js'),'utf8');
const defs=source.slice(source.indexOf('function tokenize(txt)'),source.indexOf('async function downloadBook(book)'));
const pars={window:{PipiReaderParagraphs:P},now:()=>new Date().toISOString(),console};vm.createContext(pars);vm.runInContext(defs+'\nthis.parse=parseOriginal;',pars);
let totalParagraphs=0,totalSentences=0, over500=0,maxLen=0;const audit=[];
for(const book of books){
 const file=path.join(base,'books',book.id+'.txt');if(!fs.existsSync(file))continue;
 const raw=fs.readFileSync(file,'utf8');const work=pars.parse(raw,book);
 assert.equal(work.paragraphSchema,P.CURRENT_SCHEMA);
 assert(work.sections.length>=book.expectedSections,`${book.id} expected chapter count`);
 const formatted=work.sections.flatMap(s=>s.paragraphs);
 const layout=P.layoutOf(raw);
 const old=raw.replace(/\r\n?/g,'\n').split(/\n\s*\n+/).map(s=>s.replace(/\n+/g,' ').trim()).filter(Boolean);
 if(layout.doubled)assert(formatted.length < old.length*.7,`${book.id} has leftover fake paragraphs`);
 const sentences=formatted.flatMap(t=>S.splitSentences(t));
 for(const s of sentences){over500+=s.text.length>500?1:0;maxLen=Math.max(maxLen,s.text.length);}
 assert(sentences.length>600,`${book.id} too few sentences`);
 totalParagraphs+=formatted.length;totalSentences+=sentences.length;
 audit.push({book:book.id,sections:work.sections.length,paragraphs:formatted.length,oldLines:old.length,sentences:sentences.length,avgChars:Math.round(sentences.reduce((v,s)=>v+s.text.length,0)/sentences.length),longest:Math.max(...sentences.map(s=>s.text.length))});
 // Integrity: all printable characters remain present in reading paragraphs except the book's headings, notes and PG metadata.
 const sectionBody=work.sections.filter(s=>!s.frontmatter);
 for(const section of sectionBody){
  const normalized=s=>String(s).replace(/\s/g,'').replace(/\[(?:illustration|decoration|figure)[^\]]*\]/ig,'');
  assert.equal(normalized(section.paragraphs.join(' ')),normalized(section.body),`${book.id} lost source characters in ${section.title}`);
 }
}
console.log(JSON.stringify({audit,totalParagraphs,totalSentences,over500,maxLen},null,2));

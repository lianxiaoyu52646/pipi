'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../app/src/main/assets');
const P=require(path.join(dir,'reader-paragraphs.js'));
const S=require(path.join(dir,'reader-sentences.js'));
const reader=fs.readFileSync(path.join(dir,'originals-reader.js'),'utf8');
const ctx={window:{PipiReaderParagraphs:P},now:()=>new Date().toISOString(),console};vm.createContext(ctx);
const pdefs=reader.slice(reader.indexOf('function tokenize(txt)'),reader.indexOf('async function downloadBook(book)'));
vm.runInContext(pdefs+'\nthis.parseOriginal=parseOriginal;',ctx);
const bctx={window:{}};vm.createContext(bctx);vm.runInContext(fs.readFileSync(path.join(dir,'original-books.js'),'utf8'),bctx);
let passages=0,sentences=0,wrapsFixed=0,maxParagraph=0,over1400=0;
for(const book of bctx.window.OriginalBooks){
 if(book.id==='tom')continue; // Status says book 10 source has NOT been acquired.
 const raw=fs.readFileSync(path.join(dir,'books',book.id+'.txt'),'utf8');
 const work=ctx.parseOriginal(raw,book);
 assert(work.sections.length>=book.expectedSections,book.id);
 const double=P.layoutOf(raw).doubled;
 const oldFake=raw.split(/\n\s*\n+/).length;
 const current=work.sections.flatMap(x=>x.paragraphs);
 if(double){assert(oldFake>current.length*1.5,book.id+' did not collapse printed lines');wrapsFixed++}
 for(const para of current){
  passages++;
  maxParagraph=Math.max(maxParagraph,para.length);
  const split=S.splitSentences(para),tts=S.forNarration(para,1400);
  // No loss or duplication of non-whitespace content within any genuine paragraph.
  assert.equal(split.map(x=>x.text).join('').replace(/\s/g,''),para.replace(/\s/g,''),book.id+' split loss');
  assert.equal(tts.map(x=>x.text).join('').replace(/\s/g,''),para.replace(/\s/g,''),book.id+' TTS loss');
  assert(tts.every(x=>x.text.length<=1400),book.id+' native length exceeded');
  assert(tts.every(x=>Number.isInteger(x.sentenceIndex)&&x.sentenceIndex>=0),book.id+' missing DOM sentence index');
  if(split.every(x=>x.text.length<=1400))assert.equal(tts.length,split.length,book.id+' cut a normal sentence');
  sentences+=split.length;
  over1400+=split.filter(x=>x.text.length>1400).length;
 }
}
for(const [src,expected] of [
 ['Mr. Darcy looked at Elizabeth. She replied.',2],
 ['He went to St. James. He returned.',2],
 ['“Stop!” the little boy cried. He ran.',2],
 ['“Really?” Alice asked. She smiled.',2],
 ['The distance is 3.14 miles. It is exact.',2],
 ['She thought... then changed her mind.',2],
 ['“What?” she asked. “Nothing!”',2]
])assert.equal(S.splitSentences(src).length,expected,src);
const atomic=reader.slice(reader.indexOf('function paginateChapter('),reader.indexOf('function jumpToReadingTop()'));
const pagectx={ctx:{book:{id:'test'},chapter:0,font:19},pageCache:new Map(),pageCharacterBudget:()=>240,document:{documentElement:{clientWidth:390}},window:{innerHeight:740}};
vm.createContext(pagectx);vm.runInContext(atomic+'\nthis.paginate=paginateChapter;',pagectx);
const paras=['First genuine paragraph crosses any screen page without being cut. '.repeat(8),'Second paragraph is short.','Third paragraph is also a distinct full paragraph.'];
const pages=pagectx.paginate({paragraphs:paras,wordCount:91});
const parts=Array.from(pages.flatMap(p=>p.parts));
assert.deepEqual(parts.map(p=>p.text),paras,'virtualization must not split or rejoin full paragraphs');
assert(parts.every(p=>p.sourceStart===0),'source sentence anchors start at actual paragraph');
const render=reader.slice(reader.indexOf('function renderSpokenParagraph('),reader.indexOf('function renderStreamRows()'));
const renderCtx={window:{PipiReaderSentences:S},richParagraph:(s)=>s,esc:s=>s,chapterPages:()=>[{parts:[{index:0,text:'Mr. Darcy spoke. Elizabeth replied.'}]}],ctx:{work:{sections:[{title:'CHAPTER I'}]}},console};
vm.createContext(renderCtx);vm.runInContext(render+'\nthis.renderSpokenParagraph=renderSpokenParagraph;',renderCtx);
const rendered=renderCtx.renderSpokenParagraph('Mr. Darcy spoke. Elizabeth replied.',new Set());
assert.equal((rendered.match(/class="reader-sentence"/g)||[]).length,2);
assert(rendered.includes('data-sentence="0"')&&rendered.includes('data-sentence="1"'));
console.log('PASS V5.8',JSON.stringify({works:9,paragraphs:passages,sentences,booksWithDoublePrintedLineBreaks:wrapsFixed,maxParagraph,over1400,pagination:'full-paragraph',highlights:'sentence-level-dom'}));

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/originals-reader.js'),'utf8');
const engine=require('../app/src/main/assets/reader-sentences.js');
const start=src.indexOf('const speechParaCache='),end=src.indexOf('function updateNarratorUI(',start);
assert(start>=0&&end>start);
const paragraphs=[
 'Mr. Darcy walked across the long room before he stopped. Then he said, “Good morning!”',
 '“What?” she asked. Nothing else was said, although the guests stayed for a long time.',
 Array.from({length:120},(_,i)=>`word${i}`).join(' ')+'. And another sentence followed.'
];
const paragraphs2=['Dr. Watson wondered whether it was true. It was.'];
const sections=[{paragraphs},{paragraphs:paragraphs2}];
// Fake pagination deliberately tears a sentence apart, like the Android screen budget.
const pages=[
 {parts:[{index:0,sourceStart:0,text:paragraphs[0].slice(0,24)}]},
 {parts:[{index:0,sourceStart:24,text:paragraphs[0].slice(24)},{index:1,sourceStart:0,text:paragraphs[1].slice(0,26)}]},
 {parts:[{index:1,sourceStart:26,text:paragraphs[1].slice(26)},{index:2,sourceStart:0,text:paragraphs[2].slice(0,190)}]},
 {parts:[{index:2,sourceStart:190,text:paragraphs[2].slice(190)}]}
];
const context={
 ctx:{book:{id:'pride'},work:{sections},font:19,chapter:0,page:0},
 window:{PipiReaderSentences:engine,innerHeight:740},
 document:{documentElement:{clientWidth:390}},
 chapterPages:(i)=>i===0?pages:[{parts:[{index:0,sourceStart:0,text:paragraphs2[0]}]}],
 Map,console
};
vm.createContext(context);vm.runInContext(src.slice(start,end),context);
let cursor={chapter:0,paragraph:0,sentence:0},out=[],count=0;
while(cursor){let part=context.narrateSegments(cursor);assert(part.batch.length>0&&part.batch.length<=36);out.push(...part.batch);cursor=part.next;assert(++count<100);}
// Every FULL paragraph must be narrated once, even across artificial page boundaries.
for(const [chapter,pars] of sections.entries())for(const [index,para] of pars.paragraphs.entries()){
 const actual=out.filter(x=>x.chapter===chapter&&x.paragraph===index).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
 assert.equal(actual,para.trim().replace(/\s+/g,' '),`chapter ${chapter}, paragraph ${index}`);
}
assert(out[0].text.startsWith('Mr. Darcy walked'));
assert(out[0].text.endsWith('stopped.'));
assert(out.some(x=>x.page===1&&x.paragraph===0));
assert(out.length===new Set(out.map(x=>`${x.chapter}/${x.paragraph}/${x.sentence}`)).size);
const fromMiddle=context.narrationStartFromPage.call(context);assert.deepEqual({chapter:fromMiddle.chapter,paragraph:fromMiddle.paragraph},{chapter:0,paragraph:0});
const native=fs.readFileSync(path.join(__dirname,'../app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt'),'utf8');
assert(native.includes('.put("paragraph", s.paragraph).put("sentence", s.sentence)'));
assert(native.includes('fun writePcm16(')&&native.includes('fun drainPlayer('));
assert(!native.includes('minOf(250L, bufferMs + 20L)'));
assert(!/engine\.generateWithCallback\(/.test(native));
assert.equal((native.match(/createPlayer\(ready\.rate\)/g)||[]).length,1,'create player once per completed chapter');
console.log('PASS V5.6.2 reading original full sentences across viewport splits, bounded batches, sentence bookmarks, continuous native AudioTrack');

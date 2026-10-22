'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const reader=fs.readFileSync(path.join(root,'app/src/main/assets/originals-reader.js'),'utf8');
const native=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt'),'utf8');
const sentences=require('../app/src/main/assets/reader-sentences.js');
// Native PCM cannot depend on future generate() calls after AudioTrack has started.
assert(native.indexOf('run.prepared = ReadyChapter')<native.indexOf('private fun consume('));
assert(native.includes('while (active(run) && run.prepared == null')); // wait until chapter is ready
assert(native.includes('File.createTempFile(')&&native.includes('partial.renameTo(target)'));
assert(native.includes('fingerprint(items, speed, sid)')&&native.includes('loadCached(key, items.size)'));
assert(!native.includes('run.queue.poll('));
assert(native.includes('NarrationPcmPacing.smooth(raw, engine.sampleRate(), seg.text)'));
const start=reader.indexOf('function narrateSegments('),end=reader.indexOf('function startArticleReading(){',start);
assert(start>=0&&end>start);
const paragraphs=Array.from({length:115},(_,i)=>`The reader carefully checks sentence ${i}, and remembers it. Why do they wait?`);
const context={
 ctx:{book:{id:'novel'},work:{sections:[{paragraphs},{paragraphs:['Another chapter ends here.']}]}},
 narrator:{active:true,paused:false,token:'tok',serial:1,chapter:0,next:{chapter:0,paragraph:0,sentence:0},batch:[],submitted:0,finished:false,feedTimer:0},
 narrationForParagraph:(chapter,paragraph)=>sentences.forNarration(context.ctx.work.sections[chapter].paragraphs[paragraph],1400),
 speechAnchor:()=>({page:0,part:0}),
 window:{PipiVoice:{article:{append:(items,token)=>{context.appended.push(...items);assert.equal(token,'tok');return true},finish:token=>{assert.equal(token,'tok');context.ends++}}}},
 appended:[],ends:0,toast:()=>{},stopArticleReading:()=>{},setTimeout:(fn)=>{context.queued=fn;return 5;},
 console
};
vm.createContext(context);vm.runInContext(reader.slice(start,end).replace(/function updateNarratorUI\([\s\S]*?\n}\n(?=\/\/ Feed)/,''),context);
// The entire chapter must be sent and EOS reached BEFORE any playback marker.
let loops=0;while(!context.narrator.finished){context.fillNarratorQueue('tok');if(context.queued){context.queued=null;}assert(++loops<30,'reader failed to complete chapter submission')}
assert.equal(context.ends,1);
assert.equal(context.appended.length,context.narrator.submitted);
assert(context.appended.every(x=>x.chapter===0));
assert.deepEqual(Object.keys(context.narrator.next).sort(),['chapter','paragraph','sentence']);
assert.equal(context.narrator.next.chapter,1);
assert(context.appended.length>180,'more than two legacy prefetch batches must be accepted');
assert.equal(context.appended.length,new Set(context.appended.map(x=>`${x.paragraph}/${x.sentence}`)).size);
assert(reader.includes('article-preparing')&&reader.includes('article-cache-hit'));
console.log('PASS V5.10.4: sends a complete chapter + EOS before reading, caches PCM, preserves subsequent chapter cursor');

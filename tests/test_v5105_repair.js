'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app/src/main/assets/app.js');
const css=read('app/src/main/assets/v5-styles.css');
const reader=read('app/src/main/assets/originals-reader.js');
const native=read('app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt');
const main=read('app/src/main/java/com/sprint7/offline/MainActivity.java');
const gradle=read('app/build.gradle');
// No fixed-height fake scrolling or row replacement. The active viewport may only
// move in response to user interaction, never a seek to a virtual offset.
assert(!app.includes('next*WORD_ROW_HEIGHT'));
assert(!app.includes('pipiVirtualTop'));
assert(!app.includes("document.getElementById('pipiVirtualRows').innerHTML="));
assert(app.includes("box.insertAdjacentHTML('beforeend'"));
assert(app.includes('item.getBoundingClientRect().bottom>boundary'));
assert(app.includes('listUserScrollDirection===1&&delta>0'));
assert(app.includes('listRenderedUntil=next;listCrossingIndex=next'));
assert(css.includes('.pipi-list-row{height:auto!important'));
assert(app.includes("upsertMistake('vocab',id,0,'列表浏览：标记不会'"));
// Restore usable first-audio narration rather than waiting for the ENTIRE
// chapter; word pronunciation model + assets paths are unchanged.
assert(native.includes('fun speakBatch(')&&native.includes('fun appendBatch(')&&native.includes('fun finishBatch('));
assert(native.includes('private fun produce(')&&native.includes('run.pollAudio()'));
assert(native.includes('run.bufferedMs()')&&native.includes('NarrationBufferPolicy.startupTargetMs'));
assert(native.includes('NarrationAudioCache(')&&native.includes('diskCache.get(')&&native.includes('diskCache.put('));
assert(!native.includes('private fun prepareChapter('));
assert(!native.includes('while (active(run) && !run.ended) Thread.sleep(35)'));
assert(native.includes('OfflineTtsKokoroModelConfig')&&native.includes('model.int8.onnx'));
assert(native.includes('NarrationPcmPacing.smooth('));
assert(main.includes('resumeArticleAfterWord.set(false);\n        if (voice != null) voice.stop();'));
assert((/versionName '5\.(?:10|11|12)\.\d+'/.test(gradle))&&gradle.includes('verifyOfflineVoiceAssets'));
// The actual novel sentence chunker must preserve punctuation and source prose.
const splitter=require('../app/src/main/assets/reader-sentences.js');
for(const sentence of ['Hello, Tom! Where are you going?', 'I said, "Oh, yes!" Really?', 'First, wash it; next, dry it.']){
 const segments=splitter.forNarration(sentence,1400);
 assert.equal(segments.map(s=>s.text).join(' ').replace(/\s+/g,' '),sentence);
 assert(segments.every(s=>s.text.length<=1400));
}
const start=reader.indexOf('const speechParaCache='),end=reader.indexOf('function updateNarratorUI(',start);
assert(start>=0&&end>start);
const paras=['Mr. Darcy walked across the room. Then he said, “Good morning!”', '“What?” she asked. They walked away.'];
const context={ctx:{book:{id:'test'},work:{sections:[{paragraphs:paras}]},font:19,chapter:0,page:0},window:{PipiReaderSentences:splitter,innerHeight:740},document:{documentElement:{clientWidth:390}},chapterPages:()=>[{parts:paras.map((p,i)=>({index:i,sourceStart:0,text:p}))}],Map};
vm.createContext(context);vm.runInContext(reader.slice(start,end),context);
let at={chapter:0,paragraph:0,sentence:0},parts=[];
for(let i=0;i<20&&at;i++){const r=context.narrateSegments(at);parts.push(...r.batch);at=r.next;}
assert.equal(parts.map(p=>p.text).join(' ').replace(/\s+/g,' '),paras.join(' '));
console.log('PASS V5.10.5: stable append-only word list, genuine manual scroll semantics, Kokoro first-audio regression rollback, intact narration punctuation and upgrade guard');

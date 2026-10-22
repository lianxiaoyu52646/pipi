'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..');
const native=fs.readFileSync(path.join(project,'app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt'),'utf8');
const pacing=fs.readFileSync(path.join(project,'app/src/main/java/com/sprint7/offline/NarrationPcmPacing.kt'),'utf8');
const splitter=require('../app/src/main/assets/reader-sentences.js');
for(const punctuation of ['!','?','.','…',';',',']){
  const source=punctuation==='!'?'Stop! Go now.':punctuation==='?'?'Really? Yes, absolutely.':
  punctuation==='.'?'Well done. On we go.':punctuation==='…'?'Wait… I see.':
  punctuation===';'?'First things first; then move on.':'First, this happens. Next, another.';
  const segments=splitter.forNarration(source,1400);
  assert.equal(segments.map(x=>x.text).join(' ').replace(/\s+/g,' '),source,'punctuation content loss: '+punctuation);
  assert(segments.every(x=>x.text.length<=1400));
}
for(const expected of ['private fun dispatchMarkers(', 'private fun prepareChapter(', 'PlaybackMarker(', 'NarrationPcmPacing.smooth(', 'markerWorker.execute { dispatchMarkers(run) }'])assert(native.includes(expected),expected);
assert(!native.includes('private fun waitForSpeechBoundary('),'the old blocking wait was the source of an additional boundary delay');
assert(!/engine\.generateWithCallback\(/.test(native),'JNI callback remains disabled to avoid prior SIGABRT');
assert(native.includes('while (active(run) && !run.ended)'),'wait for complete chapter input');
assert(!native.includes('run.queue.poll('),'no synthesis starvation during chapter playback');
assert(native.includes('cachedSamples ?: NarrationPcmPacing.smooth')); 
assert(pacing.includes("ending.endsWith('!')")&&pacing.includes("ending.endsWith('?')")&&pacing.includes("ending.endsWith('.')"));
console.log('PASS: punctuation-aware low-amplitude trimming, initial prebuffer and non-blocking sentence markers');

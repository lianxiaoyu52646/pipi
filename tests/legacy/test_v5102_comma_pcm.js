'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const pacing=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/NarrationPcmPacing.kt'),'utf8');
const native=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt'),'utf8');
const splitter=require('../app/src/main/assets/reader-sentences.js');
for(const sentence of ['Hello, Tom, have you seen the others?', 'Alice said, "Oh, yes, of course!"', 'First, wash the bowl; next, dry it.']) {
 const output=splitter.forNarration(sentence,1400);
 assert.equal(output.length,1,'comma/semicolon must not create separate synthesis tasks: '+sentence);
 assert.equal(output[0].text,sentence);
}
assert(pacing.includes('compressInternalSilence(outside, sampleRate, text)'));
assert(pacing.includes('isQuiet(samples, pos, end)'));
assert(pacing.includes('quietEnd - startQuiet >= minimum'));
assert(native.includes('ReadyChapter(')&&native.includes('writePcm16('));
assert(native.includes('BufferedInputStream(FileInputStream(ready.file)')); 
assert(!/engine\.generateWithCallback\s*\(/.test(native));
console.log('PASS V5.10.2: commas retain whole-sentence TTS input; native audio smoothing & prebuffer wired');

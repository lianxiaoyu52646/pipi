const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
for (const target of ['OfflineVoiceEngine.kt','ArticleVoiceEngine.kt']) {
 const src=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline',target),'utf8');
 assert(!/\bengine\.generateWithCallback\s*\(/.test(src), `${target}: uses callback-based JNI path`);
 assert(src.includes('generate('), `${target}: missing callback-free generation`);
 assert(src.includes('.samples'), `${target}: missing generated samples`);
}
console.log('PASS: Piper and Kokoro use callback-free JNI generation (workaround for SIGABRT)');

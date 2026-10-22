const assert=require('assert'), fs=require('fs'), vm=require('vm'), path=require('path');
const base=path.join(__dirname,'..');
const assets=path.join(base,'app/src/main/assets');
const html=n=>fs.readFileSync(path.join(assets,n),'utf8');
const source=n=>fs.readFileSync(path.join(assets,n),'utf8');
const kotlin=fs.readFileSync(path.join(base,'app/src/main/java/com/sprint7/offline/OfflineVoiceEngine.kt'),'utf8');
const java=fs.readFileSync(path.join(base,'app/src/main/java/com/sprint7/offline/MainActivity.java'),'utf8');
// Every audio path has common voice control, and no Android system TextToSpeech.
for(const p of ['index.html','dictionary.html','originals-reader.html'])assert(html(p).includes('tts-ui.js'),p);
for(const p of ['app.js','originals-reader.js','full-dict.js']) assert(source(p).includes('PipiVoice.speak'),p);
assert(!java.includes('import android.speech.tts.TextToSpeech'));
assert(java.includes('speakWithRate(String text, float speed)'));
assert(kotlin.includes('com.k2fsa.sherpa.onnx.OfflineTts'));
assert(kotlin.includes('AudioTrack.Builder()'));
assert(kotlin.includes('fun interface StatusCallback'));
assert(kotlin.includes('sherpa')||kotlin.includes('OfflineTts'));
// VM fake browser, test user rate preference and wiring to the Android native bridge.
const state=new Map(),play=[];
const handlers={};
const window={SprintAndroid:{speakWithRate:(s,rate)=>play.push([s,rate]),stopSpeech:()=>play.push(['stop'])},
  addEventListener:(ev,f)=>handlers[ev]=f};
const doc={addEventListener:(ev,f)=>handlers['document:'+ev]=f,querySelectorAll:()=>[],querySelector:()=>null,
  createElement:()=>({setAttribute(){},style:{},hidden:false})};
const ctx={window,document:doc,localStorage:{getItem:k=>state.has(k)?state.get(k):null,setItem:(k,v)=>state.set(k,v)},
  SpeechSynthesisUtterance:function(){},setTimeout:()=>1,clearTimeout:()=>{}};
vm.runInNewContext(source('tts-ui.js'),ctx);
assert.equal(window.PipiVoice.rate(),1);
window.PipiVoice.speak('orchard'); assert.equal(play[0][0],'orchard');assert.equal(play[0][1],1);
window.PipiVoice.nextRate();assert.equal(window.PipiVoice.rate(),1.25);
window.PipiVoice.speak('library');assert.equal(play[1][1],1.25);
window.PipiVoice.nextRate();assert.equal(window.PipiVoice.rate(),.75);
window.PipiVoice.speak('two',1.5);assert.equal(play[2][1],1.125);
window.PipiVoice.stop();assert.equal(play[3][0],'stop');
assert(handlers['pipi-tts-status']);
assert(fs.existsSync(path.join(base,'prepare_offline_voice.py')));
console.log('PASS: shared bridge + voice speed prefs + offline native integration + error listener');

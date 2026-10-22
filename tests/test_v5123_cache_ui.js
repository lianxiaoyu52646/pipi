'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/voice-cache.html'),'utf8');
const js=html.match(/<script>\s*(\(function\(\)\{'use strict'[^]*?\}\)\(\);)\s*<\/script>/)?.[1];
assert(js,'cache UI script missing');
const fake=()=>({textContent:'',style:{width:''},classList:{running:null,toggle:function(_name,flag){this.running=flag}},disabled:false,value:''});
const elements=Object.fromEntries(['detail','start','pause','clear','percent','fill','progress','counter','state','book','status','voice','speed','realClips','realBytes','realSpeed','recoveryCount'].map(x=>[x,fake()]));
let status={state:'running',phase:'generating',done:60,total:100,chapterTotal:100,chapterDone:60,
 lastProgressAt:Date.now()-601000,lastWrittenAt:Date.now()-602000,phaseStartedAt:Date.now()-600000};
const w={SprintAndroid:{getLibraryVoiceCacheStatus:()=>JSON.stringify(status)},setInterval:()=>{},setTimeout:()=>{},
 localStorage:{getItem:()=>null},document:{getElementById: id=>elements[id]}};
const cx={window:w,document:w.document,Date,Number,Math,JSON,setInterval:w.setInterval,setTimeout:w.setTimeout};
vm.runInNewContext(js,cx);
assert(/自动恢复中|无新增进度/.test(elements.status.textContent));
assert.strictEqual(elements.progress.classList.running,false,'no fake animated progress when stalled');
assert(/最后写入新音频/.test(elements.detail.textContent));
status.lastProgressAt=Date.now()-1000;
vm.runInNewContext(js,cx);
assert.strictEqual(elements.progress.classList.running,true,'active progress should animate');
console.log('PASS UI real-progress evidence, 5-min stale disables animation');

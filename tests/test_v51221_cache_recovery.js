'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'), assets=path.join(root,'app/src/main/assets');
const html=fs.readFileSync(path.join(assets,'voice-cache.html'),'utf8');
const snippet=html.match(/<\/main><script>([\s\S]*?)<\/script><script>/);
assert(snippet,'cache UI script not found');new vm.Script(snippet[1]);
function simulate(overrides={}){
 const el={}, settings=[];
 const make=id=>({id,value:'',textContent:'',style:{width:''},disabled:false,options:[],
     hidden:false,classList:{state:{},toggle(name,active){this.state[name]=active}},
     get selectedOptions(){return this.options.filter(o=>o.value===this.value)},
     set onclick(fn){this._onclick=fn},get onclick(){return this._onclick}});
 for(const id of ['savedProfile','voice','speed','status','percent','fill','progress','counter','state','book',
  'realClips','realBytes','realSpeed','recoveryCount','bookwiseCount','bookwisePercent','bookwiseFill','bookwiseHint','detail','cacheLogs','start','pause','clear',
  'recoveryHelp','recoveryHelpText','batterySettings'])el[id]=make(id);
 el.voice.options=[{value:'3',textContent:'Sarah'},{value:'2',textContent:'Nicole'}];
 el.speed.options=[{value:'1',textContent:'1.0×'}];
 const state={state:'running',phase:'generating',done:8005,total:82926, wanted:true,
  phaseStartedAt:Date.now()-600000,lastProgressAt:Date.now()-602000,lastWrittenAt:Date.now()-600000,
  ...overrides};
 const bridge={getLibraryVoiceCacheStatus:()=>JSON.stringify(state),openLibraryCacheBatterySettings:()=>settings.push('opened')};
 const ctx={window:{SprintAndroid:bridge},document:{getElementById:id=>el[id]},
  localStorage:{getItem:()=>null},Date,Number,Math,JSON,String,Boolean,Array,setInterval(){},setTimeout(){},alert(){}};
 vm.runInNewContext(snippet[1],ctx);
 return {el,settings};
}
let x=simulate({recoveryLaunchBlocked:true,batteryOptimized:true,backgroundRestricted:true});
assert.match(x.el.status.textContent,/后台恢复被系统限制/);
assert.strictEqual(x.el.recoveryHelp.classList.state.hidden,false);
assert.match(x.el.recoveryHelpText.textContent,/无限制/);
x.el.batterySettings.onclick();assert.deepStrictEqual(x.settings,['opened']);
assert.match(x.el.detail.textContent,/并不表示已执行重启/); // no fake claim that a recycle already happened
x=simulate({lastProgressAt:Date.now()-2000,lastWrittenAt:Date.now()-2000, batteryOptimized:false});
assert.strictEqual(x.el.recoveryHelp.classList.state.hidden,true);
assert.match(x.el.status.textContent,/正在生成/);
const rec=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/VoiceCacheRecovery.kt'),'utf8');
const diag=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/VoiceCacheDiagnostics.kt'),'utf8');
const svc=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt'),'utf8');
const java=fs.readFileSync(path.join(root,'app/src/main/java/com/sprint7/offline/MainActivity.java'),'utf8');
for(const s of ['launch_blocked','notifyManualResume(context)','recoveryAttempt','recoveryAttemptAt','PowerManager'])
 assert((rec+svc).includes(s),'missing recovery mechanism '+s);
assert(diag.includes('processName?.endsWith(":voice_cache")'));
assert(java.includes('openLibraryCacheBatterySettings'));
assert(java.includes('VoiceCacheRecovery.INSTANCE.schedule'));
assert(svc.includes('lastDone=snapshot.done'));
assert(svc.includes('power.currentThermalStatus>=PowerManager.THERMAL_STATUS_SEVERE'));
assert(svc.includes('stage("thermal_cooldown")') && svc.includes('sleepUntilRetry(90_000L)'));
assert(svc.includes('processLease?.close()') && svc.includes('model?.free()'));  // queue stays durable and primary
assert(!svc.includes('cacheFolder(this).deleteRecursively()\n                    VoiceCacheIndex.deleteAll(this)\n                    lastDone=0\n                    // invalid')); // safety sentinel
console.log('PASS V5.12.21 recovery blocked/foreground/on-screen guidance, readable real progress, durable queue preservation');

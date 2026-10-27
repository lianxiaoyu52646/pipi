'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(__dirname+'/../app/src/main/assets/voice-cache.html','utf8');
const match=html.match(/<\/main><script>([\s\S]*?)<\/script><script>/);
assert(match, 'cache UI inline script not found');
new vm.Script(match[1],{filename:'voice-cache.html'});
function run(oldSpeaker=3, oldSpeed=1, lastRunCount=4418, onConfirm=true){
 const bridgeCalls=[];
 const fields=new Map();
 const make=(name)=>({
    id:name, value:'',textContent:'',style:{},disabled:false,options:[],
    classList:{toggle(){}},
    get selectedOptions(){return this.options.filter(x=>x.value===this.value)},
    set onclick(fn){this._onclick=fn},get onclick(){return this._onclick}
 });
 for(const n of ['voice','speed','savedProfile','status','percent','fill','progress','counter','state','book','realClips','realBytes','realSpeed','recoveryCount','bookwiseCount','bookwisePercent','bookwiseFill','bookwiseHint','detail','cacheLogs','recoveryHelp','recoveryHelpText','batterySettings','start','pause','clear'])fields.set(n,make(n));
 fields.get('voice').options=[{value:'3',textContent:'Sarah 美式女声'},{value:'2',textContent:'Nicole 美式女声'},{value:'7',textContent:'Emma 英式女声'}];
 fields.get('speed').options=[{value:'1',textContent:'1.0× 标准'},{value:'0.75',textContent:'0.75× 慢速'},{value:'1.25',textContent:'1.25× 快速'}];
 const status={state:'paused',phase:'paused',done:lastRunCount,total:82926,wanted:false,speaker:oldSpeaker,speed:oldSpeed,savedSpeaker:oldSpeaker,savedSpeed:oldSpeed,profileKnown:true};
 const bridge={getLibraryVoiceCacheStatus:()=>JSON.stringify(status),startLibraryVoiceCache:(...args)=>bridgeCalls.push(['resume',...args]),startLibraryVoiceCacheWithProfile:(...args)=>bridgeCalls.push(['switch',...args])};
 const c={document:{getElementById:(n)=>fields.get(n)},window:{SprintAndroid:bridge},localStorage:{getItem:(n)=>n.includes('voice_id')?'2':'0.75'},Date,Math,Number,Array,JSON,String,Boolean,confirm:()=>onConfirm,alert:(s)=>{throw Error(s)},setInterval(){},setTimeout(){}};
 vm.createContext(c);vm.runInContext(match[1],c);
 return {fields,bridgeCalls,status};
}
let x=run();
assert.strictEqual(x.fields.get('voice').value,'3','must use remembered native cache voice');
assert.strictEqual(x.fields.get('speed').value,'1','must use remembered native cache speed');
x.fields.get('start').onclick();
assert.deepStrictEqual(x.bridgeCalls,[['resume',3,1]]);
x=run(3,1,4418,true);
x.fields.get('voice').value='7';x.fields.get('start').onclick();
assert.deepStrictEqual(x.bridgeCalls,[['switch',7,1,true]]);
x=run(3,1,4418,false);
x.fields.get('voice').value='7';x.fields.get('start').onclick();
assert.deepStrictEqual(x.bridgeCalls,[['resume',3,1]]);
assert.strictEqual(x.fields.get('voice').value,'3');
assert(x.fields.get('counter').textContent.includes('累计已完成'));
console.log('PASS native cache profile reused; explicit profile switch; cancel retains previous; cumulative stats');

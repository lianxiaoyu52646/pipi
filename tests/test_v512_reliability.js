'use strict';
// V5.12 new behaviors: never erase a corrupt existing record, emergency export,
// durable review checkpoints; list scrolling must NOT enroll known words in FSRS.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const app=fs.readFileSync(path.join(assets,'app.js'),'utf8');
const guard=require(path.join(assets,'state-safety.js'));
const backup=fs.readFileSync(path.join(assets,'backup.html'),'utf8');
const reader=fs.readFileSync(path.join(assets,'originals-reader.js'),'utf8');
const html=fs.readFileSync(path.join(assets,'originals-reader.html'),'utf8');
assert.match(app,/function save\(urgent=false\)/);
assert.match(app,/window\.PipiStateSafety\?\.schedule\(raw,urgent\)/);
assert.match(app,/if\(!save\(true\)\)\{state=JSON\.parse\(oldJSON\)/);
assert.doesNotMatch(app,/type:'list_swipe_review'/);
const listCode=app.slice(app.indexOf('function updateWordListProgress('),app.indexOf('function appendWordListRows(',app.indexOf('function updateWordListProgress(')));
assert.doesNotMatch(listCode.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n'),/reviewMemory\(|upsertMistake\(|dayReviews|mistakeEvents/,'scroll progress must never create FSRS entries');
assert.match(app,/upsertMistake\('vocab',id,0,'列表浏览：标记不会'/);
assert.match(reader,/window\.PipiStateSafety\?\.schedule\(localStorage\.getItem\(KEY\)\)/);
assert.match(reader,/window\.PipiStateSafety\?\.schedule\(raw,true\)/);
assert.match(html,/src="\.\/state-safety\.js"/);
assert.match(backup,/pipi-raw-emergency-v1/);
assert.match(backup,/id="rawBackup"/);
assert.match(backup,/PipiBackup\.applyStorage\(localStorage/);
assert(!app.includes('state={...defaultState(),...s};state.fsrsMigration=0;migrateNotebook()'), 'unsafe direct importer removed');

const existing=JSON.stringify({settingsVersion:1,vocab:{'w42':{knownCount:8}},dayTasks:{}});
assert(guard.valid(existing),'older valid records without testResults must be loadable');
assert(!guard.valid(JSON.stringify({settingsVersion:1,vocab:[],dayTasks:{}})),'array is not a valid vocab map');
assert(!guard.valid('{malformed json'));
const source=app.slice(app.indexOf('function getState(){'),app.indexOf('\nlet state=getState();'));
assert(source.startsWith('function getState(){'));
function boot(raw){
 const writes=[],target={innerHTML:''},KEY='sprint7_complete_v1';
 const context={KEY,window:{PipiStateSafety:guard},document:{getElementById:id=>id==='content'?target:null},localStorage:{getItem:()=>raw,setItem:(k,v)=>writes.push([k,v])},defaultState:()=>({settingsVersion:1,vocab:{},dayTasks:{},testResults:[],wordBook:'ielts'}),JSON,Error};
 vm.createContext(context);vm.runInContext(source+'\nresult=getState()',context);
 return {writes,target,state:context.result};
}
const newUser=boot(null);
assert.equal(newUser.state.wordBook,'ielts');
const oldUser=boot(existing);
assert.equal(oldUser.state.vocab.w42.knownCount,8);
assert(Array.isArray(oldUser.state.testResults));
assert.equal(oldUser.writes.length,0);
const writes=[],target={innerHTML:''};
const broken={KEY:'sprint7_complete_v1',window:{PipiStateSafety:guard},document:{getElementById:()=>target},localStorage:{getItem:()=>'{broken',setItem:(k,v)=>writes.push([k,v])},defaultState:()=>({settingsVersion:1,vocab:{},dayTasks:{}}),JSON,Error};
vm.createContext(broken);
assert.throws(()=>vm.runInContext(source+'\ngetState()',broken),/保护异常的学习数据/);
assert.equal(writes.length,0,'do not write a default state over an existing corrupt record');
assert(target.innerHTML.includes('backup.html'),'blocked user must be routed to recovery');
console.log('PASS V5.12: corrupted-save lock, legacy migration, backup emergency export, unknown-only list scrolling and reader checkpoint wiring');

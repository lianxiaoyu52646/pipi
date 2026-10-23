const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(root,'backup.html'),'utf8');
const start=html.indexOf('// V5.12.14: Prefer newest verified SQLite record');
const end=html.indexOf('function save(name,text)',start);
assert(start>0&&end>start);
const backup=require(path.join(root,'backup-core.js'));
const main=(rev,id)=>JSON.stringify({settingsVersion:1,_pipiRevision:rev,vocab:{['lex:'+id]:{due:'2026-10-25'}},dayTasks:{},testResults:[]});
function fixture(){
 let native=main(40,'original'),reader='{}',failReader=false, failPrimary=false;
 const map=new Map([[backup.MAIN,main(40,'original')],["sprint7_originals_progress",'{}']]);
 const storage={get length(){return map.size},key(i){return [...map.keys()][i]},getItem(k){return map.has(k)?map.get(k):null},setItem(k,v){map.set(k,String(v))},removeItem(k){map.delete(k)}};
 const bridge={getLearningStateFromSQLite:()=>native,getReaderProgressFromSQLite:()=>reader,
 saveLearningStateToSQLite(v){if(failPrimary)return false;native=v;return true},
 saveReaderProgressToSQLite(v){if(failReader)return false;reader=v;return true},
 clearLearningStateSQLite(){native='';reader='';return true}};
 const scope={PipiBackup:backup,window:{SprintAndroid:bridge},localStorage:storage,console,JSON,Object,Math};
 vm.createContext(scope);vm.runInContext(html.slice(start,end),scope);
 return {scope,map,bridge,native:()=>native,reader:()=>reader,failReader(v){failReader=v},failPrimary(v){failPrimary=v}};
}
{
 const x=fixture();x.scope.safeRestoreStorage({[backup.MAIN]:main(2,'restored'),sprint7_originals_progress:'{"tom":{"page":2}}'});
 const n=JSON.parse(x.native());assert(n._pipiRevision>40);assert(n.vocab['lex:restored']);
 assert.equal(x.map.get(backup.MAIN),x.native());assert.equal(x.reader(),'{"tom":{"page":2}}');
 assert.equal(x.scope.capturedCurrent()[backup.MAIN],x.native());
}
{
 const x=fixture();x.failReader(true);assert.throws(()=>x.scope.safeRestoreStorage({[backup.MAIN]:main(2,'new'),sprint7_originals_progress:'{"tom":2}'}),/回滚/);
 assert(JSON.parse(x.native()).vocab['lex:original']);assert(JSON.parse(x.map.get(backup.MAIN)).vocab['lex:original']);
}
{
 const x=fixture();x.failPrimary(true);assert.throws(()=>x.scope.safeRestoreStorage({[backup.MAIN]:main(5,'bad')}),/回滚/);
 assert(JSON.parse(x.map.get(backup.MAIN)).vocab['lex:original']);
}
console.log('PASS V5.12.14: SQLite-priority export, old-backup rebasing, native failure and rollback');

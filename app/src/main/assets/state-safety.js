/* Pipi V5.12 – crash-resistant local learning data snapshots.
 * localStorage stays the synchronous primary store for compatibility with all
 * installed V3–V5 versions. IndexedDB holds checksum-validated, rotating
 * recovery points; no network, hidden upload or account requirement.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PipiStateSafety=api;})(typeof window==='object'?window:null,function(){
'use strict';
const DB='pipi_state_recovery_v57',STORE='snapshots',MAIN='sprint7_complete_v1',STORAGE=/^(?:sprint7_|pipi_)[a-z0-9_-]{1,80}$/i;
const KEEP=5, MAX_RAW=12_000_000;
let pending='',timer=null,lastSaved=0,nonce=0,lastChecksum='',writing=Promise.resolve();
function valid(raw){
 if(typeof raw!=='string'||!raw.length||raw.length>MAX_RAW)return false;
 try{const x=JSON.parse(raw);return !!x&&x.settingsVersion===1&&x.vocab&&typeof x.vocab==='object'&&!Array.isArray(x.vocab)&&x.dayTasks&&typeof x.dayTasks==='object'&&!Array.isArray(x.dayTasks)&&(!('testResults' in x)||Array.isArray(x.testResults))}catch{return false}
}
function checksum(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16)}
function database(){return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined')return reject(Error('当前设备不支持IndexedDB'));
 const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'slot'})};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('无法打开快照数据库'));
})}
function capture(raw){
 const storage=Object.create(null);
 if(typeof localStorage!=='undefined')for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(k&&STORAGE.test(k)){
   const v=localStorage.getItem(k);if(typeof v==='string'&&v.length<MAX_RAW)storage[k]=v;
  }
 }
 storage[MAIN]=raw;
 return storage;
}
async function writeSnapshot(raw){
 const hash=checksum(raw),storage=capture(raw),storageHash=checksum(JSON.stringify(storage));
 if(storageHash===lastChecksum)return true;
 const db=await database(),stamp=Date.now();
 const snapshot={slot:'save-'+stamp+'-'+(++nonce),at:new Date(stamp).toISOString(),key:MAIN,checksum:hash,raw,storage};
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   store.put(snapshot);
   // Keep five DISTINCT recovery points. Legacy `slot0`–`slot4`
   // remain readable and are trimmed together with newer snapshots.
   const request=store.getAll();
   request.onsuccess=()=>{
    const rows=(request.result||[]).filter(x=>x&&x.slot).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))||String(b.slot).localeCompare(String(a.slot)));
    for(const old of rows.slice(KEEP))store.delete(old.slot);
   };
   request.onerror=()=>{try{tx.abort()}catch(_){}};
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('快照写入失败'));tx.onabort=()=>reject(tx.error||Error('快照事务中断'));
  });lastSaved=stamp;lastChecksum=storageHash;return true;
 }finally{db.close()}
}
function flush(){
 if(timer!==null){clearTimeout(timer);timer=null}
 const raw=pending;pending='';if(!valid(raw))return writing.then(()=>false);
 // Serialized writes prevent an older IndexedDB transaction from replacing a
 // newer checkpoint when answers arrive rapidly.
 writing=writing.catch(()=>{}).then(()=>writeSnapshot(raw));
 return writing;
}
function schedule(raw,urgent=false){
 if(!valid(raw))return false;
 pending=raw;
 if(urgent){flush().catch(e=>console.warn('皮皮学习数据即时快照失败',e));return true}
 if(timer===null){const wait=Math.max(1200,30000-(Date.now()-lastSaved));timer=setTimeout(()=>flush().catch(e=>console.warn('皮皮自动快照失败',e)),wait)}
 return true;
}
async function latest(){
 // Flush a pending good state before searching for a recovery point only when
 // explicitly requested; callers restoring corruption must not first overwrite
 // their older good backup with the corrupt primary record.
 await writing.catch(()=>{});
 const db=await database();try{
  const rows=await new Promise((resolve,reject)=>{
   const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();
   r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);
  });
  return rows.filter(x=>x?.key===MAIN&&valid(x.raw)&&checksum(x.raw)===x.checksum)
   .sort((a,b)=>String(b.at).localeCompare(String(a.at))||String(b.slot).localeCompare(String(a.slot)))[0]||null;
 }finally{db.close()}
}
if(typeof window==='object'&&window?.addEventListener){
 window.addEventListener('pagehide',()=>{if(pending)flush().catch(()=>{})});
 document?.addEventListener?.('visibilitychange',()=>{if(document.hidden&&pending)flush().catch(()=>{})});
}
async function clear(){
 if(timer!==null){clearTimeout(timer);timer=null}
 pending='';await writing.catch(()=>{});
 const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}
 lastChecksum='';lastSaved=0;
 return true;
}
return {schedule,flush,latest,clear,valid,checksum};
});

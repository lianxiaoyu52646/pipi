/* Persistent on-device speech recordings, not part of the small JSON learning-state backup. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PipiSpeakingArchive=api;})(typeof window==='object'?window:null,function(){
'use strict';
const NAME='pipi_speaking_recordings_v1';
function open(){return new Promise((res,rej)=>{
 if(typeof indexedDB==='undefined')return rej(Error('设备不支持录音本地归档'));
 const r=indexedDB.open(NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('audio'))r.result.createObjectStore('audio')};
 r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error||Error('无法打开录音库'));
 })}
async function operation(method,id,blob){const db=await open();return new Promise((res,rej)=>{
 let tx;try{tx=db.transaction('audio',method==='get'?'readonly':'readwrite');const req=tx.objectStore('audio')[method==='put'?'put':method](...(method==='put'?[blob,id]:[id]));
 tx.oncomplete=()=>{db.close();res(method==='get'?req.result:true)};tx.onerror=()=>{db.close();rej(tx.error||Error('录音存储失败'))};
 }catch(e){db.close();rej(e)}
 })}
return {put:(id,blob)=>{if(!id||!(blob instanceof Blob)||!blob.size)return Promise.reject(Error('录音内容为空'));return operation('put',id,blob)},get:id=>operation('get',id)};
});

/* 皮皮 V5.1 本机备份：备份格式校验、两阶段恢复、失败回滚。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PipiBackup=api;})(typeof window==='object'?window:null,function(){
'use strict';
const MAIN='sprint7_complete_v1';
const ALLOWED=/^(?:sprint7_|pipi_)[a-z0-9_-]{1,80}$/i;
function isRecord(x){return !!x&&typeof x==='object'&&!Array.isArray(x)}
function parse(input){
 const obj=typeof input==='string'?JSON.parse(input):input;
 let storage,bookCache;
 if(obj?.format==='pipi-offline-backup-v2'){storage=obj.storage;bookCache=obj.bookCache||[]}
 else if(obj?.format==='sprint7-android-backup-v1'){storage=obj.storage;bookCache=[]}
 else if(isRecord(obj)&&obj.settingsVersion===1){storage={[MAIN]:JSON.stringify(obj)};bookCache=[]}
 else throw Error('不是皮皮兼容的备份格式');
 if(!isRecord(storage)||!Object.prototype.hasOwnProperty.call(storage,MAIN))throw Error('备份缺少主学习记录');
 const cleaned=Object.create(null);
 for(const [key,val] of Object.entries(storage)){
   if(!ALLOWED.test(key)||typeof val!=='string'||val.length>14_000_000)throw Error('备份包含不合法的数据项：'+key);
   cleaned[key]=val;
 }
 let main;try{main=JSON.parse(cleaned[MAIN])}catch{throw Error('主学习记录不是有效 JSON')}
 if(!isRecord(main)||main.settingsVersion!==1||!isRecord(main.vocab)||!isRecord(main.dayTasks))throw Error('主学习记录结构不完整');
 // Earlier legitimate V3/V4 records can omit this optional history array.
 // Normalize only during an explicit user-initiated restore; reject a malformed
 // non-array value instead of silently erasing potentially recoverable history.
 if(main.testResults===undefined){main.testResults=[];cleaned[MAIN]=JSON.stringify(main)}
 else if(!Array.isArray(main.testResults))throw Error('主学习记录结构不完整');
 if(!Array.isArray(bookCache)||bookCache.length>7)throw Error('词书缓存数据无效');
 const list=bookCache.map((row)=>{
   if(!isRecord(row)||!['cet4','cet6','ielts','toefl'].includes(row.key)||typeof row.text!=='string'||row.text.length<5000||row.text.length>4_000_000)throw Error('备份中的词书文件不完整');
   return {key:row.key,text:row.text,source:'local-import',downloaded:row.downloaded||new Date().toISOString()};
 });
 if(new Set(list.map(x=>x.key)).size!==list.length)throw Error('备份词书有重复数据');
 return {storage:cleaned,bookCache:list,format:obj.format||'legacy',keys:Object.keys(cleaned).length};
}
function capture(storage){const data=Object.create(null);for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&ALLOWED.test(key)){const value=storage.getItem(key);if(value!==null)data[key]=value}}return data}
function applyStorage(storage,values){const backups=new Map(),written=[];
 try{
  for(const [key,val] of Object.entries(values)){
    backups.set(key,storage.getItem(key));
    storage.setItem(key,val);written.push(key);
  }
  const current=JSON.parse(storage.getItem(MAIN));if(!current||current.settingsVersion!==1)throw Error('恢复后校验失败');
  return true;
 }catch(e){
  let rollbackError=null;
  for(const key of written.reverse())try{const old=backups.get(key);if(old===null)storage.removeItem(key);else storage.setItem(key,old)}catch(err){rollbackError=err}
  if(rollbackError)throw Error('恢复中断且部分数据未能回滚：'+rollbackError.message);
  throw Error('恢复未生效，已回滚：'+e.message);
 }
}
return {MAIN,parse,capture,applyStorage};
});

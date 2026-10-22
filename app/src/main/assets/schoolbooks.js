/* Sprint7 school wordbooks: local 20-volume dataset; shares existing FSRS IDs. */
(function(){
'use strict';
if (!window.SprintBooks) {console.error('Sprint7: wordbooks.js must load before schoolbooks.js'); return;}
const api=window.SprintBooks;
const GRADES={
 primary:{label:'小学英语 · 3—6年级',short:'小学 3—6年级',expected:851,level:'小学',tone:'mint',isSchool:true},
 junior:{label:'初中英语 · 7—9年级',short:'初中 7—9年级',expected:2642,level:'初中',tone:'sky',isSchool:true},
 senior:{label:'高中英语 · 必修和选择性必修',short:'高中 必修+选修',expected:2731,level:'高中',tone:'violet',isSchool:true}
};
const status=new Map(),cache=new Map(),maps=new Map(),pending=new Map();
for (const [id,meta] of Object.entries(GRADES))api.BOOKS[id]={...meta};
const old={stats:api.stats,get:api.get,load:api.load,lookup:api.lookup,snapshot:api.snapshot,importText:api.importText};
function validate(data,key){
 if (!data || data.format!=='sprint7-schoolbook-v1' || data.stage!==key || !Array.isArray(data.words) || !Array.isArray(data.volumes) || data.volumes.length!==({primary:8,junior:5,senior:7})[key]) throw new Error('学段词书格式或分册数量不正确');
 const expected=GRADES[key].expected;
 if (data.words.length<expected*.58)throw new Error('学段词书数据缺失，拒绝载入');
 const seen=new Set();
 for (const w of data.words){
  if (!w || typeof w.word!=='string' || typeof w.zh!=='string' || !w.id?.startsWith('lex:') || seen.has(w.id) || !/[\u3400-\u9fff]/.test(w.zh)) throw new Error('学段词书有重复或无效词条');
  seen.add(w.id);
 }
 return data.words;
}
async function load(key,opts={}){
 if (!GRADES[key])return old.load(key,opts);
 if (cache.has(key)&&!opts.reload)return cache.get(key);
 if (pending.has(key))return pending.get(key);
 status.set(key,{phase:'loading',count:0});
 const task=(async()=>{
   const response=await fetch(`./schoolbooks/${key}.json`,{cache:'no-cache'});
   if(!response.ok)throw new Error('尚未安装'+GRADES[key].short+'词书，请运行 v15 安装补丁');
   const data=await response.json();const rows=validate(data,key);
   cache.set(key,rows);maps.set(key,new Map(rows.map(w=>[w.id,w])));
   status.set(key,{phase:'ready',count:rows.length,origin:'bundled-offline',volumeCount:data.volumes.length});
   return rows;
 })().catch(err=>{status.set(key,{phase:'error',count:0,error:String(err.message)});throw err}).finally(()=>pending.delete(key));
 pending.set(key,task);return task;
}
api.load=load;
api.get=key=>GRADES[key]?(cache.get(key)||[]):old.get(key);
api.stats=key=>GRADES[key]?(status.get(key)||{phase:'empty',count:0}):old.stats(key);
api.lookup=id=>{
 const current=window.SprintSchools?.getActive?.();
 if(GRADES[current]){const found=maps.get(current)?.get(id);if(found)return found;}
 const prev=old.lookup(id);if(prev)return prev;
 for(const map of maps.values())if(map.has(id))return map.get(id);
 return null;
};
api.snapshot=()=>({...old.snapshot(),...Object.fromEntries(Object.keys(GRADES).map(k=>[k,api.stats(k)]))});
api.importText=(key,txt)=>{
 if(GRADES[key])throw new Error('学段词书已随项目安装，不需要单独导入 TXT');
 return old.importText(key,txt);
};
window.SprintSchools={GRADES,validate};
})();

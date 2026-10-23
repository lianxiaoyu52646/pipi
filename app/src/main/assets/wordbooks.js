/* Pipi offline wordbooks: exam categories derived reproducibly from bundled ECDICT `g` tags.
   Data license: ECDICT_LICENSE.txt. Labels are community study aids, not official test syllabi.
   User-imported wordbooks remain supported and take priority when saved in IndexedDB. */
(function(){
'use strict';
const BOOKS={
 cet4:{label:'大学英语四级',short:'四级 CET-4',filename:'四级',expected:3846,level:'四级',tone:'mint'},
 cet6:{label:'大学英语六级',short:'六级 CET-6',filename:'六级',expected:5406,level:'六级',tone:'sky'},
 ielts:{label:'雅思 IELTS',short:'雅思 IELTS',filename:'雅思',expected:5038,level:'雅思',tone:'violet'},
 toefl:{label:'托福 TOEFL',short:'托福 TOEFL',filename:'托福',expected:6970,level:'托福',tone:'peach'}
};
const dbName='sprint7_book_cache_v1';const version=1;
const memory=new Map();const maps=new Map();const statuses=new Map();const inflight=new Map();const signatures=new Map();
const stats=(key)=>statuses.get(key)||{phase:'empty',count:0};
function getDB(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('此浏览器不支持离线词库缓存'));const req=indexedDB.open(dbName,version);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('books'))req.result.createObjectStore('books')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function diskRead(key){const db=await getDB();return new Promise((resolve,reject)=>{const tx=db.transaction('books','readonly'),r=tx.objectStore('books').get(key);r.onsuccess=()=>{db.close();resolve(r.result||null)};r.onerror=()=>{db.close();reject(r.error)}})}
async function diskWrite(key,data){const db=await getDB();return new Promise((resolve,reject)=>{const tx=db.transaction('books','readwrite');tx.objectStore('books').put(data,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
function parseText(text,key){if(typeof text!=='string'||text.length<5000)throw new Error('词表文件内容不完整');const spec=BOOKS[key];if(!spec)throw new Error('无效词书');const output=[],seen=new Set();for(const line of text.replace(/\r/g,'').split('\n')){const parts=line.split('\t');if(parts.length<2)continue;let head=parts[0].trim().replace(/^\uFEFF/,'');if(!/^[A-Za-z][A-Za-z\-' ]{0,49}$/.test(head))continue;const clean=head.toLowerCase();if(seen.has(clean))continue;const meanings=parts[1].split('¦').map(item=>{const idx=item.indexOf('::');return (idx>=0?item.slice(idx+2):item).replace(/\\n/g,' ').trim()}).filter(Boolean);const zh=[...new Set(meanings)].slice(0,3).join('；').slice(0,180);if(!/[\u3400-\u9fff]/.test(zh))continue;const expressions=(parts[2]||'').split('¦').map(item=>item.split('::')[0].trim()).filter(Boolean).slice(0,2);output.push({id:'lex:'+clean,word:head,zh,level:spec.level,topic:spec.short,example:expressions.join(' · '),book:key});seen.add(clean)}if(output.length<Math.min(spec.expected*0.5,3000))throw new Error('远程词表未能完整读取');return output}
function locations(key){return ['./wordbooks-data/'+key+'.txt']}
async function fetchOne(url){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);try{const response=await fetch(url,{signal:ctrl.signal,cache:'default'});if(!response.ok)throw Error(`HTTP ${response.status}`);return await response.text()}finally{clearTimeout(timer)}}
function fingerprintItems(items){let h=2166136261;for(const w of items){const val=w.word+'\x00'+w.zh+'\x00'+(w.example||'');for(let i=0;i<val.length;i++)h=Math.imul(h^val.charCodeAt(i),16777619)}return (h>>>0).toString(16)+':'+items.length}
function fingerprint(key){return signatures.get(key)||''}
function setBook(key,items,origin){signatures.set(key,fingerprintItems(items));memory.set(key,items);maps.set(key,new Map(items.map(w=>[w.id,w])));statuses.set(key,{phase:'ready',count:items.length,origin});return items}
async function load(key,{reload=false}={}){if(!BOOKS[key])throw new Error('不存在的词书');if(memory.has(key)&&!reload)return memory.get(key);if(inflight.has(key))return inflight.get(key);const promise=(async()=>{statuses.set(key,{phase:'loading',count:0});if(!reload){try{const cached=await diskRead(key);if(cached?.text){try{return setBook(key,parseText(cached.text,key),'offline')}catch(e){}}}catch(e){}}let errors=[];for(const url of locations(key)){try{const text=await fetchOne(url);const words=parseText(text,key);setBook(key,words,'bundled');diskWrite(key,{text,downloaded:new Date().toISOString(),source:url}).catch(()=>{});return words}catch(e){errors.push(e.message)}}statuses.set(key,{phase:'error',count:0,error:errors.slice(0,2).join('；')});throw new Error('词书内置资源读取失败；请确认已成功制作完整版 APK')})();inflight.set(key,promise);try{return await promise}finally{inflight.delete(key)}}
function get(key){return memory.get(key)||[]}
function lookup(id,preferredBook){if(preferredBook&&maps.get(preferredBook)?.has(id))return maps.get(preferredBook).get(id);for(const map of maps.values())if(map.has(id))return map.get(id);return null}
async function importText(key,text){const words=parseText(text,key);await diskWrite(key,{text,downloaded:new Date().toISOString(),source:'local-import'});setBook(key,words,'local');return words}
function snapshot(){return Object.fromEntries(Object.keys(BOOKS).map(k=>[k,stats(k)]))}
window.SprintBooks={BOOKS,stats,get,load,lookup,parseText,importText,snapshot,locations,fingerprint,fingerprintItems};
})();

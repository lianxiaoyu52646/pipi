'use strict';
const assert=require('node:assert/strict');
const P=require('../app/src/main/assets/backup-core.js');
function build(initial={}){const map=new Map(Object.entries(initial));return {get length(){return map.size},key:i=>Array.from(map.keys())[i],getItem:k=>map.has(k)?map.get(k):null,setItem(k,v){map.set(k,v)},removeItem:k=>map.delete(k)}}
const base={settingsVersion:1,vocab:{'lex:apple':{dueAt:'2027-01-01'}},dayTasks:{},testResults:[],readerWords:{},bookPaths:{}};
const old=JSON.stringify(base),save={format:'pipi-offline-backup-v2',date:'2026-10-19',storage:{sprint7_complete_v1:old,sprint7_originals_progress:'{"alice":{"offset":110}}'},bookCache:[{key:'ielts',text:'a\tb\n'.repeat(2500)}]};
const parsed=P.parse(save);assert.equal(parsed.bookCache.length,1);assert.equal(parsed.keys,2);
const mem=build({sprint7_complete_v1:'original',sprint7_originals_progress:'before',other:'untouched'});
P.applyStorage(mem,parsed.storage);assert.equal(mem.getItem('sprint7_complete_v1'),old);assert.equal(mem.getItem('other'),'untouched');
const broken=build({sprint7_complete_v1:'old',sprint7_originals_progress:'previous'});
let calls=0;const orig=broken.setItem;broken.setItem=(k,v)=>{calls++;if(calls===2)throw Error('Quota exceeded');return orig(k,v)};
assert.throws(()=>P.applyStorage(broken,parsed.storage),/已回滚/);assert.equal(broken.getItem('sprint7_complete_v1'),'old');assert.equal(broken.getItem('sprint7_originals_progress'),'previous');
assert.throws(()=>P.parse({format:'pipi-offline-backup-v2',storage:{sprint7_complete_v1:'bad'}}),/JSON/);
assert.throws(()=>P.parse({format:'pipi-offline-backup-v2',storage:{sprint7_complete_v1:old,'evil':123}}),/不合法/);
console.log('PASS: backup V2 format, legacy compatibility, atomic rollback and validation');

// V5.12: older snapshots may not contain the optional testResults array.
const earlier={settingsVersion:1,vocab:{},dayTasks:{}};
const earlierRestored=P.parse({format:'pipi-offline-backup-v2',storage:{sprint7_complete_v1:JSON.stringify(earlier)}});
assert.deepEqual(JSON.parse(earlierRestored.storage.sprint7_complete_v1).testResults,[]);
assert.throws(()=>P.parse({format:'pipi-offline-backup-v2',storage:{sprint7_complete_v1:JSON.stringify({...earlier,testResults:'invalid'})}}),/结构不完整/);

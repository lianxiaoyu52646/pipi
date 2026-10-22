'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main/assets');
const core=require(path.join(root,'v5-core.js'));
const now=Date.parse('2026-10-20T09:00:00Z');
const state={vocab:{
  remembered:{dueAt:'2026-10-19T00:00:00Z',knownCount:7},
  future:{dueAt:'2026-10-25T00:00:00Z'},
  paused:{dueAt:'2026-10-01T00:00:00Z',reviewPaused:true},
  legacy:{due:'2026-10-01',knownCount:10},
},mistakes:{'word:remembered:0':{unit:'remembered',kind:'vocab',status:'mastered'}}};
assert.deepEqual(core.dueIds(state,now),['remembered','legacy']);
const text=fs.readFileSync(path.join(root,'app.js'),'utf8');
assert(text.includes('熟悉里程碑，仍会按FSRS安排复习'));
assert(!text.includes('state.vocab[unit].knownCount=0;'));
assert(text.includes("it.status='mastered'")&&text.includes('reviewMemory(unit,true)'));
console.log('PASS: learned seven times still enters spaced review; paused cards excluded; known count never reset on a lapse');

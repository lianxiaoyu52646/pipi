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
assert(text.includes('pipiReviewAnswer(true)')&&text.includes('PipiReviewLogic.enrolled(entry)'), 'all word-review entry points use FSRS without removing notebook entries');
assert(!text.includes('KNOWN_TO_ARCHIVE'),'no fixed known-count graduation threshold');
assert(!text.includes('wordArchived(id)'),'FSRS due words must not be dropped due to historic mastered badges');
assert(text.includes("it.status='pending'")&&text.includes('reviewMemory(unit,true)'));
console.log('PASS: FSRS due scheduling survives historic mastery; no seven-times removal from notebook');

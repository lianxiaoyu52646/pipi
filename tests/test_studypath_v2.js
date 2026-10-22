const assert=require('node:assert/strict');
global.window=global;
require('../app/src/main/assets/study-path.js');
const lib=window.SprintBookPath;
const rows=Array.from({length:241},(_,i)=>({id:`lex:w${String(i+1).padStart(4,'0')}`,word:`w${String(i+1).padStart(4,'0')}`,zh:'词条'}));
const state={vocab:{}};
let ctx=lib.ensure(state,'primary','alpha','all',rows);
const originalKey=ctx.key;
assert.equal(ctx.rows[0].word,'w0001');
assert.equal(lib.candidates(state,ctx,100,'2026-10-17').length,100);
for(let i=0;i<100;i++){
 ctx=lib.ensure(state,'primary','alpha','all',rows);
 assert.equal(lib.candidates(state,ctx,100,'2026-10-17')[0].word,`w${String(i+1).padStart(4,'0')}`);
 assert.equal(lib.advance(state,ctx,ctx.rows[ctx.path.position].id,'2026-10-17'),true);
}
ctx=lib.ensure(state,'primary','alpha','all',rows);
assert.equal(ctx.path.position,100);
assert.equal(lib.candidates(state,ctx,100,'2026-10-17').length,0);
assert.equal(lib.candidates(state,ctx,100,'2026-10-18')[0].word,'w0101');
console.log('PASS: 100 today => 101 tomorrow');
const restored=JSON.parse(JSON.stringify(state));
ctx=lib.ensure(restored,'primary','alpha','all',rows);
assert.equal(ctx.path.position,100);
console.log('PASS: survive persisted JSON / app restart');
for(let i=100;i<241;i++){ctx=lib.ensure(restored,'primary','alpha','all',rows);assert.equal(lib.advance(restored,ctx,ctx.rows[ctx.path.position].id,'2026-10-19'),true)}
ctx=lib.ensure(restored,'primary','alpha','all',rows);
assert.equal(ctx.path.round,2);assert.equal(ctx.path.position,0);assert.equal(ctx.rows[0].word,'w0001');
console.log('PASS: complete a book => new round from A');
const other=lib.ensure(restored,'junior','alpha','all',rows);
assert.equal(other.path.round,1);assert.equal(other.path.position,0);
const random=lib.ensure(restored,'primary','random','all',rows);
assert.equal(random.path.round,1);
console.log('PASS: book/order independent progress');
restored.vocab[rows[0].id]={dueAt:'2020-01-01'}; // FSRS data not deleted by path progress
assert.ok(restored.vocab[rows[0].id]);
console.log('PASS: FSRS record retained');

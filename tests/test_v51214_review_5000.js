'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const app=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/app.js'),'utf8');
const logic=require(path.join(__dirname,'../app/src/main/assets/review-engine.js'));
const begin=app.indexOf('const REVIEW_PAGE_SIZE='),end=app.indexOf('function reviewOne(',begin);
assert(begin>0&&end>begin);
const state={mistakes:{},vocab:{}},words={};
for(let i=0;i<5000;i++){
 const id='lex:term'+String(i).padStart(4,'0');
 state.mistakes['word:'+id+':0']={kind:'vocab',unit:id,enrollment:'manual',status:'pending',first:'2026-10-01',last:'2026-10-23',source:'词书'};
 state.vocab[id]={dueAt:new Date(Date.now()+3600000).toISOString()};words[id]={word:'term'+i,zh:'词义'+i};
}
const nodes={pipiReviewItems:{innerHTML:''},pipiReviewCount:{textContent:''},pipiReviewMore:{hidden:false,textContent:''},viewport:{scrollTop:100}};
const ctx={state,ui:{reviewFilterV5:'unknown',reviewQueryV5:'',reviewShown:70},PipiReviewLogic:logic,wordById:id=>words[id],esc:x=>String(x??''),dueLabel:()=>'',document:{getElementById:id=>nodes[id]},console};
vm.createContext(ctx);vm.runInContext(app.slice(begin,end),ctx);
let at=Date.now();vm.runInContext('updateReviewList()',ctx);assert.equal((nodes.pipiReviewItems.innerHTML.match(/data-v5-review-id/g)||[]).length,70);assert.equal(nodes.viewport.scrollTop,100);
ctx.ui.reviewQueryV5='term4999';vm.runInContext('updateReviewList(true)',ctx);assert.equal((nodes.pipiReviewItems.innerHTML.match(/data-v5-review-id/g)||[]).length,1);const ms=Date.now()-at;
assert(ms<5000,'search and render took >5 seconds in Node: '+ms);
console.log('PASS V5.12.14: 5000 items, 70-row paging, last-item search in '+ms+' ms (Node simulation)');

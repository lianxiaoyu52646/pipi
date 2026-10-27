'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assets=path.resolve(__dirname,'../app/src/main/assets');
const helper=fs.readFileSync(path.join(assets,'pipi-review-phonetics.js'),'utf8');
const app=fs.readFileSync(path.join(assets,'app.js'),'utf8');
const html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
const css=fs.readFileSync(path.join(assets,'pipi-review-v51217.css'),'utf8');
function makeTextNode(word){return {dataset:{pipiPhoneticWord:word,pipiPhoneticState:'pending'},isConnected:true,textContent:'音标查询中…',getBoundingClientRect(){return {top:0,bottom:24}}};}
function makeRuntime(dictionary){
 const calls=[];
 const root={console:{debug:()=>{}},SprintECDICT:{lookup:async word=>{calls.push(word);return dictionary[word]||null;}},document:{}};
 vm.runInNewContext(helper,{window:root,setTimeout,clearTimeout,Promise,Map,console});
 return {api:root.PipiReviewPhonetics,root,calls};
}
(async()=>{
 const {api,calls}=makeRuntime({abandon:{phonetic:'əˈbændən'},apple:{phonetic:'/ˈæpəl/'},empty:{phonetic:''}});
 assert.equal(api.format('  /əˈbændən/  '),'/əˈbændən/');
 assert.equal(api.format('[ˈæpəl]'),'/ˈæpəl/');
 assert.equal(api.format("ә'bændәn"),'/əˈbændən/');
 assert.equal(api.format("hә'lәu"),'/həˈləu/');
 assert.equal(api.format('undefined'),'');
 assert.equal(api.format(''),'');
 assert.equal(api.format(null),'');
 assert.equal(await api.lookup('abandon'),'/əˈbændən/');
 assert.equal(api.peek('ABANDON'),'/əˈbændən/');
 await Promise.all([api.lookup('apple'),api.lookup('apple'),api.lookup('apple')]);
 assert.equal(calls.filter(v=>v==='apple').length,1,'simultaneous lookup must be deduped');
 const shown=makeTextNode('abandon');
 api.hydrateSheet({querySelector:()=>shown});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(shown.textContent,'/əˈbændən/');
 assert.equal(shown.dataset.pipiPhoneticState,'ready');
 const empty=makeTextNode('empty');
 api.hydrateSheet({querySelector:()=>empty});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(empty.textContent,'暂无音标 · 可点发音');
 assert.equal(empty.dataset.pipiPhoneticState,'missing');
 // Stale lookup should never replace a card that has switched to another word.
 let resolveSlow;
 const slow=makeRuntime({});
 slow.root.SprintECDICT.lookup=()=>new Promise(resolve=>{resolveSlow=resolve;});
 const stale=makeTextNode('late');slow.api.hydrateSheet({querySelector:()=>stale});
 await new Promise(resolve=>setImmediate(resolve));
 stale.dataset.pipiPhoneticWord='new';stale.textContent='音标查询中…';
 resolveSlow({phonetic:'ˈleɪt'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(stale.textContent,'音标查询中…','stale result must not change next card');
 // IntersectionObserver must avoid eager loading all rows.
 const items=Array.from({length:70},(_,i)=>makeTextNode('word'+i));
 class FakeObserver{
  constructor(fn,opts){this.cb=fn;this.opts=opts;FakeObserver.instance=this;}
  observe(el){this.observed=(this.observed||[]);this.observed.push(el);}
  unobserve(){}disconnect(){}
 }
 const visibleRuntime=makeRuntime({});
 visibleRuntime.root.IntersectionObserver=FakeObserver;
 visibleRuntime.root.document={getElementById:()=>({}),querySelectorAll:()=>items};
 visibleRuntime.api.hydrateList();
 assert.equal(FakeObserver.instance.observed.length,70);
 assert.equal(visibleRuntime.calls.length,0,'do not fetch 70 words before they are visible');
 FakeObserver.instance.cb([{isIntersecting:true,target:items[0]}]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(visibleRuntime.calls.length,1);
 // UI uses phonetics in both list and sheet, but keeps Chinese gated.
 assert.match(app,/data-pipi-phonetic-word="\$\{esc\(name\)\}"/);
 assert.match(app,/class="pipi-review-hero-phonetic" data-pipi-phonetic-word="\$\{esc\(w\.word\)\}"/);
 assert.match(app,/class="pipi-review-answer-area" hidden/);
 assert.match(app,/if\(ui\.page==='review'\).*hydrateList/);
 assert.match(app,/hydrateSheet/);
 assert.match(html,/ecdict-offline\.js[\s\S]*pipi-review-phonetics\.js[\s\S]*app\.js/);
 assert.match(css,/\.pipi-review-hero-phonetic/);
 const version=fs.readFileSync(path.join(assets,'../../../build.gradle'),'utf8').match(/versionName '([^']+)'/)[1];
 assert.equal(fs.readFileSync(path.join(assets,'app-version.js'),'utf8').includes(version),true);
 console.log('PASS V5.12.18 phonetic: ECDICT offline lookup, normalized IPA, caching, lazy list, stale card guard, graceful missing, UI binding');
})().catch(e=>{console.error(e);process.exit(1);});

(function(){
'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='sprint7_complete_v1';
let current=null, requestNo=0, timer=null;
function valid(raw){try{const s=JSON.parse(raw);return s?.settingsVersion===1&&s.vocab&&typeof s.vocab==='object'&&s.dayTasks&&typeof s.dayTasks==='object'}catch(_){return false}}
function revision(raw){try{return Math.max(0,Number(JSON.parse(raw)._pipiRevision)||0)}catch(_){return 0}}
function latestRaw(){const local=localStorage.getItem(KEY),android=window.SprintAndroid;let native='';
 try{native=android?.getLearningStateFromSQLite?.()||''}catch(e){console.warn('读取SQLite失败',e)}
 if(valid(native)&&(!valid(local)||revision(native)>revision(local)))return native;
 if(valid(local))return local;
 if(local||native)throw Error('学习记录校验失败，请先在数据备份页恢复，禁止覆盖');
 return '';
}
function state(){const raw=latestRaw();return raw?JSON.parse(raw):{settingsVersion:1,vocab:{},mistakes:{},readerWords:{},dayTasks:{},mistakeEvents:[]}}
function persist(s){try{
 const before=latestRaw(),expected=revision(before);
 // If another page saved in the meantime, never silently overwrite newer records.
 if((Number(s._pipiRevision)||0)!==expected)throw Error('其他页面更新了学习记录，请重新打开词条再操作');
 s._pipiRevision=expected+1;const raw=JSON.stringify(s),android=window.SprintAndroid;
 if(android){
  const commit=android.saveLearningStateIfRevision;
  if(typeof commit==='function'){if(!commit.call(android,raw,expected))throw Error('SQLite版本冲突或保存失败，请重新打开词条');}
  else if(!android.saveLearningStateToSQLite?.(raw))throw Error('SQLite保存失败');
 }
 try{localStorage.setItem(KEY,raw)}catch(e){if(!android)throw e;console.warn('SQLite保存成功，但浏览器镜像延迟',e)}
 window.PipiStateSafety?.schedule?.(raw,true);
 return true;
 }catch(e){console.error('离线词典记录保存失败',e);alert('学习记录未保存：'+e.message);return false}}

function history(){try{return JSON.parse(localStorage.getItem('sprint7_ecdict_recent')||'[]')}catch{return []}}
function record(word){const h=[word,...history().filter(w=>w!==word)].slice(0,12);localStorage.setItem('sprint7_ecdict_recent',JSON.stringify(h));drawRecent()}
function drawRecent(){const h=history();$('recentSection').hidden=!h.length;$('recentWords').innerHTML=h.map(w=>`<button data-word="${esc(w)}">${esc(w)}</button>`).join('')}
function speak(w){if(window.PipiVoice){window.PipiVoice.speak(w);return}if(window.SprintAndroid&&window.SprintAndroid.speak){window.SprintAndroid.speak(String(w||""));return;}if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(w);utter.lang='en-US';window.speechSynthesis.speak(utter)}
function notes(text){return esc(text).replace(/\\n/g,'\n')}
function showEntry(data){
 current=data;
 const t=data.translation||'';
 const back=data.inflected?`（原形：${data.original}）`:'';
 $('result').innerHTML=`<article class="resultcard"><div class="wordtop"><div><h2>${esc(data.query)} <span style="font-size:15px;color:#9697ad;font-weight:500">${esc(back)}</span></h2>${data.phonetic?`<div class="phonetic">/${esc(data.phonetic)}/</div>`:''}</div><button id="audio">◖)) 发音</button></div><div class="blocklabel">中文释义</div><div class="definition">${t?notes(t):'<span style="color:#a0a1af">该原始词条暂未收录中文，可参考下方英文解释。</span>'}</div>${data.definition?`<div class="blocklabel">English definition</div><div class="english">${notes(data.definition)}</div>`:''}<div class="tags">${data.tag?`<span>${esc(data.tag)}</span>`:''}${data.exchange?`<span>词形：${esc(data.exchange.slice(0,240))}</span>`:''}</div><div class="actions"><button id="unknown" class="unknown">不会 · 加入生词本</button><button id="known" class="known">会 · FSRS复习</button></div></article>`;
 $('audio').addEventListener('click',()=>speak(data.query));$('unknown').addEventListener('click',()=>review(false));$('known').addEventListener('click',()=>review(true));
}
async function search(w){
 const query=w.trim();const serial=++requestNo;
 if(!query){current=null;$('result').innerHTML='<section class="empty"><span>📖</span><h2>你的个人英汉词典</h2><p>输入英文后开始离线查找。</p></section>';return}
 $('result').innerHTML='<section class="empty"><p>正在本机离线词典检索…</p></section>';
 try{const row=await SprintECDICT.lookup(query);if(serial!==requestNo)return;
 if(row){showEntry(row);record(row.query)}else{current=null;$('result').innerHTML='<section class="empty"><p>ECDICT 未找到这个词。请检查拼写；部分人名、缩写或新词可能不收录。</p></section>'}
 }catch(e){if(serial!==requestNo)return;current=null;$('result').innerHTML=`<section class="empty"><p>${esc(e.message)}。如果刚安装词典，请按 Ctrl+F5 刷新。</p></section>`}
}
function review(known){
 if(!current)return;
 const word=String(current.query||'').trim().toLowerCase(),unit='lex:'+word,id='word:'+unit+':0';
 let s;try{s=state()}catch(e){alert(e.message);return}
 s.vocab=s.vocab||{};s.mistakes=s.mistakes||{};s.readerWords=s.readerWords||{};s.mistakeEvents=s.mistakeEvents||[];
 const entry=s.mistakes[id]||{},old=s.vocab[unit]||{};
 // Only explicit 不会 creates a card; 会 on an existing active card updates FSRS.
 const enrolled=entry.enrollment==='manual'&&entry.status!=='removed';
 if(known&&!enrolled){alert('已认识的词无需加入生词本；只有点「不会」才创建 FSRS 生词卡。');return}
 const next=window.SprintFSRS?.schedule?.(old,known);
 if(!next){alert('FSRS 调度器尚未就绪，未保存');return}
 const n=(Number(old.knownCount)||0)+(known?1:0),stamp=new Date().toISOString();
 s.vocab[unit]={...old,...next,knownCount:n,knownTotal:(Number(old.knownTotal)||0)+(known?1:0),reps:known?(Number(old.reps)||0)+1:0,lapses:(Number(old.lapses)||0)+(known?0:1),reviewPaused:false};
 delete s.vocab[unit]._pipiLegacyPaused;
 const existing=s.readerWords[unit]||{};s.readerWords[unit]={id:unit,word,zh:current.translation||current.definition||'待补充释义',level:'离线词典',topic:'英汉词典',book:'dictionary',...existing};
 const source={bookId:'dictionary',title:'ECDICT 离线词典',sentence:''};
 const origins=Array.isArray(entry.origins)?entry.origins.slice():[];
 if(!origins.some(o=>o.bookId==='dictionary'))origins.push(source);
 s.mistakes[id]={...entry,kind:'readingword',unit,q:0,detail:'离线词典：主动标记不会',source:'ECDICT 离线词典',enrollment:'manual',origins:origins.slice(-40),seen:(Number(entry.seen)||0)+(known?0:1),success:n,status:'pending',first:entry.first||stamp,last:stamp,dueAt:next.dueAt};
 if(!known)s.mistakeEvents.push({id,kind:'readingword',unit,at:stamp,source:'ECDICT 离线词典',detail:'主动标记不会'});
 if(s.mistakeEvents.length>12000)s.mistakeEvents=s.mistakeEvents.slice(-12000);
 if(!persist(s))return;
 const button=$(known?'known':'unknown');button.textContent=known?'已按 FSRS 安排下次复习':'已加入 FSRS 生词本';
}
$('q').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>search(e.target.value),180)});
$('q').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(timer);search(e.target.value);e.target.blur()}});
$('clear').addEventListener('click',()=>{$('q').value='';search('');$('q').focus()});
$('recentWords').addEventListener('click',e=>{const b=e.target.closest('[data-word]');if(b){$('q').value=b.dataset.word;search(b.dataset.word)}});
if(window.SprintAndroid){$('offlineBtn').hidden=true;$('cacheProgress').textContent='词典已包含在 APK 内，无需再次复制到本机缓存。';}else $('offlineBtn').addEventListener('click',async()=>{const b=$('offlineBtn');b.disabled=true;try{if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);await SprintECDICT.precacheAll((n,total)=>{$('cacheProgress').textContent=`已缓存 ${n}/${total} 个分片`});$('cacheProgress').textContent='全部256个分片已缓存，支持离线查词（清除浏览器数据后需重新缓存）。'}catch(e){$('cacheProgress').textContent='缓存失败：'+e.message}finally{b.disabled=false}});
SprintECDICT.manifest().then(m=>{const s=$('status');s.className='status good';s.textContent=`完整离线词典已就绪 · ${Number(m.entries).toLocaleString('zh-CN')} 条词目 · ${Number(m.with_chinese).toLocaleString('zh-CN')} 条有中文`}).catch(e=>{const s=$('status');s.className='status warn';s.textContent=e.message});
drawRecent();const initial=new URLSearchParams(location.search).get('word');if(initial){$('q').value=initial;search(initial)}
})();

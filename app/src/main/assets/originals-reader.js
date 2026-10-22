/* Sprint7 · Original English Library — source-faithful PG text reader.
 * Books are read from bundled APK assets. Verify actual count with asset-status.js.
 * Source texts must pass chapter count validation before the reader labels them complete.
 */
(function(){
'use strict';
const BOOKS=window.OriginalBooks||[];
const $=id=>document.getElementById(id);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DB='sprint7_original_texts_v1',KEY='sprint7_complete_v1';
const M=window.OriginalGlossary||{};
const miniWords=Object.fromEntries(((typeof BANK!=='undefined'&&BANK.words)||[]).map(w=>[w.word.toLowerCase(),w.zh]));
const offlineLexicon=window.SprintOfflineLexicon||{};
const memory=new Map();
let cachedIds=new Set();
const ctx={book:null,work:null,chapter:0,page:0,font:Number(localStorage.getItem('sprint7_originals_font')||19),word:null,sentence:'',toastTimer:0,pages:[],resumeOffset:null,restoreAnchor:null,anchor:null,suppressTapUntil:0};
const now=()=>new Date().toISOString();
const getMain=()=>{const raw=localStorage.getItem(KEY);
 if(raw===null)return {settingsVersion:1,vocab:{},mistakes:{},readerWords:{},dayTasks:{},testResults:[]};
 if(!window.PipiStateSafety?.valid(raw))throw Error('原有学习记录异常，禁止覆盖；请先前往数据备份页恢复');
 return JSON.parse(raw);
};
const putMain=s=>{try{const raw=JSON.stringify(s);localStorage.setItem(KEY,raw);if(localStorage.getItem(KEY)!==raw)throw Error('存储校验失败');window.PipiStateSafety?.schedule(raw,true);return true}catch(e){toast('无法保存生词记录：请先导出学习数据');return false}};
const getProgress=()=>{try{return JSON.parse(localStorage.getItem('sprint7_originals_progress')||'{}')}catch{return {}}};
function readingFraction(){if(!ctx.work?.sections?.length)return 0;
 const before=ctx.work.sections.slice(0,ctx.chapter).reduce((sum,x)=>sum+(x.wordCount||0),0);
 const section=ctx.work.sections[ctx.chapter],portion=(section?.wordCount||0)*((ctx.page+1)/Math.max(ctx.pages.length,1));
 return Math.min(100,Math.round(100*(before+portion)/Math.max(1,ctx.work.wordCount||1)));
}
function setProgress(){const s=getProgress(),percent=readingFraction();
 s[ctx.book.id]={chapter:ctx.chapter,page:ctx.page,offset:ctx.pages[ctx.page]?.start||0,paragraph:ctx.anchor?.chapter===ctx.chapter?ctx.anchor.paragraph:null,paragraphFraction:ctx.anchor?.chapter===ctx.chapter?ctx.anchor.fraction:0,percent,last:now(),schema:2};
 try{localStorage.setItem('sprint7_originals_progress',JSON.stringify(s));window.PipiStateSafety?.schedule(localStorage.getItem(KEY));$('cacheMetric').textContent='书签已保存'}
 catch(e){$('cacheMetric').textContent='书签保存失败';const t=Date.now();if(!ctx.lastSaveError||t-ctx.lastSaveError>10000){toast('阅读位置保存失败，请先导出学习记录');ctx.lastSaveError=t}}
 $('readingPercent').textContent=percent+'% 已读';$('readingProgressFill').style.width=percent+'%';if($('playerPercent'))$('playerPercent').textContent=percent+'%';
}
function openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('此浏览器不支持离线书籍存储'));const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('works');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function store(kind,key,value){const db=await openDB();return new Promise((resolve,reject)=>{let tx=db.transaction('works',kind==='get'?'readonly':'readwrite');let r=kind==='get'?tx.objectStore('works').get(key):kind==='delete'?tx.objectStore('works').delete(key):tx.objectStore('works').put(value,key);r.onerror=()=>reject(r.error);tx.oncomplete=()=>{db.close();resolve(kind==='get'?r.result:true)};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function savedKeys(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('works','readonly'),r=tx.objectStore('works').getAllKeys();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();reject(r.error)}})}
function tokenize(txt){return String(txt).match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)||[]}
function removePGHeader(txt){let s=txt.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const start=/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(s);if(start)s=s.slice(start.index+start[0].length);const end=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(s);if(end)s=s.slice(0,end.index);return s.trim()}
const ROM='(?:[IVXLCDM]+|\\d+)';
const NUMBER='(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?|THIRTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?|FORTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?)';
const CHAPTER_RE=new RegExp('^CHAPTER\\s+(?:'+ROM+'|'+NUMBER+')(?:\\.|:|\\s+|$)','i');
function headingFor(id,line){const x=line.trim();if(!x||x.length>130)return false;
 if(id==='christmas')return /^STAVE\s+(?:[IVX]+|ONE|TWO|THREE|FOUR|FIVE)(?:\s*[:.\s]|$)/i.test(x);
 if(id==='sherlock')return (/^ADVENTURE\s+[IVXLCDM]+\.\s+[A-Z]/i.test(x)||/^(?:VII|VIII|IX|X|XI|XII)\.\s+[A-Z][A-Z]/.test(x))&&x.length>12;
 if(id==='machine')return /^(?:[IVXLCDM]{1,6})\.?$/.test(x)||/^EPILOGUE\s*\.?$/i.test(x);
 // Gutenberg editions of these works use a standalone chapter ordinal or a number + title,
 // rather than the conventional 'CHAPTER n' heading.
 if(id==='treasure')return /^(?:[IVXLCDM]{1,7})$/.test(x);
 if(id==='willows')return /^(?:[IVXLCDM]{1,7})\.$/.test(x);
 if(id==='littleprincess')return /^(?:[1-9]|1[0-9])$/.test(x);
 if(id==='blackbeauty')return /^(?:0?[1-9]|[1-4][0-9])\s+[A-Za-z]/.test(x);
 if(id==='huckfinn' && /^CHAPTER THE LAST\.?$/i.test(x))return true;
 return CHAPTER_RE.test(x)||(/^(?:CHAPTER\s+)?(?:[IVX]{1,6})\.\s+[A-Z]/.test(x)&&id==='oz');
}
function cleanP(p){return p.replace(/\n+/g,' ').replace(/[ \t]+/g,' ').trim()}
function paragraphs(s,doubled){return window.PipiReaderParagraphs.normalizeParagraphs(s,doubled)}
/** Does not throw text away if chapter detection fails: user sees an explicit missing-asset error. */
function parseOriginal(raw,book){if(typeof raw!=='string'||raw.length<20000||raw.length>9000000)throw Error('不是有效的完整英文 TXT 文本（过小或过大）');
 const text=removePGHeader(raw),lines=text.split('\n');
 const doubledWrap=window.PipiReaderParagraphs.layoutOf(text).doubled;
 const matches=[];let offset=0;for(let i=0;i<lines.length;i++){if(headingFor(book.id,lines[i]))matches.push({line:i,start:offset,title:lines[i].trim()});offset+=lines[i].length+1}
 // PG #120 contains a typographical chapter heading 'XXVII' where 'XVII'
 // belongs, directly between XVI and XVIII. Correct the navigation label only;
 // preserve the uploaded source TXT byte-for-byte.
 if(book.id==='treasure' && matches.length===34 &&
    matches[16]?.title==='XXVII' && matches[17]?.title==='XVIII') matches[16].title='XVII';
 const need=book.expectedSections; if(matches.length<need)throw Error(`只识别到 ${matches.length}/${need} 个章节标题，不能确认这是完整原著。请使用该书官方TXT版本。`);
 // Gutenberg's Contents often repeats chapter labels once. Choose the last full run,
 // and verify that each section holds narrative text (rather than TOC lines).
 // Select the LAST COMPLETE ordinal sequence, not the last N headings.
 // This excludes all printed Contents headings even when the contents appears more than once.
 function ordinal(title){
  const roman=x=>{let total=0,prev=0;const tab={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};for(const c of x.split('').reverse()){const n=tab[c]||0;total+=n<prev?-n:n;prev=n}return total};
  let t=title.toUpperCase(),m;
  if(book.id==='machine' && /^EPILOGUE\b/.test(t))return 17;
  if(book.id==='huckfinn' && /^CHAPTER THE LAST\.?$/.test(t))return 43;
  if(book.id==='treasure')m=t.match(/^([IVXLCDM]+)$/);
  else if(book.id==='willows')m=t.match(/^([IVXLCDM]+)\.$/);
  else if(book.id==='littleprincess')m=t.match(/^(\d{1,2})$/);
  else if(book.id==='blackbeauty')m=t.match(/^(\d{1,2})\s+/);
  if(!m && book.id==='machine')m=t.match(/^([IVXLCDM]+)\.?$/);
  else if(!m && book.id==='sherlock')m=t.match(/^(?:ADVENTURE\s+)?([IVXLCDM]+)\./);
  else if(!m && book.id==='christmas')m=t.match(/^STAVE\s+([IVXLCDM]+)/);
  else if(!m)m=t.match(/^CHAPTER\s+([IVXLCDM]+|\d+|[A-Z]+(?:-[A-Z]+)?)\b/);
  if(!m)return NaN;
  const val=m[1];if(/^\d+$/.test(val))return Number(val);
  if(/^[IVXLCDM]+$/.test(val))return roman(val);
  const table=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  let n=0;for(const part of val.split('-')){const v=table.indexOf(part);if(v>0)n+=v;else if(part==='TWENTY')n+=20;else if(part==='THIRTY')n+=30;else if(part==='FORTY')n+=40;else return NaN}return n;
 }
 const chosen=[];let cursor=matches.length;
 for(let ord=need;ord>=1;ord--){let at=-1;for(let k=cursor-1;k>=0;k--){if(ordinal(matches[k].title)===ord){at=k;break}}if(at<0)throw Error(`缺少第 ${ord} 章节标题，无法确认全文完整`);chosen.unshift(matches[at]);cursor=at}
 const sections=chosen.map((m,i)=>{const end=i+1<chosen.length?chosen[i+1].start:text.length;
 const slice=text.slice(m.start,end);const lines2=slice.split('\n');const title=m.title;
 // Do not guess whether the next line is a subtitle: dropping it can silently
 // delete the first sentence of the chapter in some complete PG editions.
 lines2.shift();
 const body=lines2.join('\n').trim();return {title,body,paragraphs:paragraphs(body,doubledWrap),wordCount:tokenize(body).length};});
 if(sections.some((x,i)=>x.wordCount<(i===sections.length-1?35:80)))throw Error('某些章节正文过短，可能误读了目录，未保存该书。');
 // For editions with long prefaces or introductions, preserve them as separate sections.
 // No inferred text is inserted; all additional text comes from the exact source TXT.
 const frontStart=chosen[0].start;
 const front=text.slice(0,frontStart);
 if(['pride','oz','christmas','tom'].includes(book.id)){
   const cue=book.id==='pride'?/^(?:PREFACE\.)\s*$/im:['christmas','tom'].includes(book.id)?/^PREFACE\s*$/im:/^Introduction\s*$/im;
   const a=[...front.matchAll(new RegExp(cue.source,'gim'))].pop();
   if(a){const frontText=front.slice(a.index+a[0].length).trim();
     // Get rid of chapter listing in printed TOC; still retain the original prose.
     const cut=frontText.search(/\n\s*(?:CONTENTS|TABLE OF CONTENTS)\s*\n/i);
     const body=(cut>=0?frontText.slice(0,cut):frontText).trim();
     if(tokenize(body).length>=45&&tokenize(body).length<20000){sections.unshift({title:a[0].trim(),body,paragraphs:paragraphs(body,doubledWrap),wordCount:tokenize(body).length,frontmatter:true})}
   }
 }
 // Ensure body of first/last substantive chapters has a plausible amount of prose.
 // Multi-volume appendix: preserve non-narrative trailing material within final section by design.
 // Do not claim editorial pagination perfectly matches all printed editions.
 const work={id:book.id,source:book.source,number:book.pg,title:book.enTitle,sections,wordCount:sections.reduce((n,s)=>n+s.wordCount,0),rawLength:raw.length,paragraphSchema:window.PipiReaderParagraphs.CURRENT_SCHEMA,cachedAt:now()};
 if(work.wordCount<Math.max(8000,book.expectedSections*140))throw Error('正文长度异常，不能确认为整本原著');return work;
}
async function downloadBook(book){
 // Despite legacy function name, this ONLY loads a bundled asset. It never downloads from the Internet.
 if(ctx.book?.id!==book.id)return;
 $('loadStatus').textContent='读取手机内置 '+book.zhTitle+' 全文中…';
 try{
   // V5.7: TXT is the sole source of truth; avoid parsing a second 4MB books-data.js.
   const response=await fetch('./books/'+book.id+'.txt',{cache:'force-cache'});
   if(!response.ok)throw Error('找不到内置原文文件 (HTTP '+response.status+')');
   const raw=await response.text();
   const work=parseOriginal(raw,book);
   if(ctx.book?.id!==book.id)return;
   // Cache parsed chapter structure as an optimization; source always remains in APK.
   try{await store('put',book.id,{work})}catch(e){console.warn('Local chapter cache full; bundled reading still works',e)}
   memory.set(book.id,work);cachedIds.add(book.id);ctx.work=work;
   showReader();toast('已载入本地完整原著');
 }catch(e){
   console.warn('Bundled novel failed',e);
   $('loadStatus').textContent='本地原著读取失败：'+e.message+'。请检查 APK 内 assets/books 是否完整。';
   $('loadInfo').textContent='不会联网下载，也不会丢失原来的阅读记录。';
 }
}
function refreshShelfStats(){const progress=getProgress();$('savedBooks').textContent=(window.PipiAssetStatus?.installedBooks||BOOKS.map(b=>b.id)).length;$('progressBooks').textContent=Object.keys(progress).filter(k=>BOOKS.some(b=>b.id===k)).length;document.querySelectorAll('[data-book-state]').forEach(el=>{const id=el.dataset.bookState;el.textContent=(window.PipiAssetStatus&&!window.PipiAssetStatus.installedBooks.includes(id))?'资源未安装 · 请补齐安装包':progress[id]?'已读 '+Math.max(0,Math.min(100,Number(progress[id].percent)||0))+'% · 继续阅读':'打开本机原著'});}
async function stateCount(){refreshShelfStats();try{cachedIds=new Set([...cachedIds,...(await savedKeys()).filter(id=>BOOKS.some(b=>b.id===id))]);refreshShelfStats()}catch(e){console.warn('离线缓存统计失败',e)}}
function showShelf(push=true){saveVisibleAnchor(true);setNativeImmersive(false);stopArticleReading();ctx.book=null;ctx.work=null;document.body.classList.remove('reading-active','reading-focus');$('focusExit').hidden=true;$('focusPlay').hidden=true;closeReaderSettings();$('shelfView').hidden=false;$('bookView').hidden=true;history[push?'pushState':'replaceState']({shelf:true},'','./originals-reader.html');updateBreadcrumb();renderShelf();scrollTo({top:0,behavior:'instant'})}
function updateBreadcrumb(){const active=!!ctx.book;$('bookCrumb').hidden=!active;$('bookCrumb').textContent=active?ctx.book.zhTitle:'';$('homeShelf').textContent=active?'返回书架':'学习首页';$('readerTopBack').querySelector('span').textContent=active?'书架':'皮皮';$('homeShelf').setAttribute('aria-label',active?`返回${BOOKS.length}本英文书架`:'返回皮皮学习首页')}
function renderShelf(){const progress=getProgress();$('bookGrid').innerHTML=BOOKS.map(b=>`<button class="book-card" data-book="${b.id}"><span class="cover" style="--tone:${esc(b.accent)}"><span class="illustration">${b.emoji}</span><span class="en-title">${esc(b.enTitle)}</span></span><strong>${esc(b.zhTitle)}</strong><small>${esc(b.author)} · ${b.expectedSections}章/篇</small><span class="state-label" data-book-state="${b.id}">${progress[b.id]?'已读 '+Math.max(0,Math.min(100,Number(progress[b.id].percent)||0))+'% · 继续阅读':'打开本机原著'} →</span></button>`).join('');stateCount()}
async function chooseBook(id,push=true){stopArticleReading();const book=BOOKS.find(b=>b.id===id);if(!book)return;ctx.book=book;speechParaCache.clear();speechAnchorCache.clear();ctx.work=memory.get(id)||null;const prog=getProgress()[id]||{};ctx.chapter=prog.chapter||0;ctx.page=prog.page||0;ctx.resumeOffset=Number.isFinite(prog.offset)?prog.offset:null;ctx.restoreAnchor=(Number.isInteger(prog.paragraph)&&Number.isInteger(prog.chapter))?{chapter:prog.chapter,paragraph:prog.paragraph,fraction:Number(prog.paragraphFraction)||0}:null;ctx.anchor=null;$('shelfView').hidden=true;$('bookView').hidden=false;$('bookLabel').textContent=book.zhTitle+' · '+book.year+' · 公版原著';$('bookTitle').textContent=book.enTitle;$('bookByline').textContent=book.author+' · '+book.expectedSections+(book.id==='sherlock'?' stories':' chapters/sections');history[push?'pushState':'replaceState']({book:id},'','?book='+encodeURIComponent(id));updateBreadcrumb();$('readingPane').hidden=true;$('loadPane').hidden=false;
 if(!ctx.work){try{const row=await store('get',id);if(ctx.book?.id!==id)return;if(row?.work?.paragraphSchema===window.PipiReaderParagraphs.CURRENT_SCHEMA && row.work.sections?.length>=book.expectedSections){ctx.work=row.work;memory.set(id,row.work);cachedIds.add(id);refreshShelfStats()}}catch(e){} }
 if(ctx.work)showReader();else{await downloadBook(book)}
 scrollTo({top:0,behavior:'instant'});
}
function showReader(){if(!ctx.work)return;document.body.classList.toggle('reading-focus',localStorage.getItem('sprint7_reader_focus')==='1');$('focusReading').setAttribute('aria-pressed',String(document.body.classList.contains('reading-focus')));if($('focusExit'))$('focusExit').hidden=!document.body.classList.contains('reading-focus');$('focusPlay').hidden=!document.body.classList.contains('reading-focus');setNativeImmersive(document.body.classList.contains('reading-focus'));$('loadPane').hidden=true;$('readingPane').hidden=false;document.body.classList.add('reading-active');ctx.chapter=Math.min(ctx.chapter,ctx.work.sections.length-1);renderChapter()}
function sentenceContext(p,word){const pieces=window.PipiReaderSentences?.splitSentences(p)||[{text:p}];const matching=pieces.find(x=>new RegExp('\\b'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(x.text));return (matching?.text||p).trim().slice(0,540)}
function markedSet(){const s=getMain(),out=new Set();for(const item of Object.values(s.mistakes||{}))if(item.kind==='readingword'&&item.status!=='mastered')out.add(item.unit);return out}
function richParagraph(p,flagged){return p.split(/([A-Za-z]+(?:[’'-][A-Za-z]+)*)/).map((t,i)=>{if(!i&&t==='')return '';return /^[A-Za-z]/.test(t)?`<button type="button" class="token ${flagged.has('lex:'+t.toLowerCase().replace(/’/g,"'"))?'flagged':''}" data-word="${esc(t)}" title="查询单词 ${esc(t)}">${esc(t)}</button>`:esc(t)}).join('')}
// Reflowable e-reader pages. Split only at word boundaries; no content is removed.
// The page size reflects current viewport dimensions and font size rather than 9 arbitrary paragraphs.
function pageCharacterBudget(){
 const width=Math.max(280,Math.min(document.documentElement.clientWidth||390,880))-72;
 const height=Math.max(340,(window.innerHeight||740)-260);
 const perLine=Math.max(15,width/(ctx.font*.57));
 const lines=Math.max(7,height/(ctx.font*1.9));
 return Math.round(Math.max(390,Math.min(2400,perLine*lines*.94)));
}
const pageCache=new Map();
function paginateChapter(section,chapterIndex=ctx.chapter){
 const cacheKey=[ctx.book?.id,chapterIndex,ctx.font,document.documentElement.clientWidth||390,window.innerHeight||740,section.wordCount||0].join(':');
 if(pageCache.has(cacheKey))return pageCache.get(cacheKey);
 const budget=pageCharacterBudget(),pages=[];
 let current={parts:[],start:0},used=0,offset=0;
 const finish=()=>{if(current.parts.length){pages.push(current);current={parts:[],start:offset};used=0}};
 // Page groups are ONLY virtualization units, not text units. Never split an
 // actual paragraph at the viewport boundary: doing so visually (and in TTS
 // anchors) recreates the original line-fragment bug.
 (section.paragraphs||[]).forEach((para,index)=>{
   if(used>0 && used+para.length>budget)finish();
   if(!current.parts.length)current.start=offset;
   current.parts.push({index,text:para,sourceStart:0});
   used+=para.length+2;offset+=para.length+2;
 });
 finish();
 const result=pages.length?pages:[{parts:[{index:0,text:'',sourceStart:0}],start:0}];
 pageCache.set(cacheKey,result);
 if(pageCache.size>10)pageCache.delete(pageCache.keys().next().value);
 return result;
}
function jumpToReadingTop(){
 const elem=$('readingPane');if(!elem)return;
 const top=Math.max(0,elem.getBoundingClientRect().top+window.scrollY-9);
 window.scrollTo({top,behavior:'instant'});
}
// Stream just a small window of pages. Scrolling down or up loads neighboring
// chunks (including across chapter boundaries), without ever putting a whole novel in the DOM.
const STREAM_MAX=14, STREAM_STEP=4;
let stream=null,streamRAF=0;
const refKey=r=>r.chapter+':'+r.page;
function chapterPages(chapter){return paginateChapter(ctx.work.sections[chapter],chapter)}
function nextRef(r){const pages=chapterPages(r.chapter);return r.page+1<pages.length?{chapter:r.chapter,page:r.page+1}:r.chapter+1<ctx.work.sections.length?{chapter:r.chapter+1,page:0}:null}
function prevRef(r){return r.page>0?{chapter:r.chapter,page:r.page-1}:r.chapter>0?{chapter:r.chapter-1,page:chapterPages(r.chapter-1).length-1}:null}
function renderSpokenParagraph(para,flagged){
 const sentences=window.PipiReaderSentences.splitSentences(para);let offset=0;
 const pieces=[];
 sentences.forEach((s,index)=>{
   if(s.start>offset)pieces.push(richParagraph(para.slice(offset,s.start),flagged));
   pieces.push(`<span class="reader-sentence" data-sentence="${index}">${richParagraph(para.slice(s.start,s.end),flagged)}</span>`);
   offset=s.end;
 });
 if(offset<para.length)pieces.push(richParagraph(para.slice(offset),flagged));
 return pieces.join('');
}
function streamChunk(ref,flagged){const p=chapterPages(ref.chapter)[ref.page],section=ctx.work.sections[ref.chapter];const title=ref.page===0?`<h2 class="stream-chapter-heading">${esc(section.title)}</h2>`:'';return `<section class="reader-stream-chunk" data-chapter="${ref.chapter}" data-page="${ref.page}">${title}${p.parts.map((x,i)=>`<p class="text-paragraph" data-part="${i}" data-paragraph="${x.index}">${renderSpokenParagraph(x.text,flagged)}</p>`).join('')}</section>`}
function renderStreamRows(){const el=$('readingText');if(!stream||!ctx.work)return;const flagged=markedSet();el.innerHTML=stream.refs.map(r=>streamChunk(r,flagged)).join('');el.style.setProperty('--font',ctx.font+'px');}
function renderChapter(){
 const w=ctx.work,section=w?.sections[ctx.chapter];if(!section)return;
 if(ctx.restoreAnchor?.chapter===ctx.chapter){const targetParagraph=ctx.restoreAnchor.paragraph;const pos=chapterPages(ctx.chapter).findIndex(page=>page.parts.some(part=>part.index===targetParagraph));if(pos>=0){ctx.page=pos;ctx.resumeOffset=null}}
 ctx.pages=chapterPages(ctx.chapter);
 if(ctx.resumeOffset!==null){let found=0;for(let i=0;i<ctx.pages.length;i++)if(ctx.pages[i].start<=ctx.resumeOffset)found=i;else break;ctx.page=found;ctx.resumeOffset=null}
 ctx.page=Math.max(0,Math.min(ctx.page,ctx.pages.length-1));
 stream={refs:[{chapter:ctx.chapter,page:ctx.page}],busy:false};
 for(let n=0;n<2;n++){const previous=prevRef(stream.refs[0]);if(previous)stream.refs.unshift(previous)}
 for(let n=0;n<5;n++){const next=nextRef(stream.refs[stream.refs.length-1]);if(next)stream.refs.push(next)}
 renderStreamRows();const paper=$('readingText');
 const target=paper.querySelector(`[data-chapter="${ctx.chapter}"][data-page="${ctx.page}"]`);
 paper.scrollTop=target?target.getBoundingClientRect().top-paper.getBoundingClientRect().top+paper.scrollTop:0;
 if(ctx.restoreAnchor?.chapter===ctx.chapter){
   const item=paper.querySelector(`[data-chapter="${ctx.chapter}"] [data-paragraph="${ctx.restoreAnchor.paragraph}"]`);
   if(item){const frac=Math.max(0,Math.min(1,ctx.restoreAnchor.fraction||0));paper.scrollTop=Math.max(0,item.getBoundingClientRect().top-paper.getBoundingClientRect().top+paper.scrollTop+frac*Math.max(0,item.offsetHeight-1))}
 }
 ctx.restoreAnchor=null;
 updateStreamMetrics();
 // A full table of contents is much smaller than the text and can be safely updated.
 $('chapterList').innerHTML=w.sections.map((sec,i)=>`<button class="chapter-item" data-chapter="${i}">${String(i+1).padStart(2,'0')} · ${esc(sec.title)} <span style="float:right;color:#bab8c7">${sec.wordCount.toLocaleString()}词</span></button>`).join('');
 // Recreated TOC must reflect the active narration chapter (which can differ
 // from the chapter under the learner's manually scrolled viewport).
 tocRenderedChapter=-1;
 syncChapterToc();
}
// The reading scroll anchor and the playing chapter are intentionally separate:
// following narrated chapters must not overwrite the learner's reading bookmark.
let tocRenderedChapter=-1;
function chapterShownInToc(){
 const playing=typeof narrator!=='undefined' && narrator.active && Number.isInteger(narrator.playingChapter)
   ? narrator.playingChapter : null;
 return playing!==null&&playing>=0&&playing<ctx.work.sections.length?playing:ctx.chapter;
}
function syncChapterToc(reveal=false){
 if(!ctx.work)return;
 const chapter=chapterShownInToc();
 const short=$('chapterShort');
 if(short)short.textContent=ctx.work.sections[chapter].title;
 const list=$('chapterList');
 if(!list)return;
 if(tocRenderedChapter!==chapter){
   list.querySelectorAll('.chapter-item').forEach(button=>{
     const active=Number(button.dataset.chapter)===chapter;
     button.classList.toggle('active',active);
     if(active)button.setAttribute('aria-current','true');
     else button.removeAttribute('aria-current');
   });
   tocRenderedChapter=chapter;
 }
 if(reveal){
   const active=list.querySelector('.chapter-item.active');
   if(active){
     const r=active.getBoundingClientRect(),p=list.getBoundingClientRect();
     list.scrollTop+=r.top-p.top-list.clientHeight/2+r.height/2;
   }
 }
}
function updateStreamMetrics(){if(!ctx.work)return;ctx.pages=chapterPages(ctx.chapter);$('chapterMetric').textContent=`${ctx.chapter+1} / ${ctx.work.sections.length} ${ctx.book.id==='sherlock'?'篇':'章'}`;$('wordMetric').textContent=`整书 ${ctx.work.wordCount.toLocaleString()} 词`;syncChapterToc();$('sectionTitle').textContent='向下滑动连续阅读 · 点词查义';setProgress()}
let anchorSaveTimer=null;
function visibleReadingAnchor(){
 const paper=$('readingText');if(!paper||!ctx.work||!stream)return null;
 const bounds=paper.getBoundingClientRect(),line=bounds.top+Math.min(110,paper.clientHeight*.22);
 let chosen=null;for(const el of paper.querySelectorAll('.reader-stream-chunk')){
   const box=el.getBoundingClientRect();if(box.bottom>line){chosen=el;break}
 }if(!chosen)return null;
 const chapter=Number(chosen.dataset.chapter),page=Number(chosen.dataset.page);
 let para=null;for(const el of chosen.querySelectorAll('[data-paragraph]')){if(el.getBoundingClientRect().bottom>line){para=el;break}}
 if(!para)para=chosen.querySelector('[data-paragraph]');
 const fraction=para?Math.max(0,Math.min(.999,(line-para.getBoundingClientRect().top)/Math.max(1,para.offsetHeight))):0;
 return {chapter,page,paragraph:para?Number(para.dataset.paragraph):0,fraction};
}
function saveVisibleAnchor(immediate=false){
 const anchor=visibleReadingAnchor();if(!anchor)return;
 ctx.anchor=anchor;ctx.chapter=anchor.chapter;ctx.page=anchor.page;
 if(anchorSaveTimer)clearTimeout(anchorSaveTimer);
 if(immediate){setProgress();return}
 anchorSaveTimer=setTimeout(()=>{anchorSaveTimer=null;if(ctx.book&&ctx.work)setProgress()},700);
}
function syncStreamPosition(){
 const anchor=visibleReadingAnchor();if(!anchor)return;
 const changed=ctx.chapter!==anchor.chapter||ctx.page!==anchor.page;
 ctx.anchor=anchor;ctx.chapter=anchor.chapter;ctx.page=anchor.page;
 if(changed)updateStreamMetrics();else saveVisibleAnchor();
}
function extendStream(direction){const paper=$('readingText');if(!stream||stream.busy)return;stream.busy=true;const atEnd=direction==='next',edge=stream.refs[atEnd?stream.refs.length-1:0];let ref=edge,added=[];for(let i=0;i<STREAM_STEP;i++){ref=atEnd?nextRef(ref):prevRef(ref);if(!ref)break;if(atEnd)added.push(ref);else added.unshift(ref)}if(!added.length){stream.busy=false;return}
 const before=paper.scrollTop,flagged=markedSet();
 if(atEnd){paper.insertAdjacentHTML('beforeend',added.map(x=>streamChunk(x,flagged)).join(''));stream.refs.push(...added)}else{
   const oldHeight=paper.scrollHeight;paper.insertAdjacentHTML('afterbegin',added.map(x=>streamChunk(x,flagged)).join(''));stream.refs.unshift(...added);paper.scrollTop=before+(paper.scrollHeight-oldHeight)
 }
 while(stream.refs.length>STREAM_MAX){if(atEnd){const children=paper.querySelectorAll('.reader-stream-chunk');const first=children[0];const height=first.getBoundingClientRect().height;first.remove();stream.refs.shift();paper.scrollTop=Math.max(0,paper.scrollTop-height)}else{paper.lastElementChild?.remove();stream.refs.pop()}}
 stream.busy=false;
}
function streamScroll(){if(streamRAF)return;streamRAF=requestAnimationFrame(()=>{streamRAF=0;const paper=$('readingText');if(!stream||!ctx.work)return;const rem=paper.scrollHeight-paper.clientHeight-paper.scrollTop;if(rem<paper.clientHeight*.7&&nextRef(stream.refs[stream.refs.length-1]))extendStream('next');else if(paper.scrollTop<paper.clientHeight*.5&&prevRef(stream.refs[0]))extendStream('prev');syncStreamPosition()})}
$('readingText').addEventListener('scroll',streamScroll,{passive:true});
function speak(text){if(window.PipiVoice){window.PipiVoice.speak(text);return}if(window.SprintAndroid&&window.SprintAndroid.speak){window.SprintAndroid.speak(String(text||""));return;}if(!('speechSynthesis' in window)){toast('当前浏览器不支持英文朗读');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).slice(0,4000));u.lang='en-GB';u.rate=.9;speechSynthesis.speak(u)}
const cachedBookMaps=new Map();
function knownInBooks(term){if(!window.SprintBooks?.get)return '';for(const k of Object.keys(SprintBooks.BOOKS||{})){const words=SprintBooks.get(k)||[];let map=cachedBookMaps.get(k);if(!map||map._length!==words.length){map=new Map(words.map(o=>[String(o.word||'').toLowerCase(),o.zh]));map._length=words.length;cachedBookMaps.set(k,map)}if(map.has(term))return map.get(term)}return ''}
function lookupLocal(word){const w=word.toLowerCase().replace(/’/g,"'");const base=[w];if(w.endsWith('ies'))base.push(w.slice(0,-3)+'y');if(w.endsWith('ing'))base.push(w.slice(0,-3),w.slice(0,-3)+'e');if(w.endsWith('ed'))base.push(w.slice(0,-2),w.slice(0,-1));if(w.endsWith('s'))base.push(w.slice(0,-1));const custom=getMain().readerWords||{};const cache=window.SprintLookupCache||{};
 for(const t of [...new Set(base)]){const zh=offlineLexicon[t]||cache[t]||custom['lex:'+t]?.zh||knownInBooks(t)||miniWords[t]||M[t];if(zh)return zh}return ''}
let activeLookup=0;
function validMeaning(text){const t=String(text||'');return /[\u3400-\u9fff]/.test(t)&&!/(?:联网查询失败|暂无可靠中文释义|正在查词|待查释义|未安装|未收录)/.test(t)}
async function openWord(word,paragraph){
 const w=word.toLowerCase().replace(/’/g,"'");ctx.word=w;ctx.lookupTranslation='';ctx.sentence=sentenceContext(paragraph,w);
 $('wordTitle').textContent=w;$('wordExample').textContent=ctx.sentence;$('wordChinese').textContent='正在查询本地 ECDICT…';$('wordPhonetic').textContent='点击播放标准英文读音';$('wordEnglish').textContent='';$('wordEnglish').hidden=true;
 $('dictionaryStatus').textContent='优先查询完整离线英汉词典，无需联网';$('wordOverlay').hidden=false;
 const serial=++activeLookup;
 let row=null;
 try {if(window.SprintECDICT?.lookup) row=await window.SprintECDICT.lookup(w)}
 catch(e) {console.warn('ECDICT dictionary unavailable:',e)}
 if(serial!==activeLookup)return;
 if(row){
   ctx.lookupTranslation=row.translation||'';
   const old=lookupLocal(w);
   const displayed=row.translation||old||row.definition||'此词条没有中英文释义。';
   $('wordChinese').textContent=displayed;$('wordPhonetic').textContent=row.phonetic?('/'+row.phonetic+'/'):'英文发音 · 点按右侧按钮';if(row.definition){$('wordEnglish').textContent=row.definition;$('wordEnglish').hidden=false;}
   $('dictionaryStatus').textContent=(row.inflected?'原形 '+row.original+' · ':'')+(row.phonetic?('/'+row.phonetic+'/ · '):'')+(row.translation?'ECDICT 完整离线词典':'ECDICT 暂无中文释义，已提供英文解释');
   return;
 }
 const backup=lookupLocal(w);
 if(validMeaning(backup)){$('wordChinese').textContent=backup;ctx.lookupTranslation=backup;$('wordPhonetic').textContent='英文发音 · 点按右侧按钮';$('dictionaryStatus').textContent='来自原有小说小词典';}
 else {$('wordPhonetic').textContent='未找到音标';$('wordChinese').textContent='未找到词条（可检查拼写或加入生词本）';$('dictionaryStatus').textContent='ECDICT 和现有小词典均未查到，不会发起联网翻译。'}
}

function addUnknown(){if(!ctx.word)return;const word=ctx.word,unit='lex:'+word,ss=getMain(),entry=ss.mistakes?.['word:'+unit+':0']||{},old=ss.vocab?.[unit]||{},zh=ctx.lookupTranslation||lookupLocal(word)||$('wordChinese').textContent;ss.settingsVersion=1;ss.vocab=ss.vocab||{};ss.mistakes=ss.mistakes||{};ss.mistakeEvents=ss.mistakeEvents||[];ss.readerWords=ss.readerWords||{};
 const info=(ss.readerWords[unit]||{});ss.readerWords[unit]={...info,id:unit,word,zh:validMeaning(zh)?zh:'待查释义',level:'名著',topic:'英文原著',example:ctx.sentence,book:'reader'};
 const repeated=entry.status==='mastered';if(repeated)old.knownCount=0;
 const next=window.SprintFSRS?.schedule?.(old,false)||{dueAt:new Date(Date.now()+10*60000).toISOString(),lastReviewed:now()};ss.vocab[unit]={...old,...next,knownCount:old.knownCount||0,knownTotal:old.knownTotal||0,lapses:(old.lapses||0)+1,last:new Date().toISOString().slice(0,10)};
 const id='word:'+unit+':0';ss.mistakes[id]={...entry,kind:'readingword',unit,q:0,detail:'阅读原著时标记不会',source:ctx.book.zhTitle+' 原著',bookId:ctx.book.id,sentence:ctx.sentence,sentenceZh:'',seen:(entry.seen||0)+1,success:ss.vocab[unit].knownCount,status:'pending',first:entry.first||now(),last:now(),dueAt:next.dueAt};ss.mistakeEvents.push({id,kind:'readingword',unit,at:now(),source:ctx.book.zhTitle+' 原著',bookId:ctx.book.id,detail:'主动标记不会'});
 if(ss.mistakeEvents.length>12000)ss.mistakeEvents=ss.mistakeEvents.slice(-12000);
 ss.v5||={schemaVersion:5,bookGoals:{},events:[],createdAt:now()};ss.v5.events||=[];
 if(!entry.first)ss.v5.events.push({id:'reader-'+ctx.book.id+'-'+unit+'-'+Date.now(),at:now(),type:'reader_save',wordId:unit,bookId:ctx.book.id,chapter:ctx.chapter,sourceSentence:ctx.sentence});
 if(ss.v5.events.length>18000)ss.v5.events=ss.v5.events.slice(-18000);
 if(putMain(ss)){toast(`「${word}」已加入 FSRS 生词本`);$('wordOverlay').hidden=true;document.querySelectorAll('#readingText [data-word]').forEach(el=>{if(el.dataset.word.toLowerCase()===word)el.classList.add('flagged')})}
}
function markKnown(){if(!ctx.word)return;const word=ctx.word,unit='lex:'+word,s=getMain();const m=s.mistakes?.['word:'+unit+':0'];if(!m){toast('已跳过；不认识时点「不会」收录');$('wordOverlay').hidden=true;return}const old=s.vocab?.[unit]||{},next=window.SprintFSRS?.schedule?.(old,true)||{dueAt:new Date(Date.now()+86400000).toISOString()};const n=(Number(old.knownCount)||0)+1;s.vocab[unit]={...old,...next,knownCount:n,knownTotal:(old.knownTotal||0)+1,reps:(old.reps||0)+1};m.success=n;m.status=n>=7?'mastered':'pending';m.dueAt=next.dueAt;m.last=now();if(n>=7)m.masteredAt=now();putMain(s);$('wordOverlay').hidden=true;toast(n>=7?'累计7次「会」，已移入已掌握':`已记住 ${n}/7 次 · FSRS 更新复习时间`);renderChapter()}
function toast(msg){const t=$('toast');t.hidden=false;t.textContent=msg;clearTimeout(ctx.toastTimer);ctx.toastTimer=setTimeout(()=>t.hidden=true,2900)}
$('bookGrid').addEventListener('click',e=>{const b=e.target.closest('[data-book]');if(b)chooseBook(b.dataset.book)});
$('readerTopBack').addEventListener('click',e=>{e.preventDefault();if(ctx.book)showShelf();else window.PipiWebNavigation?.back('index.html?nav=library')});$('homeShelf').addEventListener('click',()=>ctx.book?showShelf():window.PipiWebNavigation?.back('index.html?nav=library'));$('shelfCrumb').addEventListener('click',()=>{if(ctx.book)showShelf();else renderShelf()});$('selectBook').addEventListener('click',()=>showShelf());/* Bundled reader opens already-installed books automatically. */
$('chapterMenuButton').addEventListener('click',()=>{$('tocOverlay').hidden=false;syncChapterToc(true)});$('chapterList').addEventListener('click',e=>{const b=e.target.closest('[data-chapter]');if(!b)return;stopArticleReading();ctx.chapter=Number(b.dataset.chapter);ctx.page=0;ctx.resumeOffset=null;$('tocOverlay').hidden=true;renderChapter();window.scrollTo({top:0,behavior:'instant'})});

$('fontDown').addEventListener('click',()=>{ctx.restoreAnchor=visibleReadingAnchor();ctx.resumeOffset=ctx.pages[ctx.page]?.start||0;ctx.font=Math.max(15,ctx.font-1);localStorage.setItem('sprint7_originals_font',ctx.font);updateReaderSettings();renderChapter()});$('fontUp').addEventListener('click',()=>{ctx.restoreAnchor=visibleReadingAnchor();ctx.resumeOffset=ctx.pages[ctx.page]?.start||0;ctx.font=Math.min(28,ctx.font+1);localStorage.setItem('sprint7_originals_font',ctx.font);updateReaderSettings();renderChapter()});
// V5.9: one reading-settings sheet instead of multiple toolbar rows.
const READER_THEME_KEY='pipi_reader_theme_v59';
function readerTheme(){try{return localStorage.getItem(READER_THEME_KEY)||'light'}catch(_){return 'light'}}
function setReaderTheme(theme){
 if(!['light','sepia','dark'].includes(theme))theme='light';
 document.body.dataset.readerTheme=theme;
 try{localStorage.setItem(READER_THEME_KEY,theme)}catch(_){}
 document.querySelectorAll('[data-reader-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.readerTheme===theme)));
}
function updateReaderSettings(){
 $('readerFontValue').textContent=ctx.font+'px';
 const r=window.PipiVoice?.rate?.()||1;
 document.querySelectorAll('[data-reader-rate]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.readerRate)===r)));
 $('articleVoice').querySelector('strong').textContent=(window.PipiVoice?.article?.voiceName?.()||'Sarah').split(' · ')[0];
}
function openReaderSettings(){updateReaderSettings();$('readerSettingsOverlay').hidden=false;$('closeReaderSettings').focus()}
function closeReaderSettings(){ $('readerSettingsOverlay').hidden=true; }
function setNativeImmersive(on){try{window.SprintAndroid?.setImmersive?.(!!on)}catch(_){}}
function updateReadingFocus(){
 const active=document.body.classList.contains('reading-focus');
 $('focusReading').setAttribute('aria-pressed',String(active));
 $('focusExit').hidden=!active;
 $('focusPlay').hidden=!active;
 $('focusReading').setAttribute('aria-label',active?'退出全屏沉浸阅读':'进入全屏沉浸阅读');
}
setReaderTheme(readerTheme());
$('readerSettingsButton').addEventListener('click',openReaderSettings);
$('closeReaderSettings').addEventListener('click',closeReaderSettings);
$('readerSettingsDone').addEventListener('click',closeReaderSettings);
$('readerSettingsOverlay').addEventListener('click',e=>{if(e.target===$('readerSettingsOverlay'))closeReaderSettings()});
$('focusExit').addEventListener('click',()=>$('focusReading').click());
$('focusPlay').addEventListener('click',()=>$('playPart').click());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('readerSettingsOverlay').hidden){closeReaderSettings();$('readerSettingsButton').focus()}});
document.querySelectorAll('[data-reader-theme]').forEach(b=>b.addEventListener('click',()=>setReaderTheme(b.dataset.readerTheme)));
document.querySelectorAll('[data-reader-rate]').forEach(b=>b.addEventListener('click',()=>{if(window.PipiVoice){PipiVoice.setRate(Number(b.dataset.readerRate));updateReaderSettings();toast('朗读语速 '+b.dataset.readerRate+'× · 下一段生效')}else toast('语音设置暂不可用')}));
$('playPart').addEventListener('click',toggleArticleReading);
$('stopArticle').addEventListener('click',stopArticleReading);
$('articleVoice').addEventListener('click',()=>{if(!window.PipiVoice?.article)return;const v=PipiVoice.article.nextVoice();$('articleVoice').querySelector('strong').textContent=v.name.split(' · ')[0];toast('已切换 '+v.name+'，下一段生效');if(narrator.active)restartArticleReading()});
$('focusReading').addEventListener('click',()=>{ctx.restoreAnchor=visibleReadingAnchor();const on=document.body.classList.toggle('reading-focus');setNativeImmersive(on);localStorage.setItem('sprint7_reader_focus',on?'1':'0');updateReadingFocus();ctx.resumeOffset=ctx.pages[ctx.page]?.start||0;renderChapter()});
$('readingText').addEventListener('click',e=>{if(Date.now()<ctx.suppressTapUntil)return;const t=e.target.closest('[data-word]');if(t)openWord(t.dataset.word,t.closest('p')?.textContent||'')});
// Native vertical scrolling is the only gesture used for continuous reading.
let resizeDebounce;
window.addEventListener('pagehide',()=>saveVisibleAnchor(true));
window.addEventListener('resize',()=>{if(!ctx.book||!ctx.work||$('readingPane').hidden)return;clearTimeout(resizeDebounce);resizeDebounce=setTimeout(()=>{ctx.restoreAnchor=visibleReadingAnchor();ctx.resumeOffset=chapterPages(ctx.chapter)[ctx.page]?.start||0;renderChapter()},220)});
$('speakWord').addEventListener('click',()=>speak(ctx.word));$('markUnknown').addEventListener('click',addUnknown);$('markKnown').addEventListener('click',markKnown);
document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>$(x.dataset.close).hidden=true));
for(const el of ['tocOverlay','wordOverlay'])$(el).addEventListener('click',e=>{if(e.target.id===el)$(el).hidden=true});
/* No book export button in offline-only edition. */
/* Bundled originals are permanent APK assets, not deletable reading-cache data. */
// Recover the existing IELTS / CET dictionary from IndexedDB; if not cached it may load from the public source.
/* Wordbooks are loaded by the app as needed, never via the reader's startup. */
try{const c=JSON.parse(localStorage.getItem('sprint7_lookup_cache')||'{}');Object.assign(M,c);window.SprintLookupCache=c}catch{}
/* V5.6 Kokoro novel narrator. A short queue is handed to the Android
 * synthesis/playback pipeline; reader DOM stays bounded and vertical only. */
const AUDIO_BOOKMARK='pipi_article_position_v56';
const narrator={active:false,paused:false,token:'',serial:0,next:null,batch:[],last:null,playingChapter:null,submitted:0,finished:false,buffering:false};
function articleBookmark(){try{return JSON.parse(localStorage.getItem(AUDIO_BOOKMARK)||'null')}catch(_){return null}}
function storeArticleBookmark(where){if(!ctx.book||!where)return;try{localStorage.setItem(AUDIO_BOOKMARK,JSON.stringify({book:ctx.book.id,chapter:where.chapter,page:where.page,part:where.part||0,sub:where.sub||0,paragraph:where.paragraph,sentence:where.sentence,schema:window.PipiReaderParagraphs.CURRENT_SCHEMA}))}catch(_){}}
// Build speech from ORIGINAL paragraphs, not from screen-sized pages. A single English
// sentence may cross several screen pages and must NEVER be spoken as fragments.
const speechParaCache=new Map();
function narrationForParagraph(chapter, paragraph){
 const key=chapter+':'+paragraph;
 if(!speechParaCache.has(key)){
   const text=ctx.work.sections[chapter].paragraphs[paragraph]||'';
   speechParaCache.set(key,window.PipiReaderSentences.forNarration(text,1400));
   if(speechParaCache.size>280)speechParaCache.delete(speechParaCache.keys().next().value);
 }
 return speechParaCache.get(key);
}
const speechAnchorCache=new Map();
function speechAnchor(chapter,paragraph,offset){
 const key=[ctx.book?.id,chapter,ctx.font,document.documentElement.clientWidth||390,window.innerHeight||740].join(':');
 let index=speechAnchorCache.get(key);
 if(!index){
   index=new Map();
   chapterPages(chapter).forEach((pg,page)=>pg.parts.forEach((pt,part)=>{
     if(!index.has(pt.index))index.set(pt.index,[]);
     index.get(pt.index).push({page,part,offset:pt.sourceStart||0,end:(pt.sourceStart||0)+pt.text.length});
   }));
   speechAnchorCache.set(key,index);
   if(speechAnchorCache.size>12)speechAnchorCache.delete(speechAnchorCache.keys().next().value);
 }
 const list=index.get(paragraph)||[];
 return list.find(x=>x.offset<=offset&&x.end>offset)||list.find(x=>x.offset>offset)||list[list.length-1]||{page:0,part:0};
}
function narrationStartFromPage(){
 const pg=chapterPages(ctx.chapter)[ctx.page],first=pg?.parts[0];
 if(!first)return {chapter:ctx.chapter,paragraph:0,sentence:0};
 const segments=narrationForParagraph(ctx.chapter,first.index);
 const sourceStart=first.sourceStart||0;
 const idx=segments.findIndex(x=>x.end>sourceStart);
 return {chapter:ctx.chapter,paragraph:first.index,sentence:Math.max(0,idx)};
}
function narrateSegments(start){
 if(!ctx.work)return {batch:[],next:null};
 const batch=[];
 for(let chapter=start.chapter;chapter<ctx.work.sections.length;chapter++){
   const paras=ctx.work.sections[chapter].paragraphs||[];
   for(let paragraph=chapter===start.chapter?start.paragraph:0;paragraph<paras.length;paragraph++){
     const lines=narrationForParagraph(chapter,paragraph);
     for(let sentence=(chapter===start.chapter&&paragraph===start.paragraph?start.sentence:0);sentence<lines.length;sentence++){
       const item=lines[sentence],anchor=speechAnchor(chapter,paragraph,item.start);
       batch.push({chapter,page:anchor.page,part:anchor.part,sub:sentence,paragraph,sentence,text:item.text});
       if(batch.length>=36){
         const next=sentence+1<lines.length?{chapter,paragraph,sentence:sentence+1}:
           paragraph+1<paras.length?{chapter,paragraph:paragraph+1,sentence:0}:
           chapter+1<ctx.work.sections.length?{chapter:chapter+1,paragraph:0,sentence:0}:null;
         return {batch,next};
       }
     }
   }
 }
 return {batch,next:null};
}
function updateNarratorUI(message){
 const btn=$('playPart'),end=$('stopArticle'),voice=$('articleVoice');
 btn.textContent=narrator.active?(narrator.paused?'▶ 继续':narrator.buffering?'⏳ 准备':'⏸ 暂停'):'▶ 朗读';
 btn.title=narrator.buffering&&!narrator.paused?(message||'正在预缓冲语音，稍后开始朗读'):'朗读文章';
 btn.setAttribute('aria-pressed',String(narrator.active&&!narrator.paused));
 btn.setAttribute('aria-label',narrator.active?(narrator.paused?'继续文章朗读':'暂停文章朗读'):'开始文章朗读');
 end.hidden=!narrator.active;
 const focusBtn=$('focusPlay');
 if(focusBtn){focusBtn.textContent=narrator.active?(narrator.paused?'▶':narrator.buffering?'…':'⏸'):'▶';focusBtn.setAttribute('aria-label',narrator.active?(narrator.paused?'继续文章朗读':'暂停文章朗读'):'开始文章朗读');focusBtn.setAttribute('aria-pressed',String(narrator.active&&!narrator.paused));}
 const voiceLabel=voice.querySelector('strong');if(voiceLabel)voiceLabel.textContent=window.PipiVoice?.article?.voiceName().split(' · ')[0]||'Sarah';
 $('articleVoiceStatus').textContent=message||(!narrator.active?'离线女声':narrator.paused?'已暂停':'正在朗读…');
}
function fillNarratorQueue(playedIndex=0){
 // Keep roughly 2-3 batches submitted; the native PCM queue itself remains bounded.
 // Batches are appended into the SAME native session and audio track.
 while(narrator.active&&!narrator.finished&&narrator.next&&narrator.submitted-playedIndex<=72){
   const part=narrateSegments(narrator.next);
   if(!part.batch.length){narrator.next=null;break}
   if(!window.PipiVoice?.article?.append?.(part.batch,narrator.token)){
     toast('连续朗读接口不可用，请重新安装新版 APK');stopArticleReading();return;
   }
   narrator.submitted+=part.batch.length;narrator.next=part.next;
 }
 if(narrator.active&&!narrator.finished&&!narrator.next){
   narrator.finished=true;window.PipiVoice?.article?.finish?.(narrator.token);
 }
}
function sendNarratorBatch(){
 if(!narrator.active||!narrator.next||!ctx.work)return;
 const part=narrateSegments(narrator.next);
 if(!part.batch.length){stopArticleReading(false);toast('本书朗读已完成');return}
 narrator.next=part.next;narrator.batch=part.batch;narrator.submitted=part.batch.length;narrator.finished=false;
 narrator.buffering=true;
 narrator.token='pipi-read-'+(++narrator.serial)+'-'+Date.now();
 if(!window.PipiVoice?.article?.play(part.batch,narrator.token)){stopArticleReading(false);return}
 fillNarratorQueue(0);
 updateNarratorUI('正在准备第一段语音，稍后开始播放…');
}
function startArticleReading(){
 if(!ctx.book||!ctx.work)return;
 // A speech bookmark is independent from viewport width and font size.
 const bookmark=articleBookmark();
 const useSaved=bookmark&&bookmark.schema===window.PipiReaderParagraphs.CURRENT_SCHEMA&&bookmark.book===ctx.book.id&&bookmark.chapter===ctx.chapter&&Math.abs((bookmark.page||0)-ctx.page)<=1;
 const at=useSaved&&Number.isInteger(bookmark.paragraph)&&Number.isInteger(bookmark.sentence)
   ?{chapter:bookmark.chapter,paragraph:bookmark.paragraph,sentence:bookmark.sentence}
   :narrationStartFromPage();
 narrator.active=true;narrator.paused=false;narrator.playingChapter=null;narrator.last=at;narrator.next=at;narrator.submitted=0;narrator.finished=false;
 sendNarratorBatch();
}
function stopArticleReading(clearButton=true){
 if(narrator.active)window.PipiVoice?.article?.stop();
 narrator.active=false;narrator.paused=false;narrator.buffering=false;narrator.playingChapter=null;syncChapterToc();narrator.token='';narrator.next=null;narrator.batch=[];narrator.submitted=0;narrator.finished=false;
 if(clearButton&&document.getElementById('playPart'))updateNarratorUI();
}
function toggleArticleReading(){
 if(!narrator.active){startArticleReading();return}
 if(narrator.paused){narrator.paused=false;window.PipiVoice?.article?.resume();/* session remains alive while paused */}
 else{narrator.paused=true;window.PipiVoice?.article?.pause()}
 updateNarratorUI();
}
function restartArticleReading(){
 const at=narrator.last;
 stopArticleReading();if(!at)return;
 narrator.active=true;narrator.paused=false;narrator.playingChapter=null;narrator.buffering=true;narrator.next=at;narrator.submitted=0;narrator.finished=false;sendNarratorBatch();
}
function highlightSpokenSegment(where){
 if(!ctx.work||!ctx.book)return;
 document.querySelectorAll('#readingText .article-speech-current').forEach(el=>el.classList.remove('article-speech-current'));
 // A long exceptional sentence can be synthesized as several TTS clauses;
 // each belongs to ONE source sentence, not multiple visual lines/pages.
 const utterance=narrationForParagraph(where.chapter,where.paragraph)[where.sentence];
 const sourceSentence=utterance?.sentenceIndex??where.sentence;
 const root=$('readingText');
 const page=root.querySelector(`[data-chapter="${where.chapter}"][data-page="${where.page}"]`);
 const paragraph=page?.querySelector(`[data-paragraph="${where.paragraph}"]`);
 const el=paragraph?.querySelector(`[data-sentence="${sourceSentence}"]`);
 if(el){el.classList.add('article-speech-current');
   const a=el.getBoundingClientRect(),b=root.getBoundingClientRect();
   // Never steal scroll position if the learner has manually moved away.
   if(a.bottom>b.bottom+40||a.top<b.top-40)root.scrollTo({top:root.scrollTop+a.top-b.top-root.clientHeight*.23,behavior:'smooth'});
 }
}
window.addEventListener('pipi-article-tts',ev=>{
 const d=ev.detail||{};
 if(!narrator.active||d.token!==narrator.token)return;
 if(d.code==='article-loading'){narrator.buffering=true;updateNarratorUI('正在加载 Kokoro，首次可能较慢…');return}
 if(d.code==='article-buffering'||d.code==='article-waiting'){narrator.buffering=true;updateNarratorUI(d.message||'正在缓冲语音…');return}
 if(d.code==='article-audio-start'){narrator.buffering=false;updateNarratorUI('正在朗读…');return}
 if(d.code==='article-paused'){narrator.paused=true;updateNarratorUI();return}
 if(d.code==='article-playing'){narrator.paused=false;updateNarratorUI();return}
 if(d.code==='article-stopped'){stopArticleReading();return}
 if(d.code==='article-error'){toast(d.message||'离线朗读失败');stopArticleReading();return}
 if(d.code==='article-segment'){
   narrator.buffering=false;
   const loc={chapter:Number(d.chapter),page:Number(d.page),part:Number(d.part),sub:Number(d.sub||0),paragraph:Number(d.paragraph),sentence:Number(d.sentence)};
   narrator.last=loc;narrator.playingChapter=loc.chapter;syncChapterToc();storeArticleBookmark(loc);highlightSpokenSegment(loc);
   fillNarratorQueue(Math.max(0,Number(d.index)||0));
   updateNarratorUI(`${ctx.work.sections[loc.chapter]?.title||'英文原著'} · 朗读中`);
 }
 if(d.code==='article-batch-done'){
   narrator.batch=[];stopArticleReading();toast('英文原著已朗读完成');
 }
});
window.addEventListener('beforeunload',()=>stopArticleReading(false));
updateNarratorUI();

stateCount();const selected=new URLSearchParams(location.search).get('book');if(BOOKS.some(b=>b.id===selected))chooseBook(selected,false);else{renderShelf();updateBreadcrumb()};window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('book');if(BOOKS.some(b=>b.id===id))chooseBook(id,false);else showShelf(false)})
window.PipiNavigateBack=()=>{
 if(!$('readerSettingsOverlay').hidden){closeReaderSettings();return true}
 if(!$('wordOverlay').hidden){$('wordOverlay').hidden=true;activeLookup++;return true}
 if(!$('tocOverlay').hidden){$('tocOverlay').hidden=true;return true}
 if(document.body.classList.contains('reading-focus')){$('focusReading').click();return true}
 if(ctx.book){showShelf();return true}
 window.PipiWebNavigation?.back('index.html?nav=library');return true;
};
window.SprintOriginals={parseOriginal,removePGHeader,headingFor,books:BOOKS,lookupLocal};
})();



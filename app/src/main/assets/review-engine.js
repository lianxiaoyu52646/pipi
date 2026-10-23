/* Pipi V5.12.11 review membership, sources, sorting. Keep historical unknowns without silently deleting them. */
(function(host,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(host)host.PipiReviewLogic=api;})(typeof window==='object'?window:null,function(){
'use strict';
const WORD_KINDS=new Set(['vocab','sound','readingword','dictationword']);
const isWord=m=>!!m&&WORD_KINDS.has(m.kind);
const oldManual=m=>!!m&&(m.kind==='readingword'||(/(?:主动标记不会|列表浏览：标记不会|列表速背|单词复习：不会|复习：未记住|再次回忆失败|词卡复习|错词自测)/.test(String(m.detail||'')+' '+String(m.source||''))));
const enrolled=m=>isWord(m)&&m.enrollment==='manual'&&m.status!=='removed';
function enrollment(m){if(!isWord(m))return 'other';if(m.status==='removed')return 'removed';if(m.enrollment==='manual'||m.enrollment==='legacy')return m.enrollment;return oldManual(m)?'manual':'legacy'}
function normalize(s){let changes=0;for(const m of Object.values(s.mistakes||{})){if(!isWord(m))continue;const next=enrollment(m);if(m.enrollment!==next){m.enrollment=next;changes++}if(m.status==='mastered'&&m.enrollment==='manual'){m.status='pending';delete m.masteredAt;changes++}}
 for(const [id,m] of Object.entries(s.vocab||{})){if(!m)continue;const mistake=s.mistakes?.['word:'+id+':0'];if((!mistake||!enrolled(mistake))&&m.reviewPaused!==true){m.reviewPaused=true;m._pipiLegacyPaused=true;changes++}else if(enrolled(mistake)&&m._pipiLegacyPaused){m.reviewPaused=false;delete m._pipiLegacyPaused;changes++}}
 return changes;
}
function dueIds(s,now=Date.now()){return Object.entries(s.mistakes||{}).filter(([,m])=>enrolled(m)).map(([,m])=>m.unit).filter((id,i,a)=>a.indexOf(id)===i&&s.vocab?.[id]&&s.vocab[id].reviewPaused!==true&&dueTime(s.vocab[id])<=now)}
function dueTime(m){const raw=m?.dueAt||m?.due;if(!raw)return 0;const time=/^\d{4}-\d\d-\d\d$/.test(raw)?new Date(raw+'T00:00:00').getTime():Date.parse(raw);return Number.isFinite(time)?time:0}
function list(s,kind='due',query=''){
 const m=new Map();for(const item of Object.values(s.mistakes||{}))if(isWord(item)&&item.unit){const previous=m.get(item.unit);if(!previous||String(item.last||'')>String(previous.last||''))m.set(item.unit,item)}
 let rows=[...m.entries()].map(([id,item])=>({id,item}));
 if(kind==='due'){const due=new Set(dueIds(s));rows=rows.filter(x=>due.has(x.id));rows.sort((a,b)=>dueTime(s.vocab[a.id])-dueTime(s.vocab[b.id])||a.id.localeCompare(b.id));}
 else if(kind==='unknown'){rows=rows.filter(x=>enrolled(x.item));rows.sort((a,b)=>String(b.item.first||b.item.last||'').localeCompare(String(a.item.first||a.item.last||''))||a.id.localeCompare(b.id));}
 else {rows.sort((a,b)=>a.id.replace(/^lex:/,'').localeCompare(b.id.replace(/^lex:/,'')));}
 return rows;
}
function appendOrigin(entry,source){const old=Array.isArray(entry.origins)?entry.origins:[];const all=[...old];if(!old.length&&(entry.bookId||entry.sentence))all.push({bookId:entry.bookId||'',title:entry.source||'',sentence:entry.sentence||'',sentenceZh:entry.sentenceZh||''});const next={bookId:String(source.bookId||''),title:String(source.title||source.source||''),sentence:String(source.sentence||'').slice(0,900),sentenceZh:String(source.sentenceZh||'').slice(0,900),chapter:source.chapter};const key=x=>x.bookId+'|'+x.sentence;if((next.bookId||next.sentence)&&!all.some(x=>key(x)===key(next)))all.push(next);return all.slice(-40)}
return {enrolled,enrollment,normalize,dueIds,dueTime,list,appendOrigin,oldManual};
});

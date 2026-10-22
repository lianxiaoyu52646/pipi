/* Sprint7 v2 · durable ordered study path per wordbook, mode and topic.
   Distinct from FSRS: finishing a volume does not delete or reschedule review history. */
(function(global){
'use strict';
const isoDay=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const pathKey=(book,order,topic)=>JSON.stringify([book,order,topic]);
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function ordered(rows,order,book,round){const list=[...rows];if(order==='alpha')return list.sort((a,b)=>a.word.toLowerCase()<b.word.toLowerCase()?-1:a.word.toLowerCase()>b.word.toLowerCase()?1:a.id.localeCompare(b.id));return list.sort((a,b)=>(hash(`${book}-${round}:${a.id}`)-hash(`${book}-${round}:${b.id}`))||a.id.localeCompare(b.id))}
function ensure(state,book,order,topic,rows){
 state.bookPaths ||= {}; state.bookPathDaily ||= {};
 const key=pathKey(book,order,topic);let path=state.bookPaths[key];
 if(!path || !Number.isInteger(path.position) || path.position<0 || !Number.isInteger(path.round) || path.round<1){
  let initial=0; // Start each book at its own first word; FSRS history is independent and may be shared across books.
  path={position:initial>=rows.length?0:initial,round:initial>=rows.length&&rows.length?2:1,completedRounds:initial>=rows.length&&rows.length?1:0};
  state.bookPaths[key]=path;
 }
 if(rows.length===0){path.position=0;return {key,path,rows:[]}}
 if(path.position>=rows.length){path.position=0;path.round++;path.completedRounds=(path.completedRounds||0)+1}
 return {key,path,rows:ordered(rows,order,book,path.round)};
}
function dailyCount(state,key,day=isoDay()){return Number(state.bookPathDaily?.[day]?.[key]||0)}
function candidates(state,ctx,limit,day=isoDay()){
 if(!ctx.rows.length)return [];
 const remaining=Math.max(0,Math.floor(Number(limit)||0)-dailyCount(state,ctx.key,day));
 return ctx.rows.slice(ctx.path.position,ctx.path.position+remaining)
}
function advance(state,ctx,id,day=isoDay()){
 if(!ctx||!ctx.rows.length||ctx.rows[ctx.path.position]?.id!==id)return false;
 const path=state.bookPaths[ctx.key];if(!path || path.round!==ctx.path.round || path.position!==ctx.path.position)return false;
 path.position++;state.bookPathDaily ||= {};state.bookPathDaily[day] ||= {};state.bookPathDaily[day][ctx.key]=dailyCount(state,ctx.key,day)+1;
 path.updated=day;
 if(path.position>=ctx.rows.length){path.position=0;path.round++;path.completedRounds=(path.completedRounds||0)+1;path.lastFinished=day}
 // Retain only recent per-day counters without discarding the actual position.
 const days=Object.keys(state.bookPathDaily).sort();for(const k of days.slice(0,-45))delete state.bookPathDaily[k];
 return true;
}
global.SprintBookPath={pathKey,ordered,ensure,dailyCount,candidates,advance};
})(typeof window!=='undefined'?window:globalThis);

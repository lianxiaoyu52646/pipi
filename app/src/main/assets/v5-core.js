/* 皮皮 V5：非破坏式学习数据扩展。保留 sprint7_complete_v1 原有字段。 */
(function (host,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;if(host)host.PipiV5=m;})(typeof window==='object'?window:null,function(){
'use strict';
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const day=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function ensure(s){if(!s.v5||typeof s.v5!=='object'){const goals={};if([10,20,30,50,100].includes(+s.wordGoal))goals[s.wordBook||'ielts']=+s.wordGoal;s.v5={schemaVersion:5,bookGoals:goals,events:[],createdAt:new Date().toISOString()}};s.v5.schemaVersion=5;s.v5.bookGoals||={};s.v5.events||=[];return s.v5}
function bookGoal(s,k){ensure(s);return [10,20,30,50,100].includes(+s.v5.bookGoals[k])?+s.v5.bookGoals[k]:50}
function setBookGoal(s,k,value){const n=+value;if(![10,20,30,50,100].includes(n))return false;ensure(s).bookGoals[k]=n;s.wordGoal=n;return true}
function lastReader(prog,books){const entries=Object.entries(prog||{}).map(([id,p])=>({book:(books||[]).find(b=>b.id===id),id,chapter:Math.max(0,+p.chapter||0),last:p.last||'',offset:+p.offset||0})).filter(x=>x.book);entries.sort((a,b)=>b.last.localeCompare(a.last));return entries[0]||null}
function beforeGrade(s,id,ctx){ensure(s);const k='word:'+id+':0',d=day();return {id,k,day:d,at:Date.now(),vocab:clone(s.vocab?.[id]),mistake:clone(s.mistakes?.[k]),mistakeEvents:(s.mistakeEvents||[]).length,dayReviews:clone(s.dayReviews?.[d]),activity:clone(s.activity?.[d]),dayTasks:clone(s.dayTasks?.[d]),bookPath:ctx?.key?clone(s.bookPaths?.[ctx.key]):undefined,bookPathDay:ctx?.key?clone(s.bookPathDaily?.[d]?.[ctx.key]):undefined,bookPathKey:ctx?.key||null,v5events:s.v5.events.length};}
function putOrDelete(obj,key,value){if(value===undefined)delete obj[key];else obj[key]=clone(value)}
function restoreGrade(s,x){if(!x||Date.now()-x.at>3500)return false;ensure(s);s.vocab||={};s.mistakes||={};s.dayReviews||={};s.activity||={};s.dayTasks||={};s.bookPaths||={};s.bookPathDaily||={};s.bookPathDaily[x.day||day()]||={};const d=x.day||day();putOrDelete(s.vocab,x.id,x.vocab);putOrDelete(s.mistakes,x.k,x.mistake);s.mistakeEvents=(s.mistakeEvents||[]).slice(0,x.mistakeEvents);putOrDelete(s.dayReviews,d,x.dayReviews);putOrDelete(s.activity,d,x.activity);putOrDelete(s.dayTasks,d,x.dayTasks);if(x.bookPathKey){putOrDelete(s.bookPaths,x.bookPathKey,x.bookPath);putOrDelete(s.bookPathDaily[d],x.bookPathKey,x.bookPathDay)}s.v5.events=s.v5.events.slice(0,x.v5events);return true}
function findPath(s,book,preferred){
 const entries=[];
 for(const [key,p] of Object.entries(s.bookPaths||{})){
   let terms;try{terms=JSON.parse(key)}catch{continue}
   if(!Array.isArray(terms)||terms[0]!==book||!['alpha','random'].includes(terms[1])||typeof terms[2]!=='string'||!p||!Number.isFinite(+p.position))continue;
   entries.push({key,path:p,order:terms[1],topic:terms[2]});
 }
 if(preferred){const hit=entries.find(x=>x.order===preferred.order&&x.topic===preferred.topic);if(hit)return hit}
 // Older V4 installs may have 1000+ words on a random path. Do not silently switch to an empty alpha path.
 entries.sort((a,b)=>String(b.path.updated||'').localeCompare(String(a.path.updated||''))||(b.path.round||1)-(a.path.round||1)||(+b.path.position)-(+a.path.position));
 return entries[0]||{key:JSON.stringify([book,'alpha','all']),path:{round:1,position:0},order:'alpha',topic:'all'};
}
function addEvent(s,event){const v=ensure(s),id=event.id||('p5-'+Date.now()+'-'+Math.random().toString(36).slice(2,9));if(v.events.some(x=>x.id===id))return false;v.events.push({id,at:new Date().toISOString(),localDate:day(),...event});if(v.events.length>18000)v.events=v.events.slice(-18000);return true}
// 'mastered' is an achievement label, not a reason to terminate spaced review.
// Only an explicit user pause excludes a word. A legacy mastered card remains due.
function dueIds(s,now=Date.now()){
 return Object.entries(s.vocab||{}).filter(([id,m])=>{
  if(!m||m.reviewPaused===true)return false;
  const raw=m.dueAt||m.due;
  const date=raw&&/^\d{4}-\d\d-\d\d$/.test(raw)?new Date(raw+'T00:00:00').getTime():Date.parse(raw||'');
  return !Number.isFinite(date)||date<=now;
 }).map(([id])=>id);
}
return {ensure,bookGoal,setBookGoal,lastReader,beforeGrade,restoreGrade,findPath,addEvent,dueIds};
});

/* Sprint7 FSRS-6 binary-button scheduler. Based on the published DSR FSRS-6 formulas.
   UI choices: 不会 -> Again (1), 会 -> Good (3). No claims of custom-fitted weights.
   Source: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
   See README for implementation boundaries. */
(function(root){
 'use strict';
 const W=[0.2172,1.1771,3.2602,16.1507,7.0114,0.57,2.0966,0.0069,1.5261,0.112,1.0178,1.849,0.1133,0.3127,2.2934,0.2191,3.0004,0.7536,0.3332,0.1437,0.2];
 const RETENTION=0.9, FACTOR=Math.pow(RETENTION,-1/W[20])-1;
 const clip=(x,min,max)=>Math.max(min,Math.min(max,x));
 const initialD=g=>clip(W[4]-Math.exp(W[5]*(g-1))+1,1,10);
 const retrievability=(t,s)=>Math.pow(1+FACTOR*Math.max(0,t)/Math.max(.01,s),-W[20]);
 const intervalFor=s=>clip(Math.round(s/FACTOR*(Math.pow(RETENTION,-1/W[20])-1)),1,36500);
 function schedule(old,known,at=Date.now()){
  const ms=typeof at==='number'?at:new Date(at).getTime();
  const g=known?3:1;
  const legacy=old&&old.fsrsVersion!==6&&Number.isFinite(old.interval);
  // Historical SM-2 records have no reconstructible D/S; use previous interval as a coarse starting estimate.
  let s=old?.fsrsVersion===6?Number(old.stability):legacy?Math.max(.15,Number(old.interval)):0;
  let d=old?.fsrsVersion===6?Number(old.difficulty):legacy?initialD(3):0;
  const prevMs=old?.lastReviewed?new Date(old.lastReviewed).getTime():old?.last?new Date(old.last+'T12:00:00').getTime():NaN;
  let elapsed=Number.isFinite(prevMs)?Math.max(0,(ms-prevMs)/86400000):null;
  if(!Number.isFinite(s)||s<=0||!Number.isFinite(d)||d<=0){s=0;d=0}
  if(!s){s=W[g-1];d=initialD(g)}
  else{
   const r=retrievability(elapsed??0,s);
   const damped=d-W[6]*(g-3)*(10-d)/9;
   const d0easy=initialD(4);
   const newD=clip(W[7]*d0easy+(1-W[7])*damped,1,10);
   if(elapsed!==null&&elapsed<1){
    const candidate=s*Math.exp(W[17]*(g-3+W[18]))*Math.pow(s,-W[19]);
    s=known?Math.max(s,candidate):Math.max(.03,Math.min(s,candidate));
   }else if(known){
    s=s*(1+Math.exp(W[8])*(11-newD)*Math.pow(s,-W[9])*(Math.exp(W[10]*(1-r))-1));
   }else{
    const forgot=W[11]*Math.pow(newD,-W[12])*(Math.pow(s+1,W[13])-1)*Math.exp(W[14]*(1-r));
    s=Math.min(forgot,s/Math.exp(W[17]*W[18]));
   }
   d=newD;
  }
  s=clip(s,.03,36500);
  let interval=known?intervalFor(s):0;
  // A failed word can be re-tried after 10 minutes; Good follows FSRS calendar spacing.
  const dueMs=known?ms+interval*86400000:ms+10*60000;
  return {fsrsVersion:6,stability:+s.toFixed(6),difficulty:+d.toFixed(6),interval,desiredRetention:RETENTION,dueAt:new Date(dueMs).toISOString(),lastReviewed:new Date(ms).toISOString(),known:!!known};
 }
 root.SprintFSRS=Object.freeze({schedule,retrievability,intervalFor,weights:W.slice(),desiredRetention:RETENTION});
 if(typeof module==='object'&&module.exports)module.exports=root.SprintFSRS;
})(typeof globalThis==='object'?globalThis:this);

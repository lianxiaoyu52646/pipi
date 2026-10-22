/* Pure, testable per-word crossing rule. Never infer learning from restored scroll position. */
(function(root){
'use strict';
function next(previous,localTop,rowHeight,length,userGesture){
 const old=Math.max(0,Math.floor(Number(previous)||0));
 if(!userGesture||!Number.isFinite(localTop)||!Number.isFinite(rowHeight)||rowHeight<=0)return Math.min(old,length);
 // Only rows COMPLETELY above the list viewport count as "slid past".
 const crossed=Math.floor(Math.max(0,localTop+0.01)/rowHeight);
 return Math.max(Math.min(old,length),Math.min(Math.max(0,Math.floor(length)),crossed));
}
root.PipiScrollStudy=Object.freeze({next});
})(typeof window==='undefined'?globalThis:window);

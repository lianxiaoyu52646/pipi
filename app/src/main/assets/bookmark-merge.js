/* PIPI shared original-book bookmark resolver: compare each book's last time, not the number of stored books. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PipiBookmarkMerge=api;})(typeof window==='object'?window:null,function(){
'use strict';
function obj(x){if(!x||typeof x!=='object'||Array.isArray(x))return {};return x}
function time(row){const t=Date.parse(String(row?.last||row?.updatedAt||''));return Number.isFinite(t)?t:0}
function merge(local,native){local=obj(local);native=obj(native);const merged={...local};
 for(const [id,remote] of Object.entries(native)){
  if(!remote||typeof remote!=='object'||Array.isArray(remote))continue;
  const old=merged[id];
  // Equal timestamps: prefer native durable SQLite. Do not compare chapter/page,
  // because deliberately rereading earlier pages must not be treated as stale.
  if(!old||typeof old!=='object'||time(remote)>=time(old))merged[id]=remote;
 }
 return merged;
}
return {merge,time};
});

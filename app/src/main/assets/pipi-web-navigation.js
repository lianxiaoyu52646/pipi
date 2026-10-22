(function(){'use strict';
const KEY='pipi_external_route_history_v511';
function current(){return location.pathname.split('/').pop()+(location.search||'')}
function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||'[]')}catch(_){return []}}
function write(rows){try{sessionStorage.setItem(KEY,JSON.stringify(rows.slice(-18)))}catch(_){}}
function recordDepart(route){const url=route||current(),rows=read();if(rows[rows.length-1]!==url)rows.push(url);write(rows)}
function back(fallback){const rows=read();let route=rows.pop();write(rows);
 if(!route || route===current())route=fallback||'index.html?nav=today';
 location.assign('./'+route.replace(/^\.\//,''));}
window.PipiWebNavigation={recordDepart,back,history:read};
})();
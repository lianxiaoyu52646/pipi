/* Pipi V5.12.18 - phonetics in FSRS list and review cards.
 * ECDICT is already bundled offline. Read-only UI hydration; no FSRS, SQLite
 * or localStorage writes. Only on-screen review rows trigger dictionary loads.
 */
(function(root){
  'use strict';
  const resolved=new Map(), pending=new Map();
  let observer=null, fallbackRoot=null, fallbackListener=null, fallbackTimer=null;
  const LIMIT=2500;
  function key(word){return String(word||'').trim().toLowerCase().normalize('NFC');}
  function format(raw){
    if(typeof raw!=='string')return '';
    let value=raw.trim().replace(/^[/\[\]\s]+|[/\[\]\s]+$/g,'').trim()
      .replace(/[әӘ]/g,'ə').replace(/'/g,'ˈ').replace(/:/g,'ː');
    if(!value||value==='undefined'||value==='null'||value.length>140)return '';
    return '/'+value+'/';
  }
  function peek(word){const k=key(word);return resolved.has(k)?resolved.get(k):'';}
  function remember(k,value){
    if(resolved.has(k))resolved.delete(k);
    resolved.set(k,value);
    if(resolved.size>LIMIT)resolved.delete(resolved.keys().next().value);
  }
  function lookup(word){
    const k=key(word);
    if(!k)return Promise.resolve('');
    if(resolved.has(k))return Promise.resolve(resolved.get(k));
    if(pending.has(k))return pending.get(k);
    // Keep missing API recoverable rather than recording a permanent miss.
    if(!root.SprintECDICT||typeof root.SprintECDICT.lookup!=='function')return Promise.resolve('');
    const task=Promise.resolve().then(()=>root.SprintECDICT.lookup(word))
      .then(entry=>{
        const formatted=format(entry&&entry.phonetic);
        remember(k,formatted);
        return formatted;
      }).catch(err=>{
        // Offline index may not have loaded yet: retry on the next card open.
        if(root.console&&root.console.debug)root.console.debug('离线音标查询未完成',word,err);
        return '';
      }).finally(()=>{pending.delete(k);});
    pending.set(k,task);
    return task;
  }
  function write(el,result){
    if(!el || !el.isConnected || el.dataset.pipiPhoneticState==='ready')return;
    el.textContent=result||'暂无音标 · 可点发音';
    el.dataset.pipiPhoneticState=result?'ready':'missing';
  }
  function fill(el){
    if(!el||el.dataset.pipiPhoneticState==='ready'||el.dataset.pipiPhoneticState==='loading')return;
    const word=el.dataset.pipiPhoneticWord;
    if(!word)return;
    const cached=peek(word);
    if(cached){write(el,cached);return;}
    el.dataset.pipiPhoneticState='loading';
    lookup(word).then(result=>{
      // A sheet is reused when going to the next word. Reject stale answers.
      if(el.dataset.pipiPhoneticWord!==word)return;
      if(el.dataset.pipiPhoneticState==='loading')el.dataset.pipiPhoneticState='pending';
      write(el,result);
    });
  }
  function hydrateSheet(scope){
    const el=(scope||root.document)?.querySelector?.('.pipi-review-hero-phonetic[data-pipi-phonetic-word]');
    if(el)fill(el);
  }
  function visible(el,viewport){
    if(typeof el.getBoundingClientRect!=='function')return true;
    const r=el.getBoundingClientRect(),b=viewport?.getBoundingClientRect?.();
    return !b||r.bottom>=b.top-180&&r.top<=b.bottom+180;
  }
  function scanVisible(viewport){
    const els=root.document?.querySelectorAll?.('.pipi-review-list-phonetic[data-pipi-phonetic-word]')||[];
    let count=0;
    for(const el of els){if(count>=14)break;if(visible(el,viewport)){fill(el);count++;}}
  }
  function hydrateList(){
    const doc=root.document;if(!doc)return;
    const viewport=doc.getElementById?.('viewport');
    const els=doc.querySelectorAll?.('.pipi-review-list-phonetic[data-pipi-phonetic-word]')||[];
    if(observer){observer.disconnect();observer=null;}
    if(typeof root.IntersectionObserver==='function'){
      observer=new root.IntersectionObserver(entries=>{
        for(const entry of entries){if(entry.isIntersecting){fill(entry.target);observer?.unobserve?.(entry.target);}}
      },{root:viewport||null,rootMargin:'180px 0px'});
      for(const el of els)if(el.dataset.pipiPhoneticState!=='ready')observer.observe(el);
      return;
    }
    // Older WebViews: only scan near the viewport, throttle on scroll.
    scanVisible(viewport);
    if(fallbackRoot!==viewport){
      if(fallbackRoot&&fallbackListener)fallbackRoot.removeEventListener?.('scroll',fallbackListener);
      fallbackRoot=viewport;
      fallbackListener=()=>{if(fallbackTimer)clearTimeout(fallbackTimer);fallbackTimer=setTimeout(()=>{fallbackTimer=null;scanVisible(viewport);},80);};
      viewport?.addEventListener?.('scroll',fallbackListener,{passive:true});
    }
  }
  root.PipiReviewPhonetics={format,peek,lookup,hydrateSheet,hydrateList};
})(window);

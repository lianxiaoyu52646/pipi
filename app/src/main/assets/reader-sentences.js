/* Pipi V5.8 — punctuation-aware English narration. No network libraries.
 * Paragraphs are the source of truth, never viewport/pagination fragments.
 */
(function(root){
  'use strict';
  const TITLES = new Set(['mr','mrs','ms','miss','dr','prof','rev','st','sr','jr','gen','col','capt','lt','sgt','hon','pres','sen','rep','gov','messrs','mme','mlle']);
  const COMMON = new Set(['e.g','i.e','vs','cf','fig','figs','vol','vols','pp','p','no','nos','approx','dept','inc','ltd','co','ed','eds']);
  const CLOSERS = /[\u201d\u2019"'\u00bb)\]]/;
  function abbreviationBefore(source,dot){
    const before=source.slice(Math.max(0,dot-22),dot);
    const match=before.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)$/);
    return match?match[1]:'';
  }
  function isInternalDot(s,pos){
    if(s[pos]!=='.')return false;
    const before=s[pos-1]||'',after=s[pos+1]||'';
    if(/\d/.test(before)&&/\d/.test(after))return true;
    if(/[A-Za-z]/.test(before) && /^[A-Za-z]\./.test(s.slice(pos+1)))return true; // U.S. / e.g.
    const ab=abbreviationBefore(s,pos),lower=ab.toLowerCase();
    if(TITLES.has(lower))return true;
    if(COMMON.has(lower)){
      // "etc." and abbreviations at an actual end still terminate a sentence;
      // e.g./i.e. primarily introduce something afterwards.
      return !!s.slice(pos+1).match(/^\s*[,;:\-]?\s*\S/);
    }
    // One-letter name initials: J. R. R. Tolkien, or A. Smith.
    if(/^[A-Za-z]$/.test(ab)&&/\s+[A-Z][a-zA-Z]/.test(s.slice(pos+1,pos+22)))return true;
    // Complete dotted acronym like U.S. or Ph.D. followed by a lowercase continuation.
    if(/(?:[A-Za-z]\.)+[A-Za-z]$/.test(ab)&&/^\s+[a-z]/.test(s.slice(pos+1)))return true;
    return false;
  }
  function splitSentences(input){
    const s=String(input||'').replace(/\r\n?/g,'\n');
    const out=[];let start=0;
    function push(end){let a=start,b=end;while(a<b&&/\s/.test(s[a]))a++;while(b>a&&/\s/.test(s[b-1]))b--;if(b>a)out.push({text:s.slice(a,b),start:a,end:b});start=end;}
    for(let i=0;i<s.length;i++){
      if(!/[.!?\u3002\uff01\uff1f\u2026]/.test(s[i]))continue;
      if(s[i]==='.'&&isInternalDot(s,i))continue;
      // Consume contiguous !?!, ellipses and closing quotation marks.
      let end=i+1;
      while(end<s.length&&/[.!?\u3002\uff01\uff1f\u2026]/.test(s[end]))end++;
      while(end<s.length&&CLOSERS.test(s[end]))end++;
      const next=s[end]||'';
      // Keep dialogue and its reporting clause as one spoken sentence:
      // “Stop!” she cried. / “Stop!” the little boy cried. /
      // “Really?” Alice asked.  A newline is not a sentence boundary.
      const after=s.slice(end);
      const reporting=/(?:said|asked|cried|replied|answered|whispered|murmured|shouted|exclaimed|remarked|added|began|continued|insisted|called)/i;
      const attribution=/^\s+(?:(?:he|she|they|we|i|you|it|said|asked|cried|replied|answered|whispered|murmured|shouted)\b|(?:the|a|an|my|his|her|our|their)\s+(?:[A-Za-z]+\s+){0,2}[A-Za-z]+\s+(?:said|asked|cried|replied|answered|whispered|shouted)\b|[A-Z][a-z]+\s+(?:said|asked|cried|replied|answered|whispered|shouted)\b)/i;
      if(CLOSERS.test(s[end-1]||'') && attribution.test(after) && (reporting.test(after.slice(0,85)))) { i=end-1;continue; }
      // An end mark inside a word/number is not a sentence ending.
      if(next&&!/\s/.test(next)) {i=end-1;continue;}
      push(end);i=end-1;
    }
    push(s.length);
    return out;
  }
  function splitLongSentence(sentence,maxChars){
    const max=Math.max(400,Math.min(1400,maxChars||1400));
    if(sentence.text.length<=max)return [sentence];
    const s=sentence.text,out=[];let i=0;
    while(i<s.length){
      if(s.length-i<=max){out.push({...sentence,text:s.slice(i),start:sentence.start+i,end:sentence.start+s.length});break;}
      const window=s.slice(i,i+max+1);
      // Prefer a complete spoken clause instead of an arbitrary page-sized piece.
      let cut=0,m;const boundary=/[,;:\u2014\u2013]\s+|\s+/g;
      while((m=boundary.exec(window))!==null){const at=m.index+m[0].length;if(at>=Math.floor(max*.55))cut=at;}
      if(!cut)cut=max;
      const piece=s.slice(i,i+cut).trim();
      if(piece){let off=i;while(off<i+cut&&/\s/.test(s[off]))off++;out.push({...sentence,text:piece,start:sentence.start+off,end:sentence.start+i+cut});}
      i+=cut;
      while(i<s.length&&/\s/.test(s[i]))i++;
    }
    return out;
  }
  function forNarration(text,maxChars){return splitSentences(text).flatMap((s,index)=>splitLongSentence({...s,sentenceIndex:index},maxChars));}
  const api={splitSentences,forNarration};
  root.PipiReaderSentences=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

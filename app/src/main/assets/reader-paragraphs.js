/* Pipi V5.8 - normalize paragraph structure in Project Gutenberg plain text.
 * Some PG editions use TWO newlines at each PRINTED LINE and FOUR at a true
 * paragraph boundary. Splitting on blank lines turns each printed line into
 * a false paragraph, causing speech to stop without reaching punctuation.
 * This module preserves every text character except the whitespace layout.
 */
(function(root){
 'use strict';
 const CURRENT_SCHEMA=2;
 function layoutOf(body){
   const source=String(body||'').replace(/\r\n?/g,'\n');
   const counts={single:0,double:0,quad:0};
   for(const m of source.matchAll(/\n(?:[ \t]*\n)*/g)){
     const n=(m[0].match(/\n/g)||[]).length;
     if(n===1)counts.single++;else if(n===2)counts.double++;else if(n>=4)counts.quad++;
   }
   // The complete book sections are long enough to detect this reliably;
   // if source is short, prefer normal paragraph handling rather than merging
   // real paragraph breaks. Printed-lines sources have almost no single \n.
   const doubled=counts.double>=8 && counts.quad>=2 && counts.double>counts.single*3;
   return {doubled,counts};
 }
 function normalizeParagraphs(body,layout){
   const source=String(body||'').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n');
   const doublePrinted=typeof layout==='boolean'?layout:layoutOf(source).doubled;
   const paragraphSeparator=doublePrinted?/\n(?:[ \t]*\n){3,}/:/\n(?:[ \t]*\n)+/;
   return source.split(paragraphSeparator).map(x=>x.replace(/\n(?:[ \t]*\n)*/g,' ').replace(/[ \t]+/g,' ').trim())
     .filter(x=>x.length>0&&!/^\[(?:illustration|decoration|figure)[^\]]*\]$/i.test(x));
 }
 const api={CURRENT_SCHEMA,layoutOf,normalizeParagraphs};
 root.PipiReaderParagraphs=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

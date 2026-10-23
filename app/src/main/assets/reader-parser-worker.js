/* Generated from originals-reader.js parser in V5.12.14: full source validation is retained. */
const window=self;
importScripts('./reader-paragraphs.js');
const now=()=>new Date().toISOString();
function tokenize(txt){return String(txt).match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)||[]}
function removePGHeader(txt){let s=txt.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const start=/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(s);if(start)s=s.slice(start.index+start[0].length);const end=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(s);if(end)s=s.slice(0,end.index);return s.trim()}
const ROM='(?:[IVXLCDM]+|\\d+)';
const NUMBER='(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?|THIRTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?|FORTY(?:[-\\s]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?)';
const CHAPTER_RE=new RegExp('^CHAPTER\\s+(?:'+ROM+'|'+NUMBER+')(?:\\.|:|\\s+|$)','i');
function headingFor(id,line){const x=line.trim();if(!x||x.length>130)return false;
 if(id==='christmas')return /^STAVE\s+(?:[IVX]+|ONE|TWO|THREE|FOUR|FIVE)(?:\s*[:.\s]|$)/i.test(x);
 if(id==='sherlock')return (/^ADVENTURE\s+[IVXLCDM]+\.\s+[A-Z]/i.test(x)||/^(?:VII|VIII|IX|X|XI|XII)\.\s+[A-Z][A-Z]/.test(x))&&x.length>12;
 if(id==='machine')return /^(?:[IVXLCDM]{1,6})\.?$/.test(x)||/^EPILOGUE\s*\.?$/i.test(x);
 // Gutenberg editions of these works use a standalone chapter ordinal or a number + title,
 // rather than the conventional 'CHAPTER n' heading.
 if(id==='treasure')return /^(?:[IVXLCDM]{1,7})$/.test(x);
 if(id==='willows')return /^(?:[IVXLCDM]{1,7})\.$/.test(x);
 if(id==='littleprincess')return /^(?:[1-9]|1[0-9])$/.test(x);
 if(id==='blackbeauty')return /^(?:0?[1-9]|[1-4][0-9])\s+[A-Za-z]/.test(x);
 if(id==='huckfinn' && /^CHAPTER THE LAST\.?$/i.test(x))return true;
 return CHAPTER_RE.test(x)||(/^(?:CHAPTER\s+)?(?:[IVX]{1,6})\.\s+[A-Z]/.test(x)&&id==='oz');
}
function cleanP(p){return p.replace(/\n+/g,' ').replace(/[ \t]+/g,' ').trim()}
function paragraphs(s,doubled){return window.PipiReaderParagraphs.normalizeParagraphs(s,doubled)}
/** Does not throw text away if chapter detection fails: user sees an explicit missing-asset error. */
function parseOriginal(raw,book){if(typeof raw!=='string'||raw.length<20000||raw.length>9000000)throw Error('不是有效的完整英文 TXT 文本（过小或过大）');
 const text=removePGHeader(raw),lines=text.split('\n');
 const doubledWrap=window.PipiReaderParagraphs.layoutOf(text).doubled;
 const matches=[];let offset=0;for(let i=0;i<lines.length;i++){if(headingFor(book.id,lines[i]))matches.push({line:i,start:offset,title:lines[i].trim()});offset+=lines[i].length+1}
 // PG #120 contains a typographical chapter heading 'XXVII' where 'XVII'
 // belongs, directly between XVI and XVIII. Correct the navigation label only;
 // preserve the uploaded source TXT byte-for-byte.
 if(book.id==='treasure' && matches.length===34 &&
    matches[16]?.title==='XXVII' && matches[17]?.title==='XVIII') matches[16].title='XVII';
 const need=book.expectedSections; if(matches.length<need)throw Error(`只识别到 ${matches.length}/${need} 个章节标题，不能确认这是完整原著。请使用该书官方TXT版本。`);
 // Gutenberg's Contents often repeats chapter labels once. Choose the last full run,
 // and verify that each section holds narrative text (rather than TOC lines).
 // Select the LAST COMPLETE ordinal sequence, not the last N headings.
 // This excludes all printed Contents headings even when the contents appears more than once.
 function ordinal(title){
  const roman=x=>{let total=0,prev=0;const tab={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};for(const c of x.split('').reverse()){const n=tab[c]||0;total+=n<prev?-n:n;prev=n}return total};
  let t=title.toUpperCase(),m;
  if(book.id==='machine' && /^EPILOGUE\b/.test(t))return 17;
  if(book.id==='huckfinn' && /^CHAPTER THE LAST\.?$/.test(t))return 43;
  if(book.id==='treasure')m=t.match(/^([IVXLCDM]+)$/);
  else if(book.id==='willows')m=t.match(/^([IVXLCDM]+)\.$/);
  else if(book.id==='littleprincess')m=t.match(/^(\d{1,2})$/);
  else if(book.id==='blackbeauty')m=t.match(/^(\d{1,2})\s+/);
  if(!m && book.id==='machine')m=t.match(/^([IVXLCDM]+)\.?$/);
  else if(!m && book.id==='sherlock')m=t.match(/^(?:ADVENTURE\s+)?([IVXLCDM]+)\./);
  else if(!m && book.id==='christmas')m=t.match(/^STAVE\s+([IVXLCDM]+)/);
  else if(!m)m=t.match(/^CHAPTER\s+([IVXLCDM]+|\d+|[A-Z]+(?:-[A-Z]+)?)\b/);
  if(!m)return NaN;
  const val=m[1];if(/^\d+$/.test(val))return Number(val);
  if(/^[IVXLCDM]+$/.test(val))return roman(val);
  const table=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  let n=0;for(const part of val.split('-')){const v=table.indexOf(part);if(v>0)n+=v;else if(part==='TWENTY')n+=20;else if(part==='THIRTY')n+=30;else if(part==='FORTY')n+=40;else return NaN}return n;
 }
 const chosen=[];let cursor=matches.length;
 for(let ord=need;ord>=1;ord--){let at=-1;for(let k=cursor-1;k>=0;k--){if(ordinal(matches[k].title)===ord){at=k;break}}if(at<0)throw Error(`缺少第 ${ord} 章节标题，无法确认全文完整`);chosen.unshift(matches[at]);cursor=at}
 const sections=chosen.map((m,i)=>{const end=i+1<chosen.length?chosen[i+1].start:text.length;
 const slice=text.slice(m.start,end);const lines2=slice.split('\n');const title=m.title;
 // Do not guess whether the next line is a subtitle: dropping it can silently
 // delete the first sentence of the chapter in some complete PG editions.
 lines2.shift();
 const body=lines2.join('\n').trim();return {title,body,paragraphs:paragraphs(body,doubledWrap),wordCount:tokenize(body).length};});
 if(sections.some((x,i)=>x.wordCount<(i===sections.length-1?35:80)))throw Error('某些章节正文过短，可能误读了目录，未保存该书。');
 // For editions with long prefaces or introductions, preserve them as separate sections.
 // No inferred text is inserted; all additional text comes from the exact source TXT.
 const frontStart=chosen[0].start;
 const front=text.slice(0,frontStart);
 if(['pride','oz','christmas','tom'].includes(book.id)){
   const cue=book.id==='pride'?/^(?:PREFACE\.)\s*$/im:['christmas','tom'].includes(book.id)?/^PREFACE\s*$/im:/^Introduction\s*$/im;
   const a=[...front.matchAll(new RegExp(cue.source,'gim'))].pop();
   if(a){const frontText=front.slice(a.index+a[0].length).trim();
     // Get rid of chapter listing in printed TOC; still retain the original prose.
     const cut=frontText.search(/\n\s*(?:CONTENTS|TABLE OF CONTENTS)\s*\n/i);
     const body=(cut>=0?frontText.slice(0,cut):frontText).trim();
     if(tokenize(body).length>=45&&tokenize(body).length<20000){sections.unshift({title:a[0].trim(),body,paragraphs:paragraphs(body,doubledWrap),wordCount:tokenize(body).length,frontmatter:true})}
   }
 }
 // Ensure body of first/last substantive chapters has a plausible amount of prose.
 // Multi-volume appendix: preserve non-narrative trailing material within final section by design.
 // Do not claim editorial pagination perfectly matches all printed editions.
 const work={id:book.id,source:book.source,number:book.pg,title:book.enTitle,sections,wordCount:sections.reduce((n,s)=>n+s.wordCount,0),rawLength:raw.length,paragraphSchema:window.PipiReaderParagraphs.CURRENT_SCHEMA,cachedAt:now()};
 if(work.wordCount<Math.max(8000,book.expectedSections*140))throw Error('正文长度异常，不能确认为整本原著');return work;
}

self.onmessage=(event)=>{try{const work=parseOriginal(event.data.raw,event.data.book);postMessage({ok:true,work})}catch(e){postMessage({ok:false,error:e?.message||String(e)})}};


'use strict';
const ICONS={home:'home',test:'test',train:'train',plan:'plan',user:'user',arrow:'arrow',check:'check',clock:'clock',flame:'flame',book:'book',headphones:'headphones',mic:'mic',edit:'edit',chart:'chart',play:'play',volume:'volume',target:'target',gear:'gear',external:'external',chevron:'chevron',refresh:'refresh',download:'download',spark:'spark',eye:'eye',eyeOff:'eye-off'};
const icon=(n,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${ICONS[n]||'spark'}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dayDelta=(a,b)=>Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/86400000);
const daysFrom=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d)};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmtDate=d=>{const [y,m,x]=d.split('-');return `${Number(m)}月${Number(x)}日`};
const rnd=(arr)=>[...arr].sort(()=>Math.random()-.5);
const words=BANK.words.map((w,i)=>({...w,id:`w${i}`}));
const listening=BANK.listening.map(l=>({...l,level:l.level||'B1',qs:l.questions.map(q=>[q.question,q.options,q.answer,q.explanation])}));
const readings=BANK.reading.map(r=>({...r,qs:r.questions.map(q=>[q.question,q.options,q.answer,q.explanation])}));
const speaking=BANK.speaking;
const writing=BANK.writing;

const resourceLinks=[
{title:'雅思四科免费练习',sub:'British Council · 官方样题与考试格式',url:'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests/academic',cat:'雅思官方',icon:'test'},
{title:'分级听力 A1—C1',sub:'LearnEnglish · 真实录音与互动练习',url:'https://learnenglish.britishcouncil.org/free-resources/listening',cat:'听力基础',icon:'headphones'},
{title:'雅思官方评分说明',sub:'IELTS.org · 了解40题换算与四科评分',url:'https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail',cat:'评分标准',icon:'chart'},
{title:'雅思听力样题',sub:'British Council · 真正考试题型与音频',url:'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests/academic/listening',cat:'听力专项',icon:'volume'},
{title:'雅思写作评分标准',sub:'IELTS.org · Task Response / Coherence 等',url:'https://ielts.org/take-a-test/how-you-are-tested/test-format',cat:'写作专项',icon:'edit'},
{title:'雅思培训类四科样题',sub:'British Council · G类阅读与书信写作',url:'https://takeielts.britishcouncil.org/en-gb/prepare/ielts-free-practice-mock-tests/general-training',cat:'培训类',icon:'book'}
];
const KEY='sprint7_complete_v1';
const WORD_KINDS=new Set(['vocab','sound','readingword','dictationword']);
const KNOWN_TO_ARCHIVE=7; // achievement badge only; FSRS due reviews remain active
const errorKey=(kind,unit,q=0)=>WORD_KINDS.has(kind)?`word:${unit}:0`:`${kind}:${unit}:${q}`;
function dueLabel(item){const value=item?.dueAt||item?.due;if(!value)return '待安排';const d=new Date(value);if(!Number.isFinite(d.getTime()))return String(value).slice(0,10);const mins=Math.ceil((d.getTime()-Date.now())/60000);if(mins<=0)return '现在到期';if(mins<60)return mins+'分钟后';if(mins<1440)return Math.ceil(mins/60)+'小时后';return (d.getMonth()+1)+'月'+d.getDate()+'日';}
function isDue(item){if(!item)return true;if(item.dueAt)return new Date(item.dueAt).getTime()<=Date.now();return !item.due||item.due<=dateKey();}
function reviewMemory(id,known){const old=state.vocab[id]||{};const next=SprintFSRS.schedule(old,known);const knownCount=known?(Number(old.knownCount)||0)+1:(Number(old.knownCount)||0);state.vocab[id]={...old,...next,knownCount,knownTotal:(Number(old.knownTotal)||0)+(known?1:0),reps:known?(Number(old.reps)||0)+1:0,lapses:(Number(old.lapses)||0)+(known?0:1),last:dateKey(),due:dateKey(new Date(next.dueAt))};return state.vocab[id]};
const defaultState=()=>({created:dateKey(),goal:7,dailyMinutes:120,exam:'academic',start:dateKey(),testResults:[],quiz:null,vocab:{},custom:[],dayReviews:{},dayTasks:{},listenHistory:[],dictationHistory:[],readHistory:[],speakingHistory:[],writingDrafts:{},writingHistory:[],mockHistory:[],activity:{},soundHistory:[],stageHistory:[],stageTest:null,mistakes:{},mistakeEvents:[],readerWords:{},readerProgress:{},readerSettings:{showChinese:true,fontSize:18},wordLevel:'adaptive',wordTopic:'all',wordGoal:50,wordBook:'ielts',wordOrder:'alpha',bookPaths:{},bookPathDaily:{},bookExamHistory:[],wordStudyModes:{},wordDisplayModes:{},wordListProgress:{},wordListDaily:{},lessonSearch:'',activityMinutes:{},settingsVersion:1});
function getState(){
 const raw=localStorage.getItem(KEY);
 if(raw===null)return defaultState(); // A genuinely fresh install.
 try{
  if(!window.PipiStateSafety?.valid(raw))throw Error('学习记录结构或校验不正确');
  return {...defaultState(),...JSON.parse(raw)};
 }catch(e){
  // Never treat a damaged/older existing save as a new install. The old code
  // silently returned an empty state and the next save erased the only copy.
  const area=document.getElementById('content');
  if(area)area.innerHTML='<section class="pipi-recovery-lock"><div class="pipi-recovery-symbol">!</div><h1>学习记录需要恢复</h1><p>检测到手机上的学习记录无法安全读取。为防止清空原有进度，皮皮已暂停写入。请进入数据备份页，先导出可恢复的数据，再尝试自动快照或 JSON 备份恢复。</p><a class="pipi-recovery-action" href="./backup.html">进入数据备份与恢复</a><p class="pipi-recovery-warning">不要卸载 App、不要清除数据；重新安装无法修复已损坏的存储。</p></section>';
  throw Error('皮皮已保护异常的学习数据，写入已阻止：'+e.message);
 }
}
let state=getState(); if(window.SprintSchools)window.SprintSchools.getActive=()=>state.wordBook;
const ui={page:'today',training:'words',quizGuess:false,quizType:'vocab',lesson:0,dictationIndex:0,dictationResult:null,reading:0,speak:0,write:0,answers:{},readingAnswers:{},transcript:false,flip:false,flipOverride:null,listBook:null,listRows:[],listStart:-1,wordId:null,speechRate:1,dialog:null,recording:false,recordSeconds:0,audioUrl:null,recordBlob:null,recorder:null,recordParts:[],focusTimer:null,focusSeconds:0,sessionReviewed:0,bookQuiz:null,bookImportKey:'ielts',bookStudyOpen:false,readerBookId:null,readerChapter:0,readerSelection:null,reviewFilter:'pending',reviewQuery:'',freshWordIds:new Set(),wordPathContext:null};
function save(urgent=false){try{
 const raw=JSON.stringify(state);
 localStorage.setItem(KEY,raw);
 if(localStorage.getItem(KEY)!==raw)throw Error('写入后校验失败');
 window.PipiStateSafety?.schedule(raw,urgent);
 return true;
 }catch(e){toast('记录保存失败，请进入工具页导出备份');console.error('皮皮保存失败',e);return false}}
function markActivity(task){const d=dateKey();state.activity[d]=(state.activity[d]||0)+1;if(task){state.dayTasks[d]=state.dayTasks[d]||{};state.dayTasks[d][task]=true}save()}
function taskDone(k){return !!state.dayTasks[dateKey()]?.[k]}
function currentPhase(){const d=Math.max(0,dayDelta(dateKey(),state.start));return d<14?0:d<56?1:d<126?2:3}
function daysLeft(){return Math.max(0,180-dayDelta(dateKey(),state.start))}
function dayNumber(){return Math.max(1,dayDelta(dateKey(),state.start)+1)}
const legacyWordMap=new Map(words.map(w=>[w.id,w]));
function activeBook(){return state.wordBook||'ielts'}
function importedBookReady(){return activeBook()==='basic'||SprintBooks.stats(activeBook()).phase==='ready'}
function allWords(){const book=activeBook();const list=book==='basic'?words:SprintBooks.get(book);const items=(list.length?list:words).concat(state.custom||[]);const known=new Set(items.map(w=>w.id));return items.concat(Object.values(state.readerWords||{}).filter(w=>!known.has(w.id)))}
function wordById(id){return SprintBooks.lookup(id)||legacyWordMap.get(id)||(state.custom||[]).find(w=>w.id===id)||(state.readerWords||{})[id]}
function countDoneToday(){return ['words','listen','speak','read','write'].filter(taskDone).length}
function totalActiveDays(){return Object.keys(state.activity).length}
function streak(){let n=0;let d=dateKey();if(!state.activity[d])d=daysFrom(d,-1);while(state.activity[d]){n++;d=daysFrom(d,-1)}return n}
function mkProgress(p){return `<div class="meter"><div style="width:${clamp(p,0,100)}%"></div></div>`}
// Navigation history is independent of learning progress and never changes FSRS.
const pipiNavHistory=[];
const pipiScrollByPage=new Map();
function pipiPageKey(page=ui.page,training=ui.training){return page==='train'?'train:'+training:page}
function pipiSavePosition(){const view=document.getElementById('viewport');if(view)pipiScrollByPage.set(pipiPageKey(),view.scrollTop)}
function showPage(page,training,options={}){
 const oldKey=pipiPageKey(),nextKey=pipiPageKey(page,training||ui.training);
 if(oldKey===nextKey&&!options.force){ui.dialog=null;if(page==='train'&&(!training||training==='words')&&!ui.keepStudyNext)ui.bookStudyOpen=false;render(true);return}
 pipiSavePosition();flushWordListProgress();
 if(options.history!==false){pipiNavHistory.push({page:ui.page,training:ui.training,bookStudyOpen:!!ui.bookStudyOpen,scrollTop:pipiScrollByPage.get(oldKey)||0});if(pipiNavHistory.length>32)pipiNavHistory.shift()}
 if(page==='train'&&(!training||training==='words')&&!ui.keepStudyNext)ui.bookStudyOpen=false;
 ui.keepStudyNext=false;ui.page=page;if(training)ui.training=training;ui.dialog=null;
 render(true);
 if(options.restore!==false && nextKey!=='train:words'){
  const target=pipiScrollByPage.get(nextKey)||0;
  requestAnimationFrame(()=>{const view=document.getElementById('viewport');if(view&&ui.page===page)view.scrollTop=target})
 }
}
let toastTimer;
function toast(msg){const e=document.getElementById('toast-root');e.innerHTML=`<div class="toast" role="status">${esc(msg)}</div>`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{e.innerHTML=''},2700)}
function alertBox(title,body){ui.dialog=`<div class="sheet-header"><div class="sheet-title">${title}</div><button class="close" data-action="close-dialog">✕</button></div><div class="note" style="font-size:13px;color:#5f6f89">${body}</div><div class="sp20"></div><button class="btn full" data-action="close-dialog">知道了</button>`;renderDialog()}
function renderDialog(){document.getElementById('dialog-root').innerHTML=ui.dialog?`<div class="overlay" data-action="close-dialog"><div class="sheet" role="dialog" aria-modal="true" ><div class="sheet-handle"></div>${ui.dialog}</div></div>`:'';window.PipiVoice?.refreshRateUI?.()}
function render(resetScroll=false){const c=document.getElementById('content');let html='';
 if(ui.page==='today')html=renderToday();if(ui.page==='test')html=renderTest();if(ui.page==='train')html=renderTrain();if(ui.page==='review')html=renderReview();if(ui.page==='library')html=renderLiterature();if(ui.page==='plan')html=renderPlan();if(ui.page==='me')html=renderMe();if(ui.page==='metrics')html=renderOldMe();
 c.innerHTML=html+(ui.page==='train'?pipiUndoBar():'');
 const navs=[['today','home','今日'],['train','train','词书'],['library','book','阅读'],['review','refresh','复习'],['me','gear','工具']];
 document.getElementById('bottomNav').innerHTML=navs.map(([id,ic,label])=>`<button class="nav-item ${ui.page===id?'active':''}" data-page="${id}" aria-current="${ui.page===id?'page':'false'}"><span class="nav-icon">${icon(ic,22)}</span>${label}</button>`).join('');
 const goal=document.getElementById('topGoal');if(goal)goal.textContent='V'+(window.PipiBuildVersion||'5.12.2');renderDialog();const viewport=document.getElementById('viewport');const inWordList=ui.page==='train'&&ui.training==='words'&&ui.bookStudyOpen&&wordStudyMode()==='list';viewport.classList.toggle('pipi-word-scroll-active',inWordList);
 const topbar=document.querySelector('.app-top'),brand=topbar?.querySelector('.brand');
 topbar?.classList.toggle('pipi-word-nav-active',inWordList);
 if(brand){brand.innerHTML=inWordList?`<button type="button" class="pipi-top-back" data-action="choose-wordbook" aria-label="切换词书">${icon('chevron',20)}</button><button type="button" class="pipi-top-bookname pipi-switch-book" data-action="switch-book" aria-label="选择词书">${esc(SprintBooks.BOOKS[activeBook()]?.short||'基础词库')} ▾</button>`:`<span class="brand-icon brand-avatar"><img src="./app-avatar.png" alt="皮皮头像"/></span>皮皮`}
 if(resetScroll)viewport.scrollTop=0;if(inWordList)mountVirtualWordList();pipiUpdateCacheStatus();
}
function dailyAlloc(){
  const base=currentPhase()===0?[23,34,18,13,12]:currentPhase()===1?[18,31,23,14,14]:currentPhase()===2?[13,27,21,20,19]:[10,27,21,21,21];
  const out=[...base];const result=state.testResults.filter(x=>x.type==='vocab').at(-1);const sound=state.testResults.filter(x=>x.type==='sound').at(-1);
  if(result&&result.correct/result.total<.55){out[0]+=7;out[3]-=3;out[4]-=4}
  if(sound&&sound.correct/sound.total<.55){out[1]+=8;out[3]-=4;out[4]-=4}
  let mins=out.map(w=>Math.round(state.dailyMinutes*w/100));mins[4]+=state.dailyMinutes-mins.reduce((a,b)=>a+b,0);return Object.fromEntries(['words','listen','speak','read','write'].map((k,i)=>[k,mins[i]]));
}
const phaseDefs=[['打好基础','第 1—14 天','完成词汇和听力诊断，练发音与句子识别'],['输入输出强化','第 15—56 天','以精听、词汇和每日口语输出为主'],['雅思题型突破','第 57—126 天','听说读写四科专项，按周记录官方模考'],['模拟与冲刺','第 127—180 天','计时模拟，错题归因，按短板调整计划']];
function renderToday(){
 const now=dateKey(),v=PipiV5.ensure(state),book=activeBook(),meta=SprintBooks.BOOKS[book],cursor=wordListProgress(book).next;
 const bookName=meta?.short||'基础词库';const count=meta?(SprintBooks.stats(book).count||meta.expected):words.length;const next=Math.min(count,cursor)+1;
 const due=PipiV5.dueIds(state).length,availableBooks=window.PipiAssetStatus?.installedBooks||OriginalBooks.map(b=>b.id);
 let progress={};try{progress=JSON.parse(localStorage.getItem('sprint7_originals_progress')||'{}')}catch(e){}
 const recent=PipiV5.lastReader(progress,OriginalBooks.filter(b=>availableBooks.includes(b.id)));
 const dr=state.dayReviews?.[now]||{};const dayEvents=v.events.filter(x=>(x.localDate||dateKey(new Date(x.at)))===now);
 return `<section class="v5-hero"><div class="v5-eyebrow">PIPI LEARNING · ${now}</div><h1>今天，也有新的收获。</h1><p>背单词 · 读原著 · 随时接着学</p></section>
 <div class="v5-section-label"><h2>继续学习</h2><span>上次的进度已保存</span></div>
 <div class="v5-main-action"><span class="v5-card-icon">✦</span><div class="v5-mini">当前词书 · ${esc(bookName)}</div><h2>${cursor>=count?'已看完这本词书':`从第 ${next.toLocaleString('zh-CN')} 词继续`}</h2><p>已滑过 ${Math.min(cursor,count).toLocaleString('zh-CN')} 词 · 全书 ${count.toLocaleString('zh-CN')} 词</p>${mkProgress(count?Math.min(100,cursor/count*100):0)}<button class="v5-cta" data-action="v5-continue-book">继续背单词 ${icon('arrow',17)}</button></div>
 <div class="v5-homegrid"><button class="v5-home-tile" data-page="review"><span>↻</span><b>${due}</b><strong>到期复习</strong><small>把记忆变长久</small></button><button class="v5-home-tile" data-page="library"><span>▤</span><b>${availableBooks.length} 本</b><strong>原著阅读</strong><small>${availableBooks.length<OriginalBooks.length?'另有 ' + (OriginalBooks.length-availableBooks.length)+' 本待补全':'离线沉浸阅读'}</small></button></div>
 <div class="v5-section-label"><h2>继续阅读</h2><span>跨章节保存</span></div>
 <div class="v5-recent-reader"><div class="v5-reader-symbol">📖</div><div><strong>${recent?esc(recent.book.zhTitle):'从喜欢的英文原著开始'}</strong><p>${recent?`已读到第 ${recent.chapter+1} 章 · 自动续读`:`${availableBooks.length}本离线原著，点词可查词义`}</p></div><a href="./originals-reader.html${recent?'?book='+encodeURIComponent(recent.id):''}" class="v5-inline-link">${recent?'继续':'打开'} →</a></div>
 <div class="v5-section-label"><h2>今日成果</h2><span>只统计真实学习</span></div><div class="v5-daily-stats"><div><b>${Number(state.wordListDaily?.[now])||0}</b><span>今日滑过</span></div><div><b>${Number(dr.reviews)||0}</b><span>复习作答</span></div><div><b>${dayEvents.filter(x=>x.type==='reader_save').length}</b><span>阅读收录</span></div></div>
 <div class="v5-tools-caption"><button data-page="me">数据备份、设置与更多学习工具 →</button></div>`;
}
function renderResource(r){return `<a class="resource" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span class="resource-icon">${icon(r.icon,20)}</span><span class="flex1"><strong>${esc(r.title)}</strong><p>${esc(r.sub)}</p></span><span class="go">${icon('external',16)}</span></a>`}
function createQuiz(type){const levels=['A1','A2','B1','B2','C1'];let pool=type==='vocab'?levels.flatMap(level=>rnd(words.filter(w=>w.level===level)).slice(0,6)):levels.flatMap(level=>rnd(words.filter(w=>w.level===level)).slice(0,Math.max(2,level==='C1'?2:3)));const chosen=rnd(pool).slice(0,type==='vocab'?30:12);state.quiz={type,ids:chosen.map(w=>w.id),index:0,answers:[],started:new Date().toISOString()};ui.quizType=type;ui.quizGuess=false;save();render(true)}
function mkOptions(word){const chosenPool=word.id?.startsWith('lex:')?allWords():words;let same=chosenPool.filter(w=>w.level===word.level&&w.id!==word.id&&w.zh!==word.zh&&w.zh&&!w.zh.startsWith('暂无'));if(same.length<3)same=same.concat(words.filter(w=>w.id!==word.id&&w.zh!==word.zh));const opt=[...new Set(rnd(same).map(w=>w.zh))].slice(0,3);return rnd([word.zh,...opt])}
function renderTest(){if(state.stageTest)return renderStageTest();if(state.quiz&&state.quiz.index<state.quiz.ids.length)return renderQuiz();const voc=state.testResults.filter(x=>x.type==='vocab').at(-1),sound=state.testResults.filter(x=>x.type==='sound').at(-1);return `<div class="kicker">01 / LEVEL DIAGNOSTIC</div><h1 class="title">先测清楚，再开始努力</h1><p class="subtitle">用小样本分级测试发现薄弱环节，测的是识别表现，不是官方精确词汇量。</p>
<div class="sp20"></div><div class="card" style="background:linear-gradient(135deg,#f5f2ff,#fff);border-color:#eae5ff"><div class="row between"><span class="lesson-badge">词义识别 · 约 8 分钟</span><span style="color:#887bec">${icon('book',24)}</span></div><h2 style="font-size:20px;margin:15px 0 8px">30题分级词汇诊断</h2><p class="subtitle">A1—C1五个层级，每层6题，设置“猜的”选项，降低蒙对的影响。</p><div class="sp20"></div>${voc?`<div class="row between"><span class="small muted">上次结果：<b style="color:#6559e1">${esc(voc.summary)}</b></span><span class="micro">${fmtDate(voc.date)}</span></div><div class="sp14"></div>`:''}<button class="btn full" data-action="start-vocab">${voc?'重新测词义':'开始词义测试'} ${icon('arrow',16)}</button></div>
<div class="sp14"></div><div class="card"><div class="row between"><span class="lesson-badge">听词辨义 · 约 4 分钟</span><span style="color:#3f9cc2">${icon('headphones',24)}</span></div><h2 style="font-size:19px;margin:15px 0 8px">12题声音识别诊断</h2><p class="subtitle">只听英文发音选中文含义，帮助区分“看到认识”和“听到认识”。</p><div class="sp20"></div>${sound?`<p class="small" style="margin:0 0 13px">最近正确率：<b>${sound.correct}/${sound.total}</b></p>`:''}<button class="btn ghost full" data-action="start-sound">${sound?'重新测听辨':'开始听辨测试'} ${icon('arrow',16)}</button></div>
<div class="section-head"><h2 class="section-title">阶段性40题练习</h2></div><div class="card"><p class="subtitle">按原有题库随机拼成40题练习，检验站内正确率并保存错题。不是官方标准套卷，不能由此推算雅思分数。</p><div class="sp14"></div><div class="row"><button class="btn soft" data-action="stage-listen">听力40题</button><button class="btn ghost" data-action="stage-read">阅读40题</button></div>${stageHistorySmall()}</div><div class="section-head"><h2 class="section-title">诊断档案</h2><span class="section-caption">仅展示最近结果</span></div>${voc?renderTestResultCard(voc):`<div class="card"><div class="empty">${icon('chart',35)}<h3>尚未建立词汇基线</h3><p>完成第一个测试后会显示不同难度的识别率。</p></div></div>`}
${sound?renderTestResultCard(sound):''}
<div class="section-head"><h2 class="section-title">官方模考成绩记录</h2><button class="link-mini" data-action="open-mock">录入成绩 ${icon('arrow',14)}</button></div><div class="card"><p class="subtitle">把官方练习卷的四科结果记录在这里。听力、阅读可填答对题数；口语写作填真实评分或教师评分。</p><div class="sp14"></div><button class="btn soft full" data-action="open-mock">录入一次模考成绩</button>${state.mockHistory.length?`<div class="divider"></div>${state.mockHistory.slice(-3).reverse().map(m=>`<div class="row between" style="padding:8px 0"><span class="small">${fmtDate(m.date)} · ${esc(m.source)}</span><b>${m.overall.toFixed(1)} 分</b></div>`).join('')}`:''}</div>
<div class="note">这30题不是经过常模验证的标准化词汇量测验，因此不输出误导性的“精确掌握X个单词”。想测出可靠雅思水平，需要完成正式样题与口语写作评分。</div>`}
function renderTestResultCard(r){return `<div class="card"><div class="row between"><b class="small">${r.type==='vocab'?'词义识别':'听词辨义'} · ${esc(r.summary)}</b><span class="micro">${fmtDate(r.date)}</span></div><div class="sp8"></div><div class="band-list">${['A1','A2','B1','B2','C1'].map(l=>{const s=r.byLevel[l]||{correct:0,total:0};return `<div class="band-row"><b>${l}</b>${mkProgress(s.total?100*s.correct/s.total:0)}<span>${s.correct}/${s.total}</span></div>`}).join('')}</div><p class="note" style="margin-bottom:0">得分：${r.correct}/${r.total}；“猜的”正确答案在判断层级时按半权重处理。</p></div>`}
function renderQuiz(){const q=state.quiz;const word=wordById(q.ids[q.index]);if(!q.options)q.options={};if(!q.options[q.index]){q.options[q.index]=mkOptions(word);save()}const opts=q.options[q.index];let curWord=q.type==='vocab'?`<h2 class="qword">${esc(word.word)}</h2><p class="qprompt">选择最贴近的中文意思</p>`:`<div style="text-align:center;margin:29px 0 20px"><button class="btn soft" data-action="quiz-say" style="height:72px;width:72px;border-radius:24px;padding:0">${icon('volume',32)}</button><h2 style="font-size:20px;margin:16px 0 4px">先听发音，再作答</h2><p class="qprompt" style="margin:0">请勿先看单词拼写 · 可以重复播放</p></div>`;return `<div class="row between"><button class="textbtn" data-action="exit-quiz">← 退出测试</button><span class="lesson-badge">${q.type==='vocab'?'词义识别':'声音识别'}</span></div><div class="questions-head"><div class="progress-meta"><span>QUESTION ${q.index+1} / ${q.ids.length}</span><span>${Math.round(q.index/q.ids.length*100)}%</span></div>${mkProgress(q.index/q.ids.length*100)}</div><div class="card" style="margin-top:20px;padding:25px 17px 18px">${curWord}${opts.map((opt,i)=>`<button class="select-option" data-quiz-answer="${i}"><span>${String.fromCharCode(65+i)}.　${esc(opt)}</span>${icon('chevron',16)}</button>`).join('')}<label class="guess-switch"><input type="checkbox" id="guessBox" ${ui.quizGuess?'checked':''}> 这道题我主要靠猜（结果降低权重）</label><button class="textbtn" style="width:100%;padding:12px" data-quiz-answer="-1">完全不认识 · 跳过</button></div><div class="info-box" style="margin-top:16px">请尽量凭第一反应作答。测试过程中不提供即时答案，避免影响后续题目。</div>`}
function finishQuiz(){const q=state.quiz,ans=q.answers;const levs=['A1','A2','B1','B2','C1'];let byLevel={};levs.forEach(l=>byLevel[l]={correct:0,weighted:0,total:0});let correct=0;for(let i=0;i<ans.length;i++){let word=wordById(q.ids[i]),a=ans[i];byLevel[word.level].total++;if(a.correct){correct++;byLevel[word.level].correct++;byLevel[word.level].weighted+=a.guess?.5:1}}let summary='基础阶段';const rate=l=>byLevel[l].total?byLevel[l].weighted/byLevel[l].total:0;if(rate('A1')>=.65&&rate('A2')>=.5)summary='A2—B1样本';if(rate('B1')>=.6)summary='B1—B2样本';if(rate('B2')>=.55)summary='B2样本';if(rate('C1')>=.65&&rate('B2')>=.6)summary='B2—C1样本';const res={type:q.type,date:dateKey(),summary,correct,total:ans.length,byLevel};state.testResults.push(res);state.testResults=state.testResults.slice(-40);state.quiz=null;markActivity();save();ui.dialog=`<div class="sheet-header"><div class="sheet-title">诊断完成 ✨</div><button class="close" data-action="close-dialog">✕</button></div><div class="center"><div class="big-number">${correct}<span style="font-size:20px;color:#a5aaca"> / ${ans.length}</span></div><strong style="font-size:15px">${esc(summary)}</strong><p class="small muted">这是样本识别水平，不是官方词汇量或雅思分数。</p></div>${['A1','A2','B1','B2','C1'].map(l=>`<div class="band-row"><b>${l}</b>${mkProgress(byLevel[l].total?100*byLevel[l].correct/byLevel[l].total:0)}<span>${byLevel[l].correct}/${byLevel[l].total}</span></div>`).join('')}<div class="sp14"></div><button class="btn full" data-action="result-train">按诊断继续训练 ${icon('arrow',16)}</button>`;render(true)}
function pickQuizAnswer(i){const q=state.quiz;if(!q)return;const w=wordById(q.ids[q.index]);const opt=q.options[q.index]||(q.options[q.index]=mkOptions(w));const chosen=i<0?'':opt[i];if(chosen!==w.zh)upsertMistake(q.type,w.id,0,chosen);else healMistake(q.type,w.id,0);q.answers.push({correct:chosen===w.zh,guess:ui.quizGuess,chosen});q.index++;ui.quizGuess=false;save();if(q.index>=q.ids.length)finishQuiz();else render()}
function renderTrain(){if(ui.training==='words')return `${!ui.bookStudyOpen?'<h1 class="title">选择词书</h1><p class="subtitle">下滑算会，点「不会」收录生词，退出再进入自动续学。</p>':''}${renderWords()}`;
 const labels={sound:'听辨',listen:'听力',speak:'口语',read:'阅读',write:'写作'};const fn={sound:renderSoundTraining,listen:renderListening,speak:renderSpeaking,read:renderReading,write:renderWriting}[ui.training]||renderWords;
 return `<button class="v5-back" data-action="v5-tool-back">← 返回我的</button><div class="kicker">EXTRA PRACTICE</div><h1 class="title">${labels[ui.training]||'专项练习'}</h1>${fn()}`;}

function dueWords(){
 const today=dateKey(),book=activeBook(),list=allWords();
 const due=list.filter(w=>state.vocab[w.id]&&isDue(state.vocab[w.id])&&!wordArchived(w.id)).sort((a,b)=>String(state.vocab[a.id].dueAt||state.vocab[a.id].due||'').localeCompare(String(state.vocab[b.id].dueAt||state.vocab[b.id].due||'')));
 let fresh=[];ui.wordPathContext=null;ui.freshWordIds=new Set();
 if(book!=='basic' && importedBookReady()){
   const topic=state.wordTopic||'all';
   const source=SprintBooks.get(book).filter(w=>topic==='all'||(w.topics||[w.topic]).includes(topic));
   const ctx=SprintBookPath.ensure(state,book,state.wordOrder||'random',topic,source);
   ui.wordPathContext=ctx;
   fresh=SprintBookPath.candidates(state,ctx,state.wordGoal||50,today);
   ui.freshWordIds=new Set(fresh.map(w=>w.id));
 }else{
   const newLimit=Math.max(0,(state.wordGoal||50)-(state.dayReviews[today]?.new||0));
   const selector=state.wordLevel||'adaptive';const levels=selector==='adaptive'?levelFocus():selector;
   const pool=list.filter(w=>!state.vocab[w.id]&&(levels==='all'||levels.includes(w.level))&&(state.wordTopic==='all'||(w.topics||[w.topic]).includes(state.wordTopic)));
   fresh=(state.wordOrder==='alpha'?pool.sort((a,b)=>a.word.localeCompare(b.word,'en')):sampleUnseen(pool,newLimit)).slice(0,newLimit);
   ui.freshWordIds=new Set(fresh.map(w=>w.id));
 }
 // A word located at the book cursor belongs to the sequential pass, even if its FSRS record is also due.
 const ids=ui.freshWordIds;
 return [...fresh,...due.filter(w=>!ids.has(w.id))];
}
function wordArchived(id){return Object.values(state.mistakes||{}).some(m=>WORD_KINDS.has(m.kind)&&m.unit===id&&m.status==='mastered')};
function sampleUnseen(pool,n){const salt=dateKey()+'-'+activeBook();const hash=str=>{let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};return pool.map(w=>({h:hash(salt+w.id),w})).sort((a,b)=>a.h-b.h).slice(0,n).map(x=>x.w)}

function openWordBookSwitch(){
 const order=['primary','junior','senior','cet4','cet6','ielts','toefl'];
 ui.dialog=`<div class="sheet-header"><div class="sheet-title">切换词书</div><button class="close" data-action="close-dialog">✕</button></div>
 <p class="micro">切换后各本词书独立续学，不会清除已经滑过的记录。</p><div class="pipi-switch-list">${order.map(id=>{const b=SprintBooks.BOOKS[id];if(!b)return'';const total=SprintBooks.stats(id).count||b.expected||0;const next=wordListProgress(id).next;return `<button class="pipi-switch-option ${activeBook()===id?'chosen':''}" data-book="${id}"><span><strong>${esc(b.short)}</strong><small>已滑过 ${next} / ${total} 词</small></span><span>${activeBook()===id?'✓':'›'}</span></button>`}).join('')}</div>`;
 renderDialog();
}
function renderBookPicker(){
 const order=['primary','junior','senior','cet4','cet6','ielts','toefl'];
 return `<div class="v5-bookgrid">${order.map(id=>{const b=SprintBooks.BOOKS[id];if(!b)return '';const st=SprintBooks.stats(id),total=st.count||b.expected||0,pos=Math.min(total,wordListProgress(id).next);return `<button class="v5-bookitem ${activeBook()===id?'selected':''}" data-book="${id}"><span class="v5-book-cover">${esc((b.short||'EN').slice(0,5))}</span><span class="v5-book-details"><strong>${esc(b.label||b.short)}</strong><small>${pos?`已滑过 ${pos.toLocaleString('zh-CN')} 词 · 继续第 ${(pos+1).toLocaleString('zh-CN')} 词`:'尚未开始 · 点击学习'}</small><small>共 ${total.toLocaleString('zh-CN')} 词${st.phase==='error'?' · 资源缺失':''}</small></span><span class="v5-book-arrow">›</span></button>`}).join('')}</div>
 <div class="v5-footnote">7类词书按独立顺序续背；考试词书若本机缺少TXT资源，会提示缺失，不会用示例词冒充整本词书。</div><button class="btn ghost full" data-action="cache-all-books">检查本机词书资源</button>`;
}
async function loadSelectedBook(key){if(!SprintBooks.BOOKS[key])return;flushWordListProgress();ui.dialog=null;ui.bookStudyOpen=true;state.wordBook=key;state.wordStudyModes=state.wordStudyModes||{};state.wordStudyModes[key]='list';state.wordLevel='all';state.wordTopic='all';ui.wordId=null;ui.listBook=null;ui.flipOverride=null;ui.flip=false;ui.soundDrill=null;save();render(true);try{await SprintBooks.load(key);if(activeBook()===key&&!document.getElementById('pipiVirtualList'))render()}catch(e){render();toast(e.message)}}
async function cacheAllBooks(){toast('正在逐本读取手机内置词书');let ok=0;for(const key of Object.keys(SprintBooks.BOOKS)){try{await SprintBooks.load(key);ok++}catch(e){}render()}toast(`成功读取 ${ok}/7 本；如有失败请检查 APK 数据文件`)}
function bookImportModal(){if(['primary','junior','senior'].includes(activeBook())){toast('学段词书已内置，无需导入文件');return;}const key=activeBook()==='basic'?'ielts':activeBook();ui.bookImportKey=key;ui.dialog=`<div class="sheet-header"><div class="sheet-title">导入 ${esc(SprintBooks.BOOKS[key].short)} 词表</div><button class="close" data-action="close-dialog">✕</button></div><p class="small muted">使用 KyleBing english-vocabulary 项目对应的 TSV 简单词表：full_line_tsv/simple/正序/${esc(SprintBooks.BOOKS[key].filename)}.txt。文件可从项目 GitHub 页面获取，编码应为 UTF-8。</p><label class="field-label">选取 TXT / TSV 文件</label><input type="file" class="input" id="bookUpload" accept=".txt,.tsv,text/plain"/><div class="sp14"></div><button class="btn full" data-action="submit-book-import">导入并离线保存</button><p class="micro">为保证质量，仅接受字段结构正确且条目数量合理的对应词书，不把少量示例误判为整本词书。</p>`;renderDialog()}
async function importBookFromFile(){const f=document.getElementById('bookUpload')?.files?.[0];if(!f){toast('先选择词书TXT文件');return}if(f.size>13000000){toast('文件过大，请使用简化词表');return}try{const text=await f.text();const key=ui.bookImportKey;const arr=await SprintBooks.importText(key,text);ui.dialog=null;state.wordBook=key;state.wordLevel='all';state.wordTopic='all';save();render();toast('导入成功：'+arr.length.toLocaleString('zh-CN')+' 词')}catch(e){toast('导入失败：'+e.message)}}
function startBookQuiz(){if(!importedBookReady()){toast('请先加载词书');return}const pool=allWords().filter(w=>w.id.startsWith('lex:')&&w.zh);if(pool.length<40){toast('当前是基础词库；请先选择一本词书');return}ui.bookQuiz={key:activeBook(),ids:rnd(pool).slice(0,30).map(w=>w.id),index:0,answers:[],options:null,feedback:null};render(true)}
function bookQuizChoose(n){const q=ui.bookQuiz;if(!q||q.feedback)return;const w=wordById(q.ids[q.index]);const good=q.options[n]===w.zh;q.feedback={picked:n,good};q.answers.push(good);if(good)healMistake('vocab',w.id,0);else upsertMistake('vocab',w.id,0,q.options[n]);save();render()}
function bookQuizNext(){const q=ui.bookQuiz;if(!q)return;q.index++;q.options=null;q.feedback=null;if(q.index>=q.ids.length){const correct=q.answers.filter(Boolean).length;state.bookExamHistory=state.bookExamHistory||[];state.bookExamHistory.push({date:dateKey(),book:q.key,correct,total:q.ids.length});save()}render()}
function renderBookQuiz(){const q=ui.bookQuiz;if(!q)return'';const exit=`<button class="textbtn" data-action="book-quiz-exit">${icon('chevron',14)} 返回词库</button>`;const name=SprintBooks.BOOKS[q.key]?.short||'';if(q.index>=q.ids.length){const good=q.answers.filter(Boolean).length;return `<div class="card center"><span class="lesson-badge">${esc(name)} · 词书抽测</span><div class="big-number">${good} <span style="font-size:21px">/ ${q.ids.length}</span></div><p class="subtitle">本次随机样本正确率 ${Math.round(good/q.ids.length*100)}%。该结果只是词义识别抽测，不能等同真实词汇量或雅思分数。</p><div class="sp20"></div><button class="btn full" data-action="book-quiz-start">重新抽测30题</button><div class="sp12"></div>${exit}</div>`}const w=wordById(q.ids[q.index]);if(!q.options)q.options=mkOptions(w);return `<div class="row between" style="margin-bottom:12px"><span class="lesson-badge">${esc(name)} · ${q.index+1}/30</span>${exit}</div>${mkProgress((q.index)/30*100)}<div class="sp14"></div><div class="card"><p class="eyebrow">VOCABULARY CHECK</p><div class="qword">${esc(w.word)}</div><p class="small muted">选择这个单词最贴近的中文意思</p>${q.options.map((x,i)=>`<button class="answer-btn ${q.feedback&&i===q.options.indexOf(w.zh)?'correct':''} ${q.feedback&&q.feedback.picked===i&&!q.feedback.good?'wrong':''}" data-book-answer="${i}" ${q.feedback?'disabled':''}>${'ABCD'[i]}. ${esc(x)}</button>`).join('')}${q.feedback?`<div class="info-box ${q.feedback.good?'green':''}">${q.feedback.good?'答对了':'需要复习'}：${esc(w.word)} — ${esc(w.zh)}</div><div class="sp12"></div><button class="btn full" data-action="book-quiz-next">${q.index===29?'查看学习结果':'下一题'} ${icon('arrow',16)}</button>`:''}</div><div class="note">错词会进入错题本并跟随你的跨词书进度记录。答案仅供练习参考。</div>`}

function renderWords(){if(ui.bookQuiz)return renderBookQuiz();
 if(!ui.bookStudyOpen)return renderBookPicker();
 const picker=`<div class="pipi-studytop"><strong>${esc(SprintBooks.BOOKS[activeBook()]?.short||'基础词库')}</strong><button class="pipi-backbook" data-action="switch-book">切换词书 ▾</button></div>`;
 const current=activeBook();if(current!=='basic'&&!importedBookReady())return picker+`<div class="card" style="margin-top:12px"><div class="empty">${icon('download',34)}<h3>${SprintBooks.stats(current).phase==='loading'?'正在获取词书…':'从手机本地文件载入词书'}</h3><p>小学／初中／高中词书已内置，加载无需联网；考试词书若安装包未包含完整TXT，请导入词表；不会联网下载。</p><button class="btn full" data-action="load-active-book">${SprintBooks.stats(current).phase==='loading'?'正在连接…':'打开这本词书'}</button><div class="sp14"></div><button class="btn ghost full" data-action="import-book">导入 TXT 词表</button><div class="sp8"></div><button class="textbtn" data-book="basic">先使用离线基础示例词</button></div></div>`;if(wordStudyMode()==='list')return picker+renderWordList();const levelOpts=['adaptive','all','A1','A2','B1','B2','C1'];const levelLabels=['智能推荐','全部级别','A1','A2','B1','B2','C1'];const topicList=['all',...new Set(allWords().flatMap(w=>w.topics||[w.topic]).filter(Boolean))];const selectHeader=picker+`<div class="card" style="margin-bottom:13px"><div class="row between"><b class="small">我的词汇路径</b><span class="micro">${allWords().length.toLocaleString('zh-CN')} 词 · 当前词书</span></div><div class="row" style="margin-top:10px">${current==='basic'?`<select class="select" id="wordLevelFilter" aria-label="词汇等级">${levelOpts.map((o,i)=>`<option value="${o}" ${state.wordLevel===o?'selected':''}>${levelLabels[i]}</option>`).join('')}</select>`:`<select class="select" id="wordOrderFilter"><option value="alpha" ${state.wordOrder==='alpha'?'selected':''}>按字母顺序</option><option value="random" ${state.wordOrder==='random'?'selected':''}>固定随机顺序</option></select>`}<select class="select" id="wordTopicFilter" aria-label="主题筛选">${topicList.map(t=>`<option value="${esc(t)}" ${state.wordTopic===t?'selected':''}>${esc(t==='all'?'全部主题':t)}</option>`).join('')}</select></div><div class="row between" style="margin-top:12px"><span class="micro">每日新词</span><select class="select" style="max-width:100px" id="wordGoalFilter">${[10,20,30,50,100].map(n=>`<option value="${n}" ${PipiV5.bookGoal(state,current)===n?'selected':''}>${n} 词</option>`).join('')}</select></div></div>`;const wordChrome=renderWordChrome();const queue=dueWords(),ctx=ui.wordPathContext,studyProgress=ctx?`<div class="book-path-status"><div><strong>第 ${ctx.path.round} 轮 · 接下来第 ${Math.min(ctx.rows.length,ctx.path.position+1)} / ${ctx.rows.length} 词</strong><span>今日按当前顺序已学 ${SprintBookPath.dailyCount(state,ctx.key)} / ${state.wordGoal||50} · 自动续学</span></div><div class="book-path-track"><i style="width:${ctx.rows.length?Math.round(ctx.path.position/ctx.rows.length*100):0}%"></i></div></div>`:'' ,id=queue.some(x=>x.id===ui.wordId)?ui.wordId:queue[0]?.id;if(!id)return selectHeader+wordChrome+studyProgress+`<div class="card"><div class="empty">${icon('check',33)}<h3>今天的计划词卡已完成</h3><p>今日新词目标已完成，复习任务会在到期后出现。可以调整每日数量或切换其他词书。</p><button class="btn soft" data-action="book-quiz-start">开始30题词书抽测</button></div></div><div class="sp14"></div>${renderWordStats()}`;if(ui.wordId!==id)ui.flipOverride=null;ui.wordId=id;ui.flip=effectiveWordMeaning();const w=wordById(id),wr=state.vocab[id],isPathNew=ui.freshWordIds.has(id);return selectHeader+wordChrome+studyProgress+`<div class="row between" style="margin:0 0 13px"><span class="lesson-badge">${isPathNew?'按顺序学习':'到期复习'} · ${esc(w.level)}</span><span class="small muted">待学 ${queue.length} 词</span></div>
<div class="flashcard fast-word-card"><span class="level">${esc(w.level)} · ${isPathNew?'Sequential':(wr?'Review':'New word')}</span><button class="textbtn" data-action="speak-word" style="position:absolute;top:16px;right:12px;display:flex;align-items:center;gap:4px">${icon('volume',18)} 发音</button><div class="fast-word-line"><div class="word">${esc(w.word)}</div><button class="fast-meaning-toggle" id="fastMeaningToggle" type="button" data-action="flip-word" aria-label="${ui.flip?'隐藏中文释义':'显示中文释义'}" aria-pressed="${ui.flip?'true':'false'}" aria-controls="fastWordAnswer" title="${ui.flip?'隐藏中文和例句':'查看中文和例句'}">${icon(ui.flip?'eyeOff':'eye',21)}</button></div><div class="phonetic">${esc(w.phonetic||'Listen · Repeat · Recall')}</div><div id="fastWordAnswer" class="fast-word-answer" ${ui.flip?'':'hidden'}><div class="translation">${esc(w.zh||'暂无中文释义')}</div>${w.example?`<div class="example">${esc(w.example)}</div>`:''}</div><div class="hint fast-word-hint" id="fastWordHint" ${ui.flip?'hidden':''}>点击眼睛查看释义，也可直接判断会或不会</div></div>
<div class="sp14"></div><div class="grade-grid fast-grade-grid">${[['unknown','不会','10分钟后加强'],['known','会','FSRS智能安排']].map(([k,t,s])=>`<button class="grade" data-grade="${k}">${t}<small>${s}</small></button>`).join('')}</div>
<div class="sp14"></div>${renderWordStats()}<div class="sp14"></div><div class="row"><button class="btn ghost full" data-action="open-library">查询词库</button><button class="btn ghost full" data-action="open-import">+ 导入个人词库</button></div><div class="sp14"></div><button class="btn soft full" data-action="book-quiz-start">随机30题 · 测测这本词书的掌握率 ${icon('arrow',16)}</button><div class="note">只需选择「不会 / 会」。默认单词都视为会，只有你明确点「不会」才进入生词本；今日到期完全按 FSRS-6 的 dueAt 智能推送，阅读点词和听写漏词也统一进入这一套复习流程。</div>`}

// Two independent choices: learning layout and the persistent reveal preference.
// The small eye button only overrides the CURRENT card; answering clears the override.
function wordStudyMode(){return 'list'}
function wordDisplayMode(){return 'both'}
function effectiveWordMeaning(){return ui.flipOverride===null?wordDisplayMode()==='both':ui.flipOverride}
function renderWordChrome(){const mode=wordStudyMode(),meaning=wordDisplayMode();return `<div class="pipi-mode-bar"><div class="pipi-mode-switch" role="group" aria-label="背词方式"><button data-action="word-mode-card" class="${mode==='card'?'selected':''}" aria-pressed="${mode==='card'}">单卡背词</button><button data-action="word-mode-list" class="${mode==='list'?'selected':''}" aria-pressed="${mode==='list'}">列表速背</button></div><div class="pipi-mode-switch" role="group" aria-label="释义显示"><button data-action="word-display-english" class="${meaning==='english'?'selected':''}" aria-pressed="${meaning==='english'}">只看英文</button><button data-action="word-display-both" class="${meaning==='both'?'selected':''}" aria-pressed="${meaning==='both'}">中英对照</button></div></div>`}
// V5.10.5 repair: stable append-only mobile reader. No fixed-height virtual
// placeholders, no programmatic scrolling and no live replacement of reading rows.
// A word is learned only when its DOM row actually disappears ABOVE the viewport
// after a genuine user downward gesture. The next visit starts at that word index.
function wordListProgress(book=activeBook()){
 const p=state.wordListProgress?.[book];
 return {next:Math.max(0,Math.floor(Number(p?.next)||0)),updatedAt:p?.updatedAt||''};
}
function wordListData(){
 const book=activeBook(),raw=book==='basic'?words:SprintBooks.get(book);
 const tag=[book,raw.length,(state.custom||[]).length].join('|');
 if(ui.listBook!==tag){ui.listRows=(book==='basic'?raw.concat(state.custom||[]):raw);ui.listBook=tag;ui.listStart=-1}
 return ui.listRows;
}
function renderWordList(){
 const rows=wordListData(),next=Math.min(rows.length,wordListProgress().next);
 return `<div class="pipi-list-stats" role="status"><span>已滑过 <b id="pipiListKnown">${next.toLocaleString('zh-CN')}</b> 词</span><span id="pipiListRange">${next<rows.length?'接着学第 '+(next+1).toLocaleString('zh-CN')+' 词':'本轮已看完'} / ${rows.length.toLocaleString('zh-CN')}</span></div><p class="pipi-list-note">向下滑过＝会了 · 点「不会」加入生词本</p><div id="pipiVirtualList" aria-label="上下滑动学习英文单词"><div id="pipiVirtualRows"></div><div id="pipiListMore" aria-hidden="true"></div></div>`;
}
const phoneticCache=new Map();
let lastListMark=null;
function virtualWordRow(w,i){
 const id=w.id,old=state.mistakes?.[errorKey('vocab',id,0)],already=!!old&&old.status!=='mastered';
 const phonetic=w.phonetic||phoneticCache.get(id)||'';
 return `<div class="pipi-list-row" data-row-index="${i}" data-word-id="${esc(id)}"><span class="pipi-list-num">${i+1}</span><div class="pipi-list-content"><div class="pipi-list-word"><span>${esc(w.word||'')}</span><button data-action="list-say" data-word-id="${esc(id)}" aria-label="朗读 ${esc(w.word||'')}">${icon('volume',18)}</button></div><div class="pipi-list-phonetic">${esc(phonetic)}</div><button class="pipi-list-meaning" data-action="list-details" data-word-id="${esc(id)}" aria-label="查看 ${esc(w.word||'')} 完整中文释义">${esc(w.zh||'暂无中文释义')}</button></div><button class="pipi-list-unknown ${already?'is-unknown':''}" data-action="list-unknown" data-word-id="${esc(id)}" aria-pressed="${already}">${already?'✓ 已收录':'＋ 不会'}</button></div>`;
}
let listRAF=0,listSaveTimer=0,listRestoreInProgress=false,listUserIntentAt=0,listLastScrollTop=0,listProgressDirty=false;
let listRenderedUntil=0,listCrossingIndex=0,listUserScrollDirection=0;
function flushWordListProgress(){
 clearTimeout(listSaveTimer);listSaveTimer=0;
 if(!listProgressDirty)return;
 // 滑动只更新阅读进度，不写入复习队列；离开页面时保存进度。
 if(save(true))listProgressDirty=false;
}
function updateWordListProgress(passedIndex,rowsLength){
 if(listRestoreInProgress||!rowsLength||Date.now()-listUserIntentAt>5000)return;
 const old=wordListProgress().next;
 const next=Math.max(old,Math.min(rowsLength,Math.floor(passedIndex)));
 if(next<=old)return;
 state.wordListProgress=state.wordListProgress||{};
 state.wordListProgress[activeBook()]={next,updatedAt:new Date().toISOString()};
 const today=dateKey();state.wordListDaily=state.wordListDaily||{};
 state.wordListDaily[today]=(Number(state.wordListDaily[today])||0)+(next-old);
 state.activity[today]=(Number(state.activity[today])||0)+(next-old);
 // 列表速背的约定：滑过默认为会，只推进浏览游标；绝不创建 FSRS / 生词本记录。
 // 只有明确点击「不会」才调用 listMarkUnknown() -> upsertMistake()。
 // 保留独立的今日滑过数量，不把浏览次数冒充 FSRS 复习次数。
 listProgressDirty=true;
 const counter=document.getElementById('pipiListKnown');if(counter)counter.textContent=next.toLocaleString('zh-CN');
 const range=document.getElementById('pipiListRange');if(range)range.textContent=`${next<rowsLength?'接着学第 '+(next+1).toLocaleString('zh-CN')+' 词':'本轮已看完'} / ${rowsLength.toLocaleString('zh-CN')}`;
 clearTimeout(listSaveTimer);listSaveTimer=setTimeout(flushWordListProgress,550);
}
function appendWordListRows(){
 const box=document.getElementById('pipiVirtualRows');if(!box)return;
 const rows=wordListData(),end=Math.min(rows.length,listRenderedUntil+40);
 if(end<=listRenderedUntil)return;
 // insertAdjacentHTML never replaces a row already visible to the user.
 box.insertAdjacentHTML('beforeend',rows.slice(listRenderedUntil,end).map((w,i)=>virtualWordRow(w,listRenderedUntil+i)).join(''));
 listRenderedUntil=end;hydrateVisiblePhonetics();
}
function mountVirtualWordList(){
 const viewport=document.getElementById('viewport'),elem=document.getElementById('pipiVirtualList');if(!elem)return;
 listRestoreInProgress=true;listUserIntentAt=0;listUserScrollDirection=0;
 const rows=wordListData(),next=Math.min(rows.length,wordListProgress().next);
 listRenderedUntil=next;listCrossingIndex=next;
 // Restore by starting the actual list with NEXT NEW WORD, not seeking across
 // hundreds of placeholder rows. Never issue viewport.scrollTo()/scrollTop here.
 appendWordListRows();listLastScrollTop=viewport.scrollTop;
 requestAnimationFrame(()=>{listRestoreInProgress=false;listLastScrollTop=viewport.scrollTop});
}
function drawVirtualWordList(){
 const viewport=document.getElementById('viewport'),elem=document.getElementById('pipiVirtualList');
 if(!elem||ui.page!=='train'||!ui.bookStudyOpen||wordStudyMode()!=='list')return;
 const delta=viewport.scrollTop-listLastScrollTop;
 listLastScrollTop=viewport.scrollTop;
 // Only genuine forward user scroll qualifies; DOM additions or programmatic
 // scroll position changes without a gesture cannot mark a word learned.
 const gesture=Date.now()-listUserIntentAt<=5000&&!listRestoreInProgress;
 if(delta>0.5&&gesture)listUserScrollDirection=1;
 else if(delta< -0.5)listUserScrollDirection=-1;
 const rows=wordListData(),boundary=viewport.getBoundingClientRect().top+1;
 if(gesture&&listUserScrollDirection===1&&delta>0){
  const container=document.getElementById('pipiVirtualRows');
  while(listCrossingIndex<listRenderedUntil){
   const item=container?.querySelector(`[data-row-index="${listCrossingIndex}"]`);
   if(!item||item.getBoundingClientRect().bottom>boundary)break;
   listCrossingIndex++;
  }
  updateWordListProgress(listCrossingIndex,rows.length);
 }
 // Append before reaching the end so ordinary mobile flicks never hit a blank area.
 if(listRenderedUntil<rows.length){
  const bottom=elem.getBoundingClientRect().bottom,screen=viewport.getBoundingClientRect().bottom;
  if(bottom<screen+Math.max(900,viewport.clientHeight*2))appendWordListRows();
 }
 hydrateVisiblePhonetics();
}
function hydrateVisiblePhonetics(){if(!window.SprintECDICT?.lookup)return;const visible=[...document.querySelectorAll('#pipiVirtualRows .pipi-list-row')];const top=document.getElementById('viewport')?.getBoundingClientRect();let queries=0;for(const row of visible){if(queries>=12)break;const box=row.getBoundingClientRect();if(top&&(box.bottom<top.top-80||box.top>top.bottom+100))continue;const id=row.dataset.wordId,el=row.querySelector('.pipi-list-phonetic');if(!id||!el||el.textContent||!wordById(id)?.word)continue;if(phoneticCache.has(id)){el.textContent=phoneticCache.get(id)||'';continue}queries++;const word=wordById(id).word;window.SprintECDICT.lookup(word).then(result=>{const val=result?.phonetic?'/'+result.phonetic+'/':'';phoneticCache.set(id,val);if(row.isConnected&&row.dataset.wordId===id)el.textContent=val}).catch(()=>{phoneticCache.set(id,'')})}}
function listMarkUnknown(id,button){
 if(!id||!wordById(id))return;
 const key=errorKey('vocab',id,0),old=state.mistakes?.[key];
 if(old?.status==='pending'){
   if(lastListMark?.id===id && Date.now()-lastListMark.at<8000){
     const record=lastListMark;
     if(record.previousMistake===null)delete state.mistakes[key];else state.mistakes[key]=record.previousMistake;
     if(record.previousVocab===null)delete state.vocab[id];else state.vocab[id]=record.previousVocab;
     if(record.eventId&&state.v5?.events)state.v5.events=state.v5.events.filter(e=>e.id!==record.eventId);
     if(state.mistakeEvents?.[record.mistakeEventIndex]?.id===key&&state.mistakeEvents[record.mistakeEventIndex]?.at===record.mistakeEventAt)state.mistakeEvents.splice(record.mistakeEventIndex,1);
     lastListMark=null;
     if(!save(true)){toast('撤销保存失败，请先导出备份');return}
     if(button){button.textContent='＋ 不会';button.classList.remove('is-unknown');button.setAttribute('aria-pressed','false')}
     toast('已撤销此次误标');return;
   }
   toast('这个词已在生词本中');return;
 }
 const previous=JSON.stringify(state),previousMistake=old?JSON.parse(JSON.stringify(old)):null,previousVocab=state.vocab[id]?JSON.parse(JSON.stringify(state.vocab[id])):null;
 upsertMistake('vocab',id,0,'列表浏览：标记不会',{source:'列表速背',bookId:activeBook()});
 const event=PipiV5.addEvent(state,{type:'list_word_saved',wordId:id,bookId:activeBook()});
 if(!save(true)){state=JSON.parse(previous);return}
 const last=state.v5?.events?.at(-1);lastListMark={id,key,previousMistake,previousVocab,at:Date.now(),eventId:last?.id,mistakeEventIndex:state.mistakeEvents.length-1,mistakeEventAt:state.mistakeEvents.at(-1)?.at};
 if(button){button.textContent='↶ 撤销';button.classList.add('is-unknown');button.setAttribute('aria-pressed','true')}
 toast('已加入生词本，8秒内再点可撤销');
 setTimeout(()=>{if(lastListMark?.id===id&&Date.now()-lastListMark.at>=8000){lastListMark=null;if(button?.isConnected){button.textContent='✓ 已收录'}}},8200);
}
function listShowDetails(id){const w=wordById(id);if(!w)return;ui.dialog=`<div class="sheet-header"><div class="sheet-title">完整单词释义</div><button class="close" data-action="close-dialog">✕</button></div><h2 style="overflow-wrap:anywhere">${esc(w.word||'')}</h2><p class="small muted">${esc(w.phonetic||phoneticCache.get(id)||'')}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8">${esc(w.zh||'暂无中文释义')}</p>${w.example?`<p class="micro" style="white-space:pre-wrap">${esc(w.example)}</p>`:''}<button class="btn soft full" data-action="list-say" data-word-id="${esc(id)}">播放发音</button>`;renderDialog()}

const wordViewport=document.getElementById('viewport');
function wordListUserGesture(){if(ui.page==='train'&&ui.bookStudyOpen&&wordStudyMode()==='list'&&!listRestoreInProgress)listUserIntentAt=Date.now()}
wordViewport.addEventListener('touchstart',wordListUserGesture,{passive:true});
wordViewport.addEventListener('touchmove',wordListUserGesture,{passive:true});
wordViewport.addEventListener('wheel',wordListUserGesture,{passive:true});
wordViewport.addEventListener('pointerdown',wordListUserGesture,{passive:true});
window.addEventListener?.('pagehide',flushWordListProgress);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushWordListProgress()});
wordViewport.addEventListener('keydown',e=>{if(['ArrowDown','PageDown','End',' '].includes(e.key))wordListUserGesture()});
wordViewport.addEventListener('scroll',()=>{if(listRAF)return;listRAF=requestAnimationFrame(()=>{listRAF=0;drawVirtualWordList()})},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushWordListProgress()});
window.addEventListener?.('pagehide',flushWordListProgress);

function renderWordStats(){const ids=new Set(allWords().map(w=>w.id));const dueIdsSet=new Set(PipiV5.dueIds(state));const unknownCount=Object.values(state.mistakes||{}).filter(m=>WORD_KINDS.has(m.kind)&&m.status!=='mastered').reduce((set,m)=>(set.add(m.unit),set),new Set()).size;const studiedIds=Object.keys(state.vocab||{}).filter(id=>ids.has(id));const today=state.dayReviews[dateKey()]||{reviews:0,new:0};return `<div class="card"><div class="row between"><span class="small strong">词汇学习记录</span><span class="lesson-badge">今日已复习 ${today.reviews||0}</span></div><div class="sp14"></div><div class="row between"><div><div class="stat-big">${studiedIds.length}</div><div class="micro">累计进入复习</div></div><div><div class="stat-big">${unknownCount}</div><div class="micro">当前生词本（含阅读）</div></div><div><div class="stat-big">${studiedIds.filter(id=>dueIdsSet.has(id)).length}</div><div class="micro">当前今日到期</div></div></div></div>`}
function toggleFastWordMeaning(){
 if(!ui.wordId||ui.page!=='train'||!ui.bookStudyOpen)return;
 const toggle=document.getElementById('fastMeaningToggle');
 const answer=document.getElementById('fastWordAnswer');
 const hint=document.getElementById('fastWordHint');
 if(!toggle||!answer||!hint)return;
 ui.flipOverride=!effectiveWordMeaning();ui.flip=ui.flipOverride;
 answer.hidden=!ui.flip;
 hint.hidden=ui.flip;
 toggle.setAttribute('aria-pressed',String(ui.flip));
 toggle.setAttribute('aria-label',ui.flip?'隐藏中文释义':'显示中文释义');
 toggle.title=ui.flip?'隐藏中文和例句':'查看中文和例句';
 toggle.innerHTML=icon(ui.flip?'eyeOff':'eye',21);
}
function gradeWord(grade){
 if(!ui.wordId||ui.gradeBusy)return;const id=ui.wordId,w=wordById(id);if(!w)return;ui.gradeBusy=true;
 try{const known=['known','good','easy'].includes(grade),pathCtx=ui.wordPathContext,inSequence=!!(ui.freshWordIds?.has(id)&&pathCtx?.rows[pathCtx.path.position]?.id===id),snapshot=PipiV5.beforeGrade(state,id,inSequence?pathCtx:null),oldJSON=JSON.stringify(state),previouslyNew=!state.vocab[id]?.lastReviewed&&!state.vocab[id]?.last;
 if(known){healMistake('vocab',id,0)}else upsertMistake('vocab',id,0,'单词复习：不会',{source:'词卡复习'});
 const memo=state.vocab[id],d=dateKey();state.dayReviews[d]||={reviews:0,new:0};state.dayReviews[d].reviews++;if(previouslyNew)state.dayReviews[d].new++;
 if(inSequence&&!SprintBookPath.advance(state,pathCtx,id,d)){state=JSON.parse(oldJSON);toast('学习游标校验失败，已恢复');return}
 state.activity[d]=(state.activity[d]||0)+1;if(state.dayReviews[d].reviews>=8){state.dayTasks[d]||={};state.dayTasks[d].words=true}
 PipiV5.addEvent(state,{type:'word_answered',wordId:id,bookId:activeBook(),mode:inSequence?'new':'review',verdict:known?'good':'again'});
 if(!save(true)){state=JSON.parse(oldJSON);toast('存储空间不足，此次作答未保存');return}
 ui.lastGrade={id,word:w.word,at:Date.now(),snapshot,afterJSON:JSON.stringify(state)};ui.wordId=null;ui.flip=false;render();const g=ui.lastGrade;setTimeout(()=>{if(ui.lastGrade===g)document.getElementById('pipiUndoBar')?.remove()},3000);
 toast(known?`已记住 · ${wordArchived(id)?'达到熟悉里程碑，仍会定期复习':('下次 '+dueLabel(memo))}`:'已保存「不会」，约10分钟后复习');
 }finally{ui.gradeBusy=false}
}
function nextLesson(key,arr){ui[key]=(ui[key]+1)%arr.length;if(key==='lesson'){ui.answers={};ui.transcript=false;ui.lessonSubmitted=false;ui.dictationIndex=0;ui.dictationResult=null}if(key==='reading'){ui.readingAnswers={};ui.readingSubmitted=false}render(true)}
function radioQ(q,i,prefix,answers,locked){const choice=answers[i];return `<div><div class="exercise-question">${i+1}. ${esc(q[0])}</div>${q[1].map((o,j)=>`<button class="answer-btn ${choice===j?'chosen':''} ${locked&&j===q[2]?'correct':''} ${locked&&choice===j&&j!==q[2]?'wrong':''}" ${locked?'disabled':''} data-${prefix}-answer="${i},${j}">${esc(String.fromCharCode(65+j))}. ${esc(o)}</button>`).join('')}${locked?`<div class="note" style="margin:6px 0 10px">解析：${esc(q[3])}</div>`:''}</div>`}
function renderListening(){const lesson=listening[ui.lesson],a=ui.answers;const sentences=(lesson.script.match(/[^.!?]+[.!?]+/g)||[lesson.script]).map(x=>x.trim());const sentence=sentences[ui.dictationIndex%sentences.length];const locked=!!ui.lessonSubmitted;return topicPicker('listen')+`<div class="row between" style="margin:2px 0 14px"><span class="lesson-badge">精听练习 ${ui.lesson+1} / ${listening.length}</span><span class="small muted">${lesson.level}</span></div><div class="card" style="padding:20px"><div class="row between"><div><div class="eyebrow">LISTENING LAB</div><h2 class="section-title" style="margin-top:6px">${esc(lesson.title)}</h2></div><span style="color:#7367ed;background:#eeebff;border-radius:17px;padding:12px">${icon('headphones',26)}</span></div><p class="subtitle" style="margin:10px 0 16px">重点：${esc(lesson.focus)}</p>
<div style="background:#f5f4ff;border-radius:18px;padding:17px;text-align:center"><div class="wave" aria-hidden="true">${Array.from({length:21},()=>'<i></i>').join('')}</div><div class="row" style="justify-content:center;gap:8px;margin:13px 0 5px"><button class="btn" data-action="listen-play">${icon('play',18)} 播放全文</button><button class="btn soft" data-action="listen-stop">停止</button></div><div class="chiprow" style="justify-content:center;margin-top:12px">${[.85,1,1.15].map(v=>`<button class="chip ${ui.speechRate===v?'active':''}" data-rate="${v}">${v===.85?'慢速':v===1?'正常':'稍快'} ${v}×</button>`).join('')}</div></div>
<div class="sp14"></div><div class="row between"><span class="small strong">五步精听</span><span class="micro">盲听 → 复听 → 对照 → 跟读 → 作答</span></div><div class="stepper"><span class="active"></span><span class="active"></span><span class="${ui.transcript?'active':''}"></span><span class="${ui.transcript?'active':''}"></span><span class="${locked?'active':''}"></span></div>
<button class="btn ghost full" data-action="toggle-transcript">${ui.transcript?'收起':'查看'}原文 / 跟读文本 ${icon('book',15)}</button>${ui.transcript?`<div class="sp14"></div><div class="script-box">${esc(lesson.script)}</div><div class="sp8"></div><button class="textbtn" data-action="listen-play">🔊 跟读时再播放一次</button>`:''}</div>
<div class="section-head"><h2 class="section-title">逐句听写挑战</h2><span class="section-caption">第 ${ui.dictationIndex+1} / ${sentences.length} 句</span></div>
<div class="card"><p class="subtitle" style="margin-bottom:12px">听一小句并输入英文，再核对漏听的词。建议先不要打开原文。</p><div class="row"><button class="btn soft" data-action="dictation-play">${icon('volume',17)} 播放这一句</button><button class="btn ghost" data-action="dictation-next">下一句 ${icon('arrow',15)}</button></div><label class="field-label">写下你听到的英文</label><textarea id="dictationInput" class="textarea" style="min-height:80px" placeholder="Type what you hear..."></textarea>${ui.dictationResult?`<div class="sp14"></div><div class="info-box green"><b>文本匹配率 ${ui.dictationResult.score}%</b>（编辑距离参考，不代表雅思分数）<br>你的输入：${esc(ui.dictationResult.answer)}<br>原句：${esc(sentence)}</div>`:''}<div class="sp14"></div><button class="btn ghost full" data-action="dictation-check">核对听写</button></div>
<div class="section-head"><h2 class="section-title">理解练习</h2><span class="section-caption">${Object.keys(a).length}/${lesson.qs.length} 已作答</span></div><div class="card">${lesson.qs.map((q,i)=>radioQ(q,i,'listen',a,locked)).join('')}<div class="sp14"></div>${locked?`<div class="info-box green">本组正确 ${ui.lessonCorrect}/${lesson.qs.length} 题，建议回听出错的句子，并复述关键信息。</div><div class="sp14"></div><button class="btn full" data-action="next-listen">下一组训练 ${icon('arrow',16)}</button>`:`<button class="btn full" data-action="submit-listen" ${Object.keys(a).length!==lesson.qs.length?'disabled':''}>提交答案 · 查看解析</button>`}</div><div class="sp14"></div>${renderResource(resourceLinks[3])}<div class="note">站内练习音频由浏览器语音合成，不能替代真人录音的口音、弱读和语速。每周仍应使用官方真实听力材料。</div>`}
function wordMatch(ref,guess){
 const norm=x=>(x.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[0-9]+/g)||[]);
 const a=norm(ref),b=norm(guess);if(!a.length)return 0;
 const prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let before=prev[0];prev[0]=i;for(let j=1;j<=b.length;j++){const old=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,before+(a[i-1]===b[j-1]?0:1));before=old}}
 return clamp(1-prev[b.length]/a.length,0,1);
}
function submitListen(){const lesson=listening[ui.lesson];if(Object.keys(ui.answers).length!==lesson.qs.length)return;const correct=lesson.qs.filter((q,i)=>ui.answers[i]===q[2]).length;ui.lessonCorrect=correct;ui.lessonSubmitted=true;lesson.qs.forEach((q,i)=>ui.answers[i]===q[2]?healMistake('listen',ui.lesson,i):upsertMistake('listen',ui.lesson,i,ui.answers[i]));state.listenHistory.push({date:dateKey(),lesson:ui.lesson,correct,total:lesson.qs.length});markActivity('listen');render();toast(`听力练习完成：${correct}/${lesson.qs.length}`)}
function renderSpeaking(){const s=speaking[ui.speak];const records=state.speakingHistory.length;return speakingPicker()+`<div class="row between"><span class="lesson-badge">Speaking · Part ${s.part}</span><span class="small muted">累计训练 ${records} 次</span></div><div class="sp14"></div><div class="card"><div class="eyebrow">TODAY'S SPEAKING PROMPT</div><h2 style="font-size:20px;line-height:1.6;margin:10px 0">${esc(s.prompt)}</h2><span class="chip">${esc(s.title)}</span><div class="sp14"></div><div class="info-box">${s.hints.map((h,i)=>`${i+1}. ${esc(h)}`).join('<br>')}</div></div>
<div class="section-head"><h2 class="section-title">录音练口语</h2><span class="section-caption">先说出来，再复盘</span></div><div class="card"><div class="row between"><div><span class="small strong">${s.part===2?'建议准备1分钟，表达1–2分钟':'建议表达30–90秒'}</span><p class="micro">录音只在当前页面本地播放，不上传服务器。</p></div><span class="lesson-badge" id="recordTime">${String(Math.floor(ui.recordSeconds/60)).padStart(2,'0')}:${String(ui.recordSeconds%60).padStart(2,'0')}</span></div>
<div class="sp14"></div><div class="row" style="justify-content:center"><button class="btn ${ui.recording?'ghost':''}" data-action="${ui.recording?'stop-record':'start-record'}">${icon('mic',19)} ${ui.recording?'结束录音':'开始录音'}</button><button class="btn soft" data-action="speaking-say">${icon('volume',16)} 听问题</button></div>
${ui.recording?`<div class="recording" style="justify-content:center;margin-top:15px"><i></i> 正在录制，请自然回答问题</div>`:''}${ui.audioUrl?`<div class="sp14"></div><audio controls style="width:100%" src="${ui.audioUrl}"></audio><p class="micro">此录音是临时文件，刷新或关闭页面后可能丢失；需要保存可使用下方下载按钮。</p><button class="btn ghost sm" data-action="download-audio">${icon('download',14)} 下载本次录音</button>`:''}</div>
<div class="section-head"><h2 class="section-title">按雅思维度自我复盘</h2></div><div class="card"><p class="subtitle">以下项目是练习清单，不是自动雅思评分。</p>${[['fluency','流利度：是否能持续表达、减少长停顿'],['vocab','词汇：是否能用恰当的替换表达'],['grammar','语法：是否使用多种句式且准确'],['pron','发音：是否清晰易懂、重音自然']].map(([k,t])=>`<label class="rubric"><input type="checkbox" data-rubric="${k}" ${ui['r_'+k]?'checked':''}>${t}</label>`).join('')}<div class="sp14"></div><button class="btn full" data-action="save-speaking">保存本次口语训练记录</button><div class="sp8"></div><button class="btn ghost full" data-action="next-speak">换一个话题 ${icon('arrow',16)}</button></div><div class="note">录音功能需要浏览器允许麦克风，并通常要求 HTTPS 或 localhost。未获得麦克风权限时仍可通过自评完成练习。</div>`}
function renderReading(){const r=readings[ui.reading],a=ui.readingAnswers,locked=ui.readingSubmitted;return topicPicker('read')+`<div class="row between"><span class="lesson-badge">阅读练习 ${ui.reading+1} / ${readings.length}</span><span class="small muted">难度 ${r.level}</span></div><div class="sp14"></div><div class="card"><div class="eyebrow">READING PRACTICE</div><h2 class="section-title" style="margin:9px 0 15px">${esc(r.title)}</h2><div class="script-box" style="background:#fafbfe">${esc(r.text)}</div></div><div class="section-head"><h2 class="section-title">阅读理解</h2><span class="section-caption">${Object.keys(a).length}/${r.qs.length}</span></div><div class="card">${r.qs.map((q,i)=>radioQ(q,i,'read',a,locked)).join('')}<div class="sp14"></div>${locked?`<div class="info-box green">本组正确 ${ui.readingCorrect}/${r.qs.length} 题。错题建议回到段落定位关键词与同义替换。</div><div class="sp14"></div><button class="btn full" data-action="next-read">下一篇阅读 ${icon('arrow',16)}</button>`:`<button class="btn full" data-action="submit-read" ${Object.keys(a).length!==r.qs.length?'disabled':''}>提交答案 · 查看解析</button>`}</div><div class="note">站内为短篇原创专项训练，不等同于雅思正式阅读3篇、60分钟、40道题。建议每周使用官方完整样卷练时间分配。</div>`}
function submitRead(){const r=readings[ui.reading];if(Object.keys(ui.readingAnswers).length!==r.qs.length)return;const correct=r.qs.filter((q,i)=>ui.readingAnswers[i]===q[2]).length;ui.readingCorrect=correct;ui.readingSubmitted=true;r.qs.forEach((q,i)=>ui.readingAnswers[i]===q[2]?healMistake('read',ui.reading,i):upsertMistake('read',ui.reading,i,ui.readingAnswers[i]));state.readHistory.push({date:dateKey(),reading:ui.reading,correct,total:r.qs.length});markActivity('read');render();toast(`阅读练习完成：${correct}/${r.qs.length}`)}
function eligibleWriting(){return writing.map((w,i)=>({...w,index:i})).filter(w=>w.type==='task2'||w.type===(state.exam==='academic'?'academic1':'general1'))}
function wordsOf(s){return (s||'').trim().match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]}
function renderWriting(){const items=eligibleWriting();let w=writing[ui.write];if(!items.some(x=>x.index===ui.write)){ui.write=items[0].index;w=writing[ui.write]}const draft=state.writingDrafts[ui.write]||'',count=wordsOf(draft).length;return writingPicker()+`<div class="row between"><span class="lesson-badge">Writing · ${w.type==='task2'?'Task 2':w.type==='academic1'?'Academic Task 1':'General Task 1'}</span><button class="chip" data-action="next-writing">换题 ${icon('refresh',13)}</button></div><div class="sp14"></div><div class="card"><h2 class="section-title" style="margin-bottom:10px">${esc(w.title)}</h2><div class="script-box" style="background:#fafbff">${esc(w.prompt)}</div><div class="sp14"></div><div class="info-box">${esc(w.tips)}</div></div><div class="section-head"><h2 class="section-title">我的作文</h2><span class="section-caption">实时自动保存</span></div><div class="card"><div class="row between"><span class="small muted">建议最低 ${w.min} 词</span><span class="lesson-badge" id="writing-count">${count} words</span></div><div class="sp14"></div><textarea id="writingInput" class="textarea" style="min-height:285px" aria-label="输入英语作文" placeholder="Write your essay in English...\n\nStart with your main idea, then support it with clear reasons and examples.">${esc(draft)}</textarea><div class="sp8"></div><div class="meter"><div id="writing-meter" style="width:${clamp(count/w.min*100,0,100)}%"></div></div><p class="micro">字数仅做形式提示，达到字数不代表写作符合7分标准。</p><div class="divider"></div><span class="small strong">自检清单</span>${[['task','回答了题目的全部要求'],['coherence','段落逻辑清楚，有中心句与衔接'],['lexical','用词准确，避免不必要的复杂词'],['grammar','语法、标点、时态基本准确']].map(([k,t])=>`<label class="rubric"><input type="checkbox" data-write-rubric="${k}" ${ui['w_'+k]?'checked':''}>${t}</label>`).join('')}<button class="btn full" data-action="submit-writing">保存作文及训练记录</button></div><div class="sp14"></div>${renderResource(resourceLinks[4])}<div class="note">作文只提供保存、字数和结构自检；没有人工或真正的模型评分，不能自动预测雅思写作分数。</div>`}
function renderPlan(){const d=dayNumber(),phase=currentPhase();const daylist=Array.from({length:14},(_,i)=>daysFrom(dateKey(),i-6));return `<div class="kicker">03 / YOUR 180-DAY ROADMAP</div><h1 class="title">你的半年冲刺路线</h1><p class="subtitle">目标7分需要稳定的四科能力。先诊断，再制定每周重点，持续用真实模考校准。</p>
<div class="sp20"></div><div class="card"><div class="row between"><div><div class="eyebrow">当前计划</div><h2 style="font-size:25px;letter-spacing:-.6px;margin:6px 0">Day ${d} <span style="font-size:14px;color:#abb3c3">/ 180</span></h2><p class="small muted" style="margin:0">预计结束：${fmtDate(daysFrom(state.start,180))} · 还剩 ${daysLeft()} 天</p></div><div class="circle-progress" style="--p:${clamp(Math.round((180-daysLeft())/180*100),0,100)}%"><span>${clamp(Math.round((180-daysLeft())/180*100),0,100)}%</span></div></div><div class="sp14"></div>${mkProgress((180-daysLeft())/180*100)}</div>
<div class="section-head"><h2 class="section-title">四个学习阶段</h2></div>${phaseDefs.map(([title,range,desc],i)=>`<div class="phase ${i===phase?'current':''}"><div class="phase-left">${i<phase?'已过阶段':i===phase?'进行中':'未开始'}</div><strong><span class="timeline-dot"></span>${title}</strong><div class="micro" style="margin:6px 0 0 17px">${range}</div><p style="margin-left:17px">${desc}</p></div>`).join('')}
<div class="section-head"><h2 class="section-title">本周具体训练目标</h2></div>${weeklyCard()}<div class="section-head"><h2 class="section-title">最近14天打卡</h2></div><div class="card"><div class="calendar">${daylist.map(date=>{const count=Object.values(state.dayTasks[date]||{}).filter(Boolean).length;const today=date===dateKey();return `<div class="calday ${today?'today':''} ${count>0?'done':''}"><div class="dw">${['日','一','二','三','四','五','六'][new Date(date+'T12:00:00').getDay()]}</div><div class="dt">${Number(date.slice(-2))}</div><div class="micro">${count?`${count}/5`:'—'}</div></div>`}).join('')}</div><div class="sp14"></div><div class="row between"><span class="small muted">绿色：当天完成过训练</span><span class="small strong">累计活跃 ${totalActiveDays()} 天</span></div></div>
<div class="section-head"><h2 class="section-title">今日建议时间分配</h2></div><div class="card">${taskDefs.map(([k,ic,name])=>`<div class="row between" style="padding:7px 0"><span class="small muted">${name}</span><b class="small">${dailyAlloc()[k]} 分钟</b></div>`).join('')}<p class="micro">时间按当前阶段及词汇、听辨筛查结果调整；只是建议，不会自动记录为实际学习时长。</p></div><div class="section-head"><h2 class="section-title">建议每周节奏</h2></div><div class="card"><div class="timeline-note"><b>周一至周五：</b>每日词汇 + 精听 + 口语，阅读写作穿插。<br><b>周六：</b>完成官方限时样卷，记录听力和阅读原始分。<br><b>周日：</b>复盘错题，检查口语录音和作文，调整下一周重点。</div><div class="sp14"></div><button class="btn soft full" data-action="open-mock">记录本周模考成绩</button></div>
<div class="section-head" id="resources"><h2 class="section-title">经过核实的官方资源</h2></div>${resourceLinks.filter(r=>state.exam==='academic'?r.cat!=='培训类':true).map(renderResource).join('')}
<div class="note">计划从第一次打开本工具的日期开始计时。可以在设置中修改启动日期和每天学习时长。某些官方链接需要网络。</div>`}
const sumHist=(hist,key)=>hist.reduce((s,v)=>s+(v[key]||0),0);
function sparkLine(vals){if(!vals.length)return `<div class="empty" style="padding:17px">还没有模考分数，完成第一次官方样卷后展示趋势。</div>`;const n=vals.length;const xs=vals.map((_,i)=>n===1?160:16+i*(300/(n-1)));const ys=vals.map(v=>115-(clamp(v,0,9)/9)*105);const points=xs.map((x,i)=>`${x},${ys[i]}`).join(' ');return `<svg class="chart" viewBox="0 0 332 140" role="img" aria-label="最近模考总分走势">${[3,5,7,9].map(v=>`<line x1="8" y1="${115-v/9*105}" x2="325" y2="${115-v/9*105}" stroke="#e8ebf5" stroke-dasharray="4 5"/><text x="8" y="${110-v/9*105}" font-size="9" fill="#a0acc0">${v}</text>`).join('')}<polyline points="${points}" fill="none" stroke="#7666e9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="4.5" fill="#fff" stroke="#7567e8" stroke-width="2"/>`).join('')}</svg>`}
function pipiUpdateCacheStatus(){
 try{const native=window.SprintAndroid;if(!native||!native.getLibraryVoiceCacheStatus)return;
 const data=JSON.parse(native.getLibraryVoiceCacheStatus());
 const navButton=document.querySelector('#bottomNav [data-page="me"]');navButton?.classList.toggle('pipi-cache-running',data.state==='running');
 const el=document.getElementById('pipiCacheGlobalStatus');if(!el)return;
 const done=Number(data.done)||0,total=Number(data.total)||0;
 el.textContent=data.state==='running'?'生成中 '+done+' / '+total+' 段 ›':data.state==='paused'?'已暂停 · 继续缓存 ›':data.state==='finished'?'已缓存完成 ›':'查看当前进度 ›';
 }catch(_){ }
}
setInterval(pipiUpdateCacheStatus,12000);
function renderMe(){const v=PipiV5.ensure(state),total=Object.keys(state.vocab||{}).length,due=PipiV5.dueIds(state).length;
 return `<div class="kicker">05 / TOOL CENTER</div><h1 class="title">学习工具</h1><p class="subtitle">离线词典、整书语音缓存、数据备份与学习设置，集中在这里。</p><a class="pipi-cache-entry" href="./voice-cache.html"><span>♫ 后台语音缓存</span><strong id="pipiCacheGlobalStatus">查看当前进度 ›</strong></a>
 <div class="v5-me-stat"><div><b>${total}</b><span>累计接触单词</span></div><div><b>${due}</b><span>待复习单词</span></div><div><b>${streak()}</b><span>连续学习天数</span></div></div>
 <div class="v5-menu-list"><button data-page="review">↻ <span><b>我的生词与复习</b><small>全部词书与阅读生词统一复习</small></span>›</button><button data-page="metrics">▤ <span><b>完整学习数据</b><small>历史训练、连续天数与统计</small></span>›</button><button data-action="settings">⚙ <span><b>个人学习设置</b><small>保留原版雅思学习设置</small></span>›</button></div>
 <h2 class="v5-subtitle">离线数据管理</h2><div class="v5-menu-list"><a href="./backup.html">⇩ <span><b>导出 / 恢复学习记录</b><small>学习进度、FSRS、阅读书签备份</small></span>›</a><a href="./dictionary.html">▣ <span><b>离线英汉词典</b><small>ECDICT 本机查词</small></span>›</a></div>
 <h2 class="v5-subtitle">有声书工具</h2><div class="v5-menu-list"><a href="./voice-cache.html">♫ <span><b>一键缓存全部原著语音</b><small>支持锁屏、通知栏进度与断点续存</small></span>›</a></div>
 <h2 class="v5-subtitle">更多工具</h2><div class="v5-menu-list"><button data-page="test">◇ <span><b>基础测评</b><small>保留历史测评数据</small></span>›</button><button data-page="plan">◷ <span><b>学习计划</b><small>原有180天计划仍可使用</small></span>›</button>${[['listen','听力'],['speak','口语'],['read','阅读练习'],['write','写作'],['sound','听辨']].map(([k,t])=>`<button data-go-train="${k}">◦ <span><b>${t}专项</b><small>旧版功能与记录保留</small></span>›</button>`).join('')}</div><p class="v5-version">皮皮 V${esc(window.PipiBuildVersion||'5.12.2')} · 本地离线版</p>`;
}
function renderOldMe(){const now=dateKey(),rev=Object.values(state.dayReviews).reduce((s,x)=>s+(x.reviews||0),0);const listened=sumHist(state.listenHistory,'correct'),ltotal=sumHist(state.listenHistory,'total'),read=sumHist(state.readHistory,'correct'),rtotal=sumHist(state.readHistory,'total');return `<div class="kicker">04 / MY LEARNING RECORD</div><h1 class="title">进步，有迹可循</h1><p class="subtitle">记录真实训练与模考，而不是虚构一个“系统预测雅思分数”。</p><div class="sp20"></div><div class="stat-grid"><div class="card"><div class="eyebrow">连续学习</div><div class="stat-big">${streak()} <span class="small muted">天</span></div><div class="micro">累计活跃 ${totalActiveDays()} 天</div></div><div class="card"><div class="eyebrow">间隔复习</div><div class="stat-big">${rev} <span class="small muted">次</span></div><div class="micro">已接触 ${Object.keys(state.vocab).length} 词</div></div><div class="card"><div class="eyebrow">听力站内题正确率</div><div class="stat-big">${ltotal?Math.round(listened/ltotal*100)+'%':'—'}</div><div class="micro">${listened}/${ltotal} 题（原创短练）</div></div><div class="card"><div class="eyebrow">阅读站内题正确率</div><div class="stat-big">${rtotal?Math.round(read/rtotal*100)+'%':'—'}</div><div class="micro">${read}/${rtotal} 题（原创短练）</div></div></div>
<div class="section-head"><h2 class="section-title">官方模考总分趋势</h2><button class="link-mini" data-action="open-mock">录入分数 +</button></div><div class="card"><div class="row between"><div><div class="eyebrow">LATEST PRACTICE</div><div class="stat-big">${state.mockHistory.length?state.mockHistory.at(-1).overall.toFixed(1):'—'} <span class="small muted">/ 9.0</span></div></div><span class="chip">目标 ${state.goal.toFixed(1)}</span></div>${sparkLine(state.mockHistory.slice(-8).map(x=>x.overall))}<p class="micro">只采用你主动录入的官方样卷／教师评分；自报分数不等同正式考试成绩。</p></div>
<div class="section-head"><h2 class="section-title">四项能力练习记录</h2></div><div class="card">${[['听力','listen',state.listenHistory.length],['口语','speak',state.speakingHistory.length],['阅读','read',state.readHistory.length],['写作','write',state.writingHistory?.length||0]].map(([title,kind,n])=>`<button class="task" data-go-train="${kind}"><span class="task-icon" style="background:#f0eeff;color:#6d62dc">${icon(({listen:'headphones',speak:'mic',read:'book',write:'edit'})[kind],19)}</span><span class="task-main"><strong>${title}训练</strong><span>${n} 次记录</span></span>${icon('chevron',18)}</button>`).join('')}</div>
<div class="section-head"><h2 class="section-title">数据与个人设置</h2></div><div class="card" style="padding:6px 13px"><button class="task" data-action="settings"><span class="task-icon" style="background:#edf0f7;color:#6d798d">${icon('gear',19)}</span><span class="task-main"><strong>学习计划设置</strong><span>考试类型、时长、起始日期</span></span>${icon('chevron',18)}</button><button class="task" data-action="export"><span class="task-icon" style="background:#edf9f4;color:#3b9578">${icon('download',19)}</span><span class="task-main"><strong>导出学习数据</strong><span>JSON文件可用于本机备份或迁移</span></span>${icon('chevron',18)}</button><button class="task" data-action="import-data"><span class="task-icon" style="background:#f4efff;color:#8c64dc">${icon('refresh',19)}</span><span class="task-main"><strong>恢复备份</strong><span>从已导出的JSON文件恢复</span></span>${icon('chevron',18)}</button></div>
<div class="note">数据默认只保存在当前设备、当前浏览器的本地存储中。清除浏览器数据可能导致记录丢失，请定期导出备份；没有账号与跨设备同步。</div>`}
function mockBand(n,type){n=clamp(Number(n),0,40);const thresholds=type==='listen'?[[39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[10,4]]:state.exam==='academic'?[[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4]]:[[40,9],[39,8.5],[37,8],[36,7.5],[34,7],[32,6.5],[30,6],[27,5.5],[23,5],[19,4.5],[15,4]];return thresholds.find(([min])=>n>=min)?.[1]??(n===0?0:n<=3?1.5:n<=6?2.5:3.5)}
function overallBand(bands){const v=bands.reduce((a,b)=>a+b,0)/4;return Math.round(v*2)/2} // IELTS .25 rounds up to next half band, .75 to next whole band.
function mockModal(){ui.dialog=`<div class="sheet-header"><div class="sheet-title">记录一次完整模考</div><button class="close" data-action="close-dialog">✕</button></div><p class="subtitle">听力和阅读录入40题中的正确数；写作与口语录入老师评定分数或正式模考分数。</p>
<label class="field-label">成绩来源</label><select class="select" id="mockSource"><option value="雅思官方样题">雅思官方样题</option><option value="教师批改 / 模考">教师批改 / 模考</option><option value="正式雅思考试">正式雅思考试</option></select>
<div class="row"><div class="flex1"><label class="field-label">听力正确数 / 40</label><input class="input" id="mockL" inputmode="numeric" type="number" min="0" max="40" placeholder="例如 30"/></div><div class="flex1"><label class="field-label">阅读正确数 / 40</label><input class="input" id="mockR" inputmode="numeric" type="number" min="0" max="40" placeholder="例如 30"/></div></div>
<div class="row"><div class="flex1"><label class="field-label">写作评分 0—9</label><input class="input" id="mockW" inputmode="decimal" type="number" min="0" max="9" step="0.5" placeholder="例如 6.0"/></div><div class="flex1"><label class="field-label">口语评分 0—9</label><input class="input" id="mockS" inputmode="decimal" type="number" min="0" max="9" step="0.5" placeholder="例如 6.5"/></div></div>
<div class="sp14"></div><div class="info-box orange">听力与阅读换算只是常见分数线的参考值，各卷可能不同。写作/口语必须有可信的外部评分，工具不会自行编造。</div><div class="sp14"></div><button class="btn full" data-action="save-mock">保存模考成绩</button>`;renderDialog()}
function settingsModal(){ui.dialog=`<div class="sheet-header"><div class="sheet-title">个性化学习设置</div><button class="close" data-action="close-dialog">✕</button></div><label class="field-label">考试目标分数</label><select id="settingGoal" class="select">${[6,6.5,7,7.5,8].map(x=>`<option value="${x}" ${state.goal===x?'selected':''}>IELTS ${x.toFixed(1)}</option>`).join('')}</select>
<label class="field-label">雅思考试类型</label><select id="settingExam" class="select"><option value="academic" ${state.exam==='academic'?'selected':''}>学术类 Academic (A)</option><option value="general" ${state.exam==='general'?'selected':''}>培训类 General Training (G)</option></select>
<label class="field-label">每天建议学习时间</label><select id="settingMinutes" class="select">${[45,60,90,120,150,180].map(x=>`<option value="${x}" ${state.dailyMinutes===x?'selected':''}>${x} 分钟</option>`).join('')}</select>
<label class="field-label">180天计划起始日期</label><input type="date" class="input" id="settingStart" value="${state.start}" max="${dateKey()}"/>
<div class="pipi-tts-settings-row"><div><strong>离线英文发音</strong><p class="micro">词书与文章共用语速</p></div><button type="button" class="btn ghost sm" data-voice-rate data-tts-control="1" aria-label="切换英文发音语速">语速 1×</button></div>
<div class="sp20"></div><button class="btn full" data-action="save-settings">保存学习计划</button><div class="sp14"></div><button class="btn ghost full" data-action="reset-data">清空本地学习数据</button><div class="note">清空数据无法恢复；如需保留请先导出JSON备份。</div>`;renderDialog()}
function importWordModal(){ui.dialog=`<div class="sheet-header"><div class="sheet-title">导入你的专属单词</div><button class="close" data-action="close-dialog">✕</button></div><p class="subtitle">按行粘贴：英文单词,中文意思,等级（A1/A2/B1/B2/C1）<br>支持从 Excel 或词表复制文本；等级可留空，默认 B1。</p><label class="field-label">每行一个词，最多一次500行</label><textarea id="wordsImport" class="textarea" style="height:180px" placeholder="resilient,有韧性的,B2\nanalytical,善于分析的,B2\nachievement,成就,B1"></textarea><div class="sp14"></div><button class="btn full" data-action="save-words">导入到我的词库</button><p class="micro">当前版本只接受逗号、Tab分隔的纯文本。请检查导入词义是否准确；可通过导出备份保存。</p>`;renderDialog()}
function speak(text,rate=1){if(window.PipiVoice){window.PipiVoice.speak(text,rate);return}if(window.SprintAndroid&&window.SprintAndroid.speak){window.SprintAndroid.speak(String(text||""));return;}if(!('speechSynthesis' in window)){toast('当前浏览器不支持英文语音合成');return}try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-GB';u.rate=rate;u.pitch=1;const voices=speechSynthesis.getVoices();u.voice=voices.find(v=>v.lang.toLowerCase().startsWith('en-gb'))||voices.find(v=>v.lang.toLowerCase().startsWith('en'))||null;speechSynthesis.speak(u)}catch(e){toast('语音播放失败，请尝试 Chrome 或 Safari')}}
function stopSpeak(){if(window.PipiVoice){window.PipiVoice.stop();return}if(window.SprintAndroid&&window.SprintAndroid.stopSpeech){window.SprintAndroid.stopSpeech();return}try{window.speechSynthesis?.cancel()}catch(e){}}
function stopRecorder(quiet=false){if(ui.recorder&&ui.recorder.state==='recording'){ui.recorder.stop();ui.recording=false;if(!quiet)toast('录音结束')}clearInterval(ui.focusTimer);ui.focusTimer=null;document.getElementById('recordTime')&&(document.getElementById('recordTime').textContent=`${String(Math.floor(ui.recordSeconds/60)).padStart(2,'0')}:${String(ui.recordSeconds%60).padStart(2,'0')}`)}
async function startRecorder(){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){toast('此浏览器不支持录音，请使用 HTTPS 或本机服务打开');return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(ui.audioUrl)URL.revokeObjectURL(ui.audioUrl);ui.audioUrl=null;ui.recordBlob=null;ui.recordParts=[];const recorder=new MediaRecorder(stream);ui.recorder=recorder;ui.recordSeconds=0;recorder.ondataavailable=e=>{if(e.data.size)ui.recordParts.push(e.data)};recorder.onstop=()=>{ui.recordBlob=new Blob(ui.recordParts,{type:recorder.mimeType||'audio/webm'});ui.audioUrl=URL.createObjectURL(ui.recordBlob);stream.getTracks().forEach(t=>t.stop());ui.recording=false;clearInterval(ui.focusTimer);if(ui.page==='train'&&ui.training==='speak')render()};recorder.start();ui.recording=true;ui.focusTimer=setInterval(()=>{ui.recordSeconds++;const node=document.getElementById('recordTime');if(node)node.textContent=`${String(Math.floor(ui.recordSeconds/60)).padStart(2,'0')}:${String(ui.recordSeconds%60).padStart(2,'0')}`;if(ui.recordSeconds>=240)stopRecorder()},1000);render()}catch(e){toast(e.name==='NotAllowedError'?'麦克风权限被拒绝，可到浏览器设置中允许':'无法启动麦克风，请检查浏览器权限')}}
function download(name,content,type){if(window.SprintAndroid&&window.SprintAndroid.saveFile){const blob=content instanceof Blob?content:new Blob([content],{type:type||'application/octet-stream'});blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let chars='';for(let i=0;i<bytes.length;i+=0x8000){chars+=String.fromCharCode(...bytes.subarray(i,i+0x8000))}window.SprintAndroid.saveFile(String(name),String(blob.type||'application/octet-stream'),btoa(chars));}).catch(()=>toast('文件导出失败'));return;}const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function wordImport(){const str=document.getElementById('wordsImport')?.value||'';let total=0,skip=0;const known=new Set(allWords().map(x=>x.word.toLowerCase()));for(const ln of str.trim().split(/\n/).slice(0,500)){const [word,zh,level,example]=ln.split(/[,，\t]/).map(v=>v?.trim());if(!word||!zh||!/^[a-z][a-z' -]{1,45}$/i.test(word)||known.has(word.toLowerCase())){skip++;continue}const safeLevel=['A1','A2','B1','B2','C1'].includes(String(level).toUpperCase())?level.toUpperCase():'B1';state.custom.push({id:'c'+Date.now()+'_'+total,word,zh,level:safeLevel,example:example||''});known.add(word.toLowerCase());total++}save();ui.dialog=null;ui.wordId=null;render();toast(`导入 ${total} 词，跳过 ${skip} 行`)}
function saveMock(){const val=id=>Number(document.getElementById(id)?.value);const raw=id=>document.getElementById(id)?.value.trim();if(['mockL','mockR','mockW','mockS'].some(id=>raw(id)==='')){toast('请填写完整四科成绩');return}const [L,R,W,S]=['mockL','mockR','mockW','mockS'].map(val);if(!Number.isInteger(L)||!Number.isInteger(R)||L<0||L>40||R<0||R>40||[W,S].some(v=>v<0||v>9||!Number.isInteger(v*2))){toast('听读填0–40整数，口写填0–9的半分值');return}const lb=mockBand(L,'listen'),rb=mockBand(R,'read');const overall=overallBand([lb,rb,W,S]);state.mockHistory.push({date:dateKey(),source:document.getElementById('mockSource').value,rawL:L,rawR:R,listen:lb,read:rb,write:W,speak:S,overall,exam:state.exam});markActivity();ui.dialog=null;showPage('me');toast(`已记录参考总分 ${overall.toFixed(1)}`)}
function saveSettings(){const date=document.getElementById('settingStart').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>dateKey()){toast('请选择有效的起始日期');return}state.goal=Number(document.getElementById('settingGoal').value);state.dailyMinutes=Number(document.getElementById('settingMinutes').value);state.exam=document.getElementById('settingExam').value;state.start=date;save();ui.dialog=null;render(true);toast('学习计划已更新')}
function captureDictationMistakes(reference,answer,lessonIndex){
 const ref=(reference.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)||[]).map(w=>w.toLowerCase().replace('’',"'"));
 const typed=(answer.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)||[]).map(w=>w.toLowerCase().replace('’',"'"));
 const remaining=new Map();typed.forEach(w=>remaining.set(w,(remaining.get(w)||0)+1));
 let errors=0;
 for(const w of ref){const count=remaining.get(w)||0;if(count){remaining.set(w,count-1);continue}
  const id='lex:'+w,old=wordById(id),gloss=makeReaderGloss(w,null);
  if(!old){state.readerWords=state.readerWords||{};state.readerWords[id]={id,word:w,zh:gloss.zh,level:gloss.level,topic:'听写错词',example:reference}}
  upsertMistake('dictationword',id,0,'逐句听写漏词',{source:'听写 · '+(listening[lessonIndex]?.title||'听力训练'),sentence:reference});errors++;
 }
 return errors
}
function onAction(action,el){switch(action){
case 'v5-continue-book':ui.keepStudyNext=true;ui.bookStudyOpen=true;ui.training='words';showPage('train','words');break;
case 'v5-undo':pipiGradeUndo();break;
case 'v5-tool-back':ui.training='words';showPage('me');break;
case 'v5-reveal':document.getElementById('pipiReviewMeaning').hidden=false;document.getElementById('pipiReveal').hidden=true;break;
case 'v5-speak':speak(wordById(ui.v5ReviewId)?.word||'');break;
case 'v5-review-pass':pipiReviewAnswer(true);break;
case 'v5-review-fail':pipiReviewAnswer(false);break;
case 'reader-back':ui.readerBookId=null;showPage('library');break;
case 'reader-toggle-cn':state.readerSettings=state.readerSettings||{};state.readerSettings.showChinese=! (state.readerSettings.showChinese!==false);save();render();break;
case 'reader-font-up':state.readerSettings.fontSize=clamp((state.readerSettings.fontSize||18)+2,15,24);save();render();break;
case 'reader-font-down':state.readerSettings.fontSize=clamp((state.readerSettings.fontSize||18)-2,15,24);save();render();break;
case 'reader-prev':moveReaderChapter(-1);break;
case 'reader-complete':moveReaderChapter(1,true);break;
case 'reader-pronounce':if(ui.readerSelection)speak(ui.readerSelection.word,.89);break;
case 'reader-mark-word':saveReaderMarkedWord();break;
case 'review-reveal':document.getElementById('reviewMeaning')?.classList.remove('hide');break;
case 'review-self-known':{const m=state.mistakes?.[ui.reviewId];if(m){healMistake(m.kind,m.unit,m.q);save();ui.dialog=null;render();toast(m.status==='mastered'?'已达到熟悉里程碑，仍会按FSRS安排复习':'已记录「会」，FSRS已安排下次复习')}break}
case 'review-self-fail':{const m=state.mistakes?.[ui.reviewId];if(m){upsertMistake(m.kind,m.unit,m.q,'再次回忆失败',{source:'错词自测',bookId:m.bookId,sentence:m.sentence,sentenceZh:m.sentenceZh});save();ui.dialog=null;render();toast('已记录「不会」，10分钟后可再次复习')}break}

case 'choose-wordbook':case 'switch-book':openWordBookSwitch();break;
case 'load-active-book':loadSelectedBook(activeBook());break;
case 'cache-all-books':cacheAllBooks();break;
case 'import-book':bookImportModal();break;
case 'submit-book-import':importBookFromFile();break;
case 'book-quiz-start':startBookQuiz();break;
case 'book-quiz-exit':ui.bookQuiz=null;render();break;
case 'book-quiz-next':bookQuizNext();break;
case 'settings':settingsModal();break;
case 'close-dialog':ui.dialog=null;renderDialog();break;
case 'start-vocab':createQuiz('vocab');break;
case 'start-sound':createQuiz('sound');break;
case 'quiz-say':{const q=state.quiz;speak(wordById(q.ids[q.index]).word,.9);break}
case 'exit-quiz':if(confirm('退出将结束本次未完成的诊断，确定退出？')){state.quiz=null;save();render(true)}break;
case 'result-train':ui.dialog=null;showPage('train','words');break;
case 'word-mode-card':case 'word-mode-list':toast('词书现在统一使用滑动学习');break;
case 'word-display-english':case 'word-display-both':toast('词书默认同时显示英文、音标和中文');break;
case 'list-say':speak(wordById(el.dataset.wordId)?.word||'');break;
case 'list-details':listShowDetails(el.dataset.wordId);break;
case 'list-unknown':listMarkUnknown(el.dataset.wordId,el);break;
case 'flip-word':toggleFastWordMeaning();break;
case 'speak-word':speak(wordById(ui.wordId)?.word||'');break;
case 'open-import':importWordModal();break;
case 'save-words':wordImport();break;
case 'stage-listen':beginStage('listen');break;
case 'stage-read':beginStage('read');break;
case 'exit-stage':showPage('today');break;
case 'stage-prev':if(state.stageTest){state.stageTest.index=Math.max(0,state.stageTest.index-1);save();render(true)}break;
case 'stage-next':if(state.stageTest){state.stageTest.index=Math.min(39,state.stageTest.index+1);save();render(true)}break;
case 'stage-audio':if(state.stageTest){const st=state.stageTest;const it=st.items[st.index];speak(listening[it.unit].script,.97)}break;
case 'stage-submit':submitStage();break;
case 'open-library':showWordLibrary();break;
case 'start-sound-drill':beginSoundTraining();break;
case 'sound-play':{const s=ui.soundDrill;if(s)speak(wordById(s.ids[s.index])?.word||'',.93);break}
case 'sound-next':nextSound();break;
case 'random-listen':ui.lesson=Math.floor(Math.random()*listening.length);ui.answers={};ui.lessonSubmitted=false;ui.transcript=false;render(true);break;
case 'random-read':ui.reading=Math.floor(Math.random()*readings.length);ui.readingAnswers={};ui.readingSubmitted=false;render(true);break;
case 'review-say':{const m=state.mistakes?.[ui.reviewId];if(m)speak(wordById(m.unit)?.word||'');break}
case 'listen-play':speak(listening[ui.lesson].script,ui.speechRate);break;
case 'listen-stop':stopSpeak();break;
case 'dictation-play':{const sentences=(listening[ui.lesson].script.match(/[^.!?]+[.!?]+/g)||[listening[ui.lesson].script]);speak(sentences[ui.dictationIndex%sentences.length].trim(),ui.speechRate);break}
case 'dictation-next':{const sentences=(listening[ui.lesson].script.match(/[^.!?]+[.!?]+/g)||[listening[ui.lesson].script]);ui.dictationIndex=(ui.dictationIndex+1)%sentences.length;ui.dictationResult=null;render();break}
case 'dictation-check':{const ans=document.getElementById('dictationInput')?.value||'';if(!ans.trim()){toast('请先输入你听到的英文');return}const lines=listening[ui.lesson].script.match(/[^.!?]+[.!?]+/g)||[listening[ui.lesson].script];const ref=lines[ui.dictationIndex%lines.length].trim();const score=Math.round(wordMatch(ref,ans)*100);const missed=captureDictationMistakes(ref,ans,ui.lesson);ui.dictationResult={score,answer:ans,missed};state.dictationHistory.push({date:dateKey(),lesson:ui.lesson,part:ui.dictationIndex,score});markActivity();render();toast(`本句匹配率 ${score}% · ${missed}个漏词已记录`);break}
case 'toggle-transcript':ui.transcript=!ui.transcript;render();break;
case 'submit-listen':submitListen();break;
case 'next-listen':nextLesson('lesson',listening);break;
case 'speaking-say':speak(speaking[ui.speak].prompt,.91);break;
case 'start-record':startRecorder();break;
case 'stop-record':stopRecorder();break;
case 'download-audio':if(ui.recordBlob)download(`speaking-${dateKey()}.webm`,ui.recordBlob,ui.recordBlob.type);break;
case 'save-speaking':{const rubric=['fluency','vocab','grammar','pron'].filter(k=>ui['r_'+k]);state.speakingHistory.push({date:dateKey(),topic:ui.speak,seconds:ui.recordSeconds,checklist:rubric});markActivity('speak');render();toast('口语练习已记录（不是雅思评分）');break}
case 'next-speak':stopSpeak();if(ui.recording)stopRecorder(true);ui.speak=(ui.speak+1)%speaking.length;ui.recordSeconds=0;ui.audioUrl=null;ui.recordBlob=null;['fluency','vocab','grammar','pron'].forEach(k=>ui['r_'+k]=false);render(true);break;
case 'submit-read':submitRead();break;
case 'next-read':nextLesson('reading',readings);break;
case 'next-writing':{const items=eligibleWriting();const i=items.findIndex(x=>x.index===ui.write);ui.write=items[(i+1)%items.length].index;render(true);break}
case 'submit-writing':{const text=state.writingDrafts[ui.write]||'';const count=wordsOf(text).length;if(count<50){toast('至少写50个英文词后才记录训练，草稿已保存');return}state.writingHistory=state.writingHistory||[];state.writingHistory.push({date:dateKey(),prompt:ui.write,wordCount:count,checklist:['task','coherence','lexical','grammar'].filter(k=>ui['w_'+k])});markActivity('write');render();toast(`作文已保存（${count}词），建议请老师评分`);break}
case 'open-mock':mockModal();break;
case 'save-mock':saveMock();break;
case 'save-settings':saveSettings();break;
case 'export':location.href='./backup.html';break;
case 'import-data':location.href='./backup.html';break;
case 'reset-data':{if(confirm('将删除本浏览器全部学习记录，确定清空？')){if(confirm('请再次确认：这将清空已学单词、测试和作文等所有记录。')){localStorage.removeItem(KEY);state=defaultState();ui.dialog=null;showPage('today');toast('本地学习数据已清空')}}break}
}}


function soundPool(){if(activeBook()!=='basic'&&importedBookReady())return allWords();const levels=state.wordLevel==='adaptive'?levelFocus():state.wordLevel;const p=words.filter(w=>levels==='all'||levels.includes(w.level));return p.length>=15?p:words}
function beginSoundTraining(){const existing=state.soundHistory||[];const pool=soundPool();const recent=new Set(existing.slice(-3).flatMap(x=>x.ids||[]));let opts=rnd(pool.filter(w=>!recent.has(w.id)));if(opts.length<15)opts=rnd(pool);ui.soundDrill={ids:opts.slice(0,15).map(w=>w.id),index:0,answers:[],options:null,feedback:null};render()}
function getSoundOptions(w){if(!ui.soundDrill)return [];const ss=ui.soundDrill;if(ss.options&&ss.optionsIndex===ss.index)return ss.options;ss.options=mkOptions(w);ss.optionsIndex=ss.index;return ss.options}
function renderSoundTraining(){const s=ui.soundDrill;
 if(!s)return `<div class="card"><span class="lesson-badge">核心专项 · 从声音到词义</span><h2 class="section-title" style="margin-top:12px">听到英语，立即反应</h2><p class="subtitle" style="margin:10px 0 16px">只看文字背单词不够。这里每组15道听词辨义题，先听发音，再在脑中形成含义，答错自动进入错题本。可按词汇等级筛选难度。</p><button class="btn full" data-action="start-sound-drill">开始15题听辨训练 ${icon('arrow',16)}</button><p class="micro">语音由设备自带英语音色合成，不是真人听力材料。</p></div><div class="section-head"><h2 class="section-title">历史表现</h2></div>${soundHistoryPanel()}`;
 if(s.index>=s.ids.length)return `<div class="card center"><span class="lesson-badge">训练结束</span><div class="big-number">${s.answers.filter(x=>x.correct).length}<span style="font-size:20px;color:#a3a9b9"> / ${s.ids.length}</span></div><p class="small muted">听辨分数是练习准确率，非官方雅思分数。</p><button class="btn full" data-action="start-sound-drill">再来一组</button><div class="sp8"></div><button class="btn ghost full" data-page="review">复盘听辨错题</button></div>${soundHistoryPanel()}`;
 const w=wordById(s.ids[s.index]);const opts=getSoundOptions(w);const answered=!!s.feedback;
 return `<div class="row between" style="margin-bottom:13px"><span class="lesson-badge">听辨挑战 · 第 ${s.index+1}/${s.ids.length} 题</span><span class="small muted">${esc(w.level)} · 先听后选</span></div>${mkProgress(s.index/s.ids.length*100)}<div class="sp14"></div><div class="card" style="padding:25px 18px"><div class="center"><span class="eyebrow">DON'T READ, LISTEN</span><div class="sp20"></div><button class="btn soft" data-action="sound-play" style="height:80px;width:80px;padding:0;border-radius:24px">${icon('volume',31)}</button><h2 style="font-size:17px;margin:17px 0 6px">先听发音，选出词义</h2><p class="micro">如完全听不出来，可重放并做标记</p></div><div class="sp14"></div>${opts.map((o,i)=>`<button class="answer-btn ${answered&&o===w.zh?'correct':''} ${answered&&s.feedback?.chosen===i&&o!==w.zh?'wrong':''}" ${answered?'disabled':''} data-sound-choice="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}${answered?`<div class="info-box ${s.feedback.correct?'green':'orange'}" style="margin-top:12px"><b>${s.feedback.correct?'识别正确':'这次没有听出来'}</b><br>${esc(w.word)} · ${esc(w.zh)}${w.example?`<br>${esc(w.example)}`:''}</div><div class="sp14"></div><button class="btn full" data-action="sound-next">${s.index+1===s.ids.length?'完成并查看结果':'继续下一题'} ${icon('arrow',16)}</button>`:''}</div>`}
function answerSound(i){const s=ui.soundDrill;if(!s||s.feedback)return;const w=wordById(s.ids[s.index]);const correct=getSoundOptions(w)[i]===w.zh;s.answers.push({id:w.id,correct});s.feedback={chosen:i,correct};if(correct)healMistake('sound',w.id,0);else upsertMistake('sound',w.id,0,getSoundOptions(w)[i]);save();render()}
function nextSound(){const s=ui.soundDrill;if(!s||!s.feedback)return;s.feedback=null;s.options=null;s.index++;if(s.index>=s.ids.length){state.soundHistory.push({date:dateKey(),ids:s.ids,correct:s.answers.filter(x=>x.correct).length,total:s.ids.length});state.soundHistory=state.soundHistory.slice(-100);markActivity('listen');save()}render()}
function soundHistoryPanel(){const hist=(state.soundHistory||[]).slice(-5).reverse();return !hist.length?`<div class="card"><p class="micro">完成首次练习后显示最近成绩和进步情况。</p></div>`:hist.map((x,i)=>`<div class="card" style="margin-bottom:8px"><div class="row between"><span class="small strong">${esc(x.date)} · 听辨训练</span><span class="lesson-badge">${x.correct}/${x.total} 正确</span></div>${mkProgress(x.correct/Math.max(1,x.total)*100)}</div>`).join('')}
function showWordLibrary(){ui.dialog=`<div class="sheet-header"><div class="sheet-title">词库查询 · ${allWords().length} 词</div><button class="close" data-action="close-dialog">✕</button></div><p class="micro">输入英文或中文关键词，查词义、发音和级别。</p><input class="input" id="libraryQuery" placeholder="例如：analyse / 分析" autocomplete="off"/><div id="libraryResults" style="margin-top:10px;max-height:55dvh;overflow:auto"></div>`;renderDialog()}
function searchWords(query){const s=query.toLowerCase().trim();const p=allWords().filter(w=>s?(w.word.toLowerCase().includes(s)||w.zh.includes(s)):false).slice(0,60);const box=document.getElementById('libraryResults');if(box)box.innerHTML=!s?`<p class="micro">开始输入关键词以搜索。</p>`:p.length?p.map(w=>`<div class="row between" style="border-bottom:1px solid #edf0f7;padding:11px 2px"><div><b>${esc(w.word)}</b> <span class="lesson-badge">${esc(w.level)}</span><div class="micro">${esc(w.zh)}</div></div><button class="chip" data-word-say="${esc(w.id)}">${icon('volume',16)} 发音</button></div>`).join(''):`<p class="micro">未找到匹配词。可以在词卡页面导入自己的单词。</p>`}


function weeklyCard(){const wk=Math.min(26,Math.max(1,Math.floor((dayNumber()-1)/7)+1));const blocks=[
{title:'诊断与句子听辨',focus:'建立基础发音、词义和短句识别能力',L:'每天30分钟分级精听或听词辨义；完成3段逐句听写',R:'至少完成3篇短阅读，逐题定位证据',S:'每天录音1次，保持30秒以上连续表达',W:'每周2篇短段落或作文提纲',check:'完成初始词汇/听辨诊断，建立四科基线'},
{title:'输入与输出强化',focus:'积累高频表达，修复连读、弱读和高频阅读误判',L:'每天一段精听+听写；每周站内听力至少4组',R:'每周4篇阅读，复盘同义替换',S:'Part 1每天2个问题；Part 2每周至少2次',W:'每周2次作文写作，先写提纲再完整表达',check:'完成一次站内40题听力/阅读练习与错题清单'},
{title:'雅思专项突破',focus:'强化题型、表达结构和做题时间管理',L:'每周完成一次官方完整听力样卷，逐题分类错因',R:'每周完成一套官方阅读题型练习并计时',S:'Part 2计时2分钟输出，Part 3每周3个话题',W:'每周完成至少2篇Task 2，Task 1再练1篇',check:'记录听读正确数；口语写作必须获取可靠外部反馈'},
{title:'综合冲刺与查缺',focus:'按真实样卷表现缩小四科短板',L:'每周完成1—2次官方完整听力练习并复盘',R:'每周至少一次60分钟阅读计时练习',S:'每周完整模拟1次口语流程，复听录音',W:'每周完整限时完成Task 1和Task 2',check:'用最近两次可信模考检验是否接近7分目标'}];const p=wk<=2?0:wk<=8?1:wk<=18?2:3;const b=blocks[p];const weak=myWeakness()[0];return `<div class="card" style="border-color:#dad5ff;background:#fcfbff"><div class="row between"><span class="lesson-badge">WEEK ${wk} / 26</span><span class="micro">Day ${dayNumber()}</span></div><h3 style="font-size:18px;margin:13px 0 8px">${b.title}</h3><p class="small muted">${b.focus}</p><div class="divider"></div>${[['听力',b.L],['阅读',b.R],['口语',b.S],['写作',b.W]].map(([a,b])=>`<div class="row" style="align-items:flex-start;margin:11px 0"><span class="lesson-badge">${a}</span><span class="small">${b}</span></div>`).join('')}<div class="info-box green"><b>本周验收</b>：${b.check}</div>${weak?`<p class="micro">根据你最近的训练，建议本周额外关注：${esc(weak.name)}（近期练习正确率 ${Math.round(weak.value*100)}%）。</p>`:''}<div class="sp14"></div><button class="btn soft full" data-page="review">查看错题与当前弱项</button></div>`}
function stageHistorySmall(){const hist=(state.stageHistory||[]).slice(-3).reverse();if(!hist.length)return `<p class="micro">尚未做阶段练习。建议每2周做一次，专门追踪正确率趋势。</p>`;return `<div class="divider"></div>${hist.map(h=>`<div class="row between" style="padding:7px 0"><span class="small muted">${esc(h.date)} · ${h.skill==='listen'?'听力':'阅读'}</span><b class="small">${h.correct}/${h.total}</b></div>`).join('')}`}
function beginStage(skill){if(state.quiz){toast('请先完成或退出正在进行的诊断');return}if(state.stageTest&&!confirm('已有未完成阶段练习，要重新开始吗？'))return;const bank=skill==='listen'?listening:readings;let u=rnd(bank.map((x,i)=>i).filter(i=>bank[i].qs.length>=(skill==='listen'?4:3))).slice(0,skill==='listen'?10:14);const items=u.flatMap(unit=>bank[unit].qs.map((q,i)=>({unit,q:i}))).slice(0,40);if(items.length!==40){toast('题库不足，无法开始阶段练习');return}state.stageTest={skill,items,index:0,answers:{},started:Date.now()};save();showPage('test')}
function renderStageTest(){const s=state.stageTest;if(!s)return '';const item=s.items[s.index],data=s.skill==='listen'?listening:readings,lesson=data[item.unit],q=lesson.qs[item.q],prev=s.items[s.index-1];const prevSame=prev&&prev.unit===item.unit;const label=s.skill==='listen'?'听力':'阅读';const choice=s.answers[s.index];return `<div class="row between"><button class="textbtn" data-action="exit-stage">← 暂存并退出</button><span class="lesson-badge">原创${label}阶段练习</span></div><div class="questions-head"><div class="progress-meta"><span>QUESTION ${s.index+1} / 40</span><span>已答 ${Object.keys(s.answers).length}/40</span></div>${mkProgress((s.index+1)/40*100)}</div><div class="card" style="margin-top:17px"><div class="row between"><h2 class="section-title">${esc(lesson.title)}</h2><span class="lesson-badge">${esc(lesson.level)}</span></div>${s.skill==='listen'?`<p class="micro">本题材料可重复播放；属于系统合成语音练习。</p><div class="center" style="padding:16px 0"><button class="btn soft" data-action="stage-audio">${icon('volume',21)} 播放这段材料</button></div>`:`<div class="script-box" style="margin-top:13px;max-height:33dvh;overflow:auto">${esc(lesson.text)}</div>`}<div class="divider"></div><div class="exercise-question">${s.index+1}. ${esc(q[0])}</div>${q[1].map((o,i)=>`<button class="answer-btn ${choice===i?'chosen':''}" data-stage-answer="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}<div class="row" style="margin-top:15px"><button class="btn ghost" data-action="stage-prev" ${s.index===0?'disabled':''}>上一题</button>${s.index<39?`<button class="btn full" data-action="stage-next">下一题 ${icon('arrow',16)}</button>`:`<button class="btn full" data-action="stage-submit">交卷并看解析</button>`}</div><p class="micro">可跳题、修改答案；交卷前不会显示正确选项。本站阶段练习与官方样卷难度不等同。</p></div>`}
function submitStage(){const s=state.stageTest;if(!s)return;const missing=40-Object.keys(s.answers).length;if(missing&&!confirm(`还有${missing}题未作答，将按错误计。确定交卷吗？`))return;const bank=s.skill==='listen'?listening:readings;let correct=0;const wrong=[];s.items.forEach((it,i)=>{const q=bank[it.unit].qs[it.q];if(s.answers[i]===q[2]){correct++;healMistake(s.skill,it.unit,it.q)}else{upsertMistake(s.skill,it.unit,it.q,s.answers[i]);wrong.push({unit:it.unit,q:it.q,selected:s.answers[i]})}});const seconds=Math.round((Date.now()-s.started)/1000);const res={date:dateKey(),skill:s.skill,correct,total:40,seconds,wrong,items:s.items,answers:s.answers};state.stageHistory=(state.stageHistory||[]).concat(res).slice(-30);state.stageTest=null;markActivity(s.skill);save();const excerpts=wrong.slice(0,12).map(({unit,q,selected})=>{const b=bank[unit].qs[q];return `<div style="border-bottom:1px solid #edf0f7;padding:9px 0"><b class="small">${esc(b[0])}</b><p class="micro">你的答案：${selected===undefined?'未作答':esc(b[1][selected])}；正确答案：${esc(b[1][b[2]])}</p><p class="micro">${esc(b[3])}</p></div>`}).join('');ui.dialog=`<div class="sheet-header"><div class="sheet-title">40题练习完成</div><button class="close" data-action="close-dialog">✕</button></div><div class="center"><div class="big-number">${correct}<span style="font-size:19px;color:#a5aaca"> / 40</span></div><p class="small muted">练习正确率 ${Math.round(correct/40*100)}% · 用时 ${Math.ceil(seconds/60)}分钟</p></div><div class="info-box orange">这是原创专项练习的正确率，难度、篇幅与雅思正式套卷不同，不能直接换算成IELTS Band。</div><h3 class="section-title" style="margin-top:17px">错题解析（${wrong.length}）</h3>${excerpts||'<p class="micro">全部答对，继续使用官方样卷检验能力。</p>'}${wrong.length>12?`<p class="micro">其余 ${wrong.length-12} 道已进入错题本，可逐题重练。</p>`:''}<div class="sp14"></div><button class="btn full" data-page="review">去错题本逐一修复 ${icon('arrow',16)}</button>`;render(true)}

function levelFocus(){const voc=state.testResults.filter(r=>r.type==='vocab').at(-1);if(!voc)return ['A1','A2','B1'];const l=['A1','A2','B1','B2','C1'].filter(x=>(voc.byLevel[x]?.weighted||0)/Math.max(1,voc.byLevel[x]?.total||0)<.75);return l.length?l:['B1','B2','C1']}
// All word mistakes share a single notebook card, regardless of vocabulary source.
function migrateNotebook(){
 if(state.fsrsMigration===1)return;
 const migrated={};
 for(const [key,entry] of Object.entries(state.mistakes||{})){
  const id=errorKey(entry.kind||key.split(':')[0],entry.unit??key,entry.q??0);
  const old=migrated[id];
  if(!old){migrated[id]={...entry,success:Math.max(0,Number(entry.success)||0),status:entry.kind&&WORD_KINDS.has(entry.kind)?'pending':entry.status};continue}
  const recent=(entry.last||'')>(old.last||'')?entry:old;
  migrated[id]={...old,...recent,seen:(Number(old.seen)||0)+(Number(entry.seen)||0),success:Math.max(Number(old.success)||0,Number(entry.success)||0),first:(old.first||'')<(entry.first||'')?old.first:entry.first,status:WORD_KINDS.has(recent.kind)?'pending':recent.status};
 }
 state.mistakes=migrated;
 for(const m of Object.values(state.mistakes))if(WORD_KINDS.has(m.kind)){
  const count=Math.max(Number(m.success)||0,Number(state.vocab[m.unit]?.knownCount)||0);
  if(state.vocab[m.unit])state.vocab[m.unit].knownCount=count;
  m.success=count;
  m.status=count>=KNOWN_TO_ARCHIVE?'mastered':'pending';
 }
 state.fsrsMigration=1;save();
}
function upsertMistake(kind,unit,q,detail,metadata={}){
 state.mistakes=state.mistakes||{};state.mistakeEvents=state.mistakeEvents||[];
 const id=errorKey(kind,unit,q),old=state.mistakes[id]||{};
 const now=new Date().toISOString(),isWord=WORD_KINDS.has(kind);
 if(isWord){reviewMemory(unit,false)}
 const n=isWord?(state.vocab[unit]?.knownCount||0):0;
 state.mistakes[id]={...old,kind:old.kind||kind,unit,q,detail,source:metadata.source||old.source||(kind==='readingword'?'名著点词':'站内训练'),bookId:metadata.bookId||old.bookId||'',sentence:metadata.sentence||old.sentence||'',sentenceZh:metadata.sentenceZh||old.sentenceZh||'',seen:(Number(old.seen)||0)+1,success:isWord?n:0,status:'pending',first:old.first||now,last:now,dueAt:isWord?state.vocab[unit]?.dueAt||now:old.dueAt||now};
 state.mistakeEvents.push({id,kind,unit,at:now,source:metadata.source||state.mistakes[id].source,bookId:metadata.bookId||'',detail:String(detail??'').slice(0,100)});
 return id;
}
function healMistake(kind,unit,q){
 const id=errorKey(kind,unit,q),it=state.mistakes?.[id],isWord=WORD_KINDS.has(kind);
 if(isWord){const memo=reviewMemory(unit,true);if(it){it.success=memo.knownCount;it.dueAt=memo.dueAt;it.last=new Date().toISOString();if(memo.knownCount>=KNOWN_TO_ARCHIVE){it.status='mastered';it.masteredAt=it.last}else{it.status='pending'}}return memo}
 if(!it)return null;
 it.success=(Number(it.success)||0)+1;if(it.success>=2){it.status='mastered';it.masteredAt=new Date().toISOString()}return it;
}
function activeMistakes(filter='pending'){
 const data=Object.entries(state.mistakes||{}).map(([id,m])=>({...m,id}));
 const now=Date.now();return data.filter(m=>filter==='all'||(filter==='mastered'?m.status==='mastered':filter==='due'?(!WORD_KINDS.has(m.kind)||!m.dueAt||new Date(m.dueAt).getTime()<=now):m.status!=='mastered')).sort((a,b)=>{
  if(filter==='pending'||filter==='due')return (a.dueAt||a.last||'').localeCompare(b.dueAt||b.last||'');
  return (b.last||'').localeCompare(a.last||'');
 });
}
function myWeakness(){const ls=state.listenHistory.slice(-12),rs=state.readHistory.slice(-12);const rate=arr=>arr.length?arr.reduce((v,x)=>v+x.correct,0)/Math.max(1,arr.reduce((v,x)=>v+x.total,0)):null;const lr=rate(ls),rr=rate(rs),sound=state.testResults.filter(x=>x.type==='sound').at(-1);const voc=state.testResults.filter(x=>x.type==='vocab').at(-1);let items=[];if(lr!==null)items.push({name:'听力理解',value:lr,train:'listen',hint:'优先回听做错的问题并逐句听写'});if(rr!==null)items.push({name:'阅读定位',value:rr,train:'read',hint:'检查定位词、同义替换和未提及判断'});if(sound)items.push({name:'听词识别',value:sound.correct/sound.total,train:'listen',hint:'从听单词和短句开始，不要只背拼写'});if(voc)items.push({name:'词义识别',value:voc.correct/voc.total,train:'words',hint:'优先复习诊断中的不熟悉单词'});return items.sort((a,b)=>a.value-b.value)}
function weakestPanel(){const weak=myWeakness();return weak.length?`<div class="card"><b class="small">当前最该加强：${esc(weak[0].name)}</b><div class="sp8"></div>${mkProgress(weak[0].value*100)}<p class="micro">近期站内练习准确率 ${Math.round(weak[0].value*100)}%，只用于安排训练，不是雅思成绩。</p><p class="small muted">${esc(weak[0].hint)}</p><button class="btn soft full" data-go-train="${weak[0].train}">现在练最弱一项 ${icon('arrow',16)}</button></div>`:`<div class="card"><b class="small">先确认基础，再精确训练</b><p class="small muted">完成一次词汇诊断、听词诊断和至少一组听力、阅读，系统就能根据结果推荐薄弱项。</p><button class="btn soft full" data-page="test">开始诊断 ${icon('arrow',16)}</button></div>`}
function renderReview(){
 const dueIds=PipiV5.dueIds(state),allIds=Object.keys(state.vocab||{}),kind=['due','unknown','all'].includes(ui.reviewFilterV5)?ui.reviewFilterV5:'due',q=(ui.reviewQueryV5||'').trim().toLowerCase();
 const mistakes=Object.values(state.mistakes||{});
 const readerOrigins=new Map(mistakes.filter(m=>m.bookId).map(m=>[m.unit,m]));
 const unknownSet=new Set(mistakes.filter(m=>WORD_KINDS.has(m.kind)&&m.status!=='mastered').map(m=>m.unit));
 const chosen=(kind==='due'?dueIds:kind==='unknown'?[...unknownSet].filter(id=>allIds.includes(id)||state.readerWords?.[id]):allIds).filter(id=>!q||id.toLowerCase().includes(q)||String(wordById(id)?.word||'').toLowerCase().includes(q)||String(wordById(id)?.zh||'').toLowerCase().includes(q));
 return `<div class="kicker">04 / SPACED REPETITION</div><h1 class="title">复习，让记忆留下来</h1><p class="subtitle">今日到期完全来自 FSRS 到期队列；词书单词、阅读点词、听写漏词统一进入同一个生词本与复习流。</p>
 <div class="v5-review-feature"><div><span>今日到期</span><strong>${dueIds.length}</strong><small>FSRS 智能推送 · 按到期时间排序</small></div><span class="v5-review-orb">↻</span></div>
 <div class="v5-review-filters">${[['due','今日到期'],['unknown','生词本'],['all','全部']].map(([k,t])=>`<button data-v5-filter="${k}" class="${kind===k?'active':''}">${t}</button>`).join('')}</div><input class="input" id="v5Search" value="${esc(ui.reviewQueryV5||'')}" placeholder="搜索英文或中文意思" autocomplete="off"/>
 <div class="v5-section-label"><h2>${kind==='due'?'FSRS 今日到期':kind==='unknown'?'生词本（含阅读生词）':'所有进入复习的单词'}</h2><span>${chosen.length} 个</span></div>
 <div class="v5-review-list">${chosen.length?chosen.sort((a,b)=>String(state.vocab[a]?.dueAt||'').localeCompare(String(state.vocab[b]?.dueAt||''))).slice(0,200).map(id=>{const w=wordById(id),m=readerOrigins.get(id);const name=w?.word||id.replace(/^lex:/,'');const source=m?.source||(state.readerWords?.[id]?'阅读点词':'词书学习');return `<button class="v5-review-item" data-v5-review-id="${esc(id)}"><span><b>${esc(name)}</b><small>${esc((w?.zh||'未加载词义，打开词书后可查看').slice(0,64))}</small><small>来源：${esc(source)}</small></span><span>${kind==='unknown'?'加入生词本':dueLabel(state.vocab[id])} ›</span></button>`}).join(''):'<div class="card center" style="padding:32px 16px">这里暂无符合条件的单词，继续阅读或背单词就会积累。</div>'}</div>${chosen.length>200?'<p class="micro">为保证手机性能，仅展示前200条；可搜索指定单词。</p>':''}`;
}

function reviewOne(id){const m=state.mistakes?.[id];if(!m){toast('没有找到这条记录');return}
 if(WORD_KINDS.has(m.kind)){
  const w=wordById(m.unit);if(!w){toast('此词目前未加载，请先打开对应词库');return}
  ui.reviewId=id;
  ui.dialog=`<div class="sheet-header"><div class="sheet-title">FSRS 生词复习</div><button class="close" data-action="close-dialog">✕</button></div><p class="subtitle">先在脑中回忆意思，再显示答案。只需选择「不会 / 会」，系统自动计算下次出现时间。</p><h2 class="qword">${esc(w.word)} <button class="textbtn" data-action="review-say" aria-label="播放读音">${icon('volume',18)}</button></h2>${m.sentence?`<div class="reader-context">${esc(m.sentence)}</div>`:''}<div class="review-recall"><button class="btn full" data-action="review-reveal">显示释义并自评</button><div id="reviewMeaning" class="review-meaning hide"><b>${esc(w.zh)}</b>${w.example?`<p class="micro">${esc(w.example)}</p>`:''}<div class="binary-actions"><button class="binary-grade unknown" data-action="review-self-fail">不会<small>再安排复习</small></button><button class="binary-grade known" data-action="review-self-known">会<small>智能延长间隔</small></button></div></div></div><p class="micro">这张生词卡已累计「会」${Number(m.success)||0} 次；累计7次会标记为熟悉，但仍按FSRS安排到期复习。</p>`;
  renderDialog();return;
 }
 if(m.kind==='listen'){ui.lesson=Number(m.unit);ui.answers={};ui.lessonSubmitted=false;ui.transcript=false;showPage('train','listen')}
 else{ui.reading=Number(m.unit);ui.readingAnswers={};ui.readingSubmitted=false;showPage('train','read')}
}
function topicPicker(kind){const data=kind==='listen'?listening:readings;const i=kind==='listen'?ui.lesson:ui.reading;return `<div class="card" style="margin-bottom:14px"><div class="row between"><strong class="small">专项题库 · ${data.length} 组</strong><span class="micro">可自由选题</span></div><select class="select" id="${kind}Picker" style="margin-top:11px">${data.map((x,n)=>`<option value="${n}" ${i===n?'selected':''}>${String(n+1).padStart(2,'0')} · ${esc(x.title)} (${esc(x.level)})</option>`).join('')}</select><div class="row between" style="margin-top:9px"><span class="micro">已完成 ${kind==='listen'?new Set(state.listenHistory.map(x=>x.lesson)).size:new Set(state.readHistory.map(x=>x.reading)).size} 组</span><button class="textbtn" data-action="random-${kind}">随机换一组 ↗</button></div></div>`}
function writingPicker(){const items=eligibleWriting();return `<div class="card" style="margin-bottom:14px"><div class="row between"><b class="small">写作题库 · ${items.length} 题</b><span class="micro">Task 2 + Task 1</span></div><select class="select" id="writingPicker" style="margin-top:10px">${items.map(x=>`<option value="${x.index}" ${ui.write===x.index?'selected':''}>${x.type==='task2'?'T2':'T1'} · ${esc(x.title)}</option>`).join('')}</select></div>`}
function speakingPicker(){return `<div class="card" style="margin-bottom:14px"><div class="row between"><b class="small">口语话题库 · ${speaking.length} 题</b><span class="micro">Parts 1 / 2 / 3</span></div><select class="select" id="speakingPicker" style="margin-top:10px">${speaking.map((x,n)=>`<option value="${n}" ${ui.speak===n?'selected':''}>P${x.part} · ${esc(x.title)} · ${esc(x.prompt.slice(0,28))}</option>`).join('')}</select></div>`}


// Bilingual classic reading library (original graded adaptations and newly written Chinese translations).
const SprintLiterature=window.SprintLiterature||[];
function getReaderBook(id){return SprintLiterature.find(b=>b.id===id)}
function readingProgress(id){state.readerProgress=state.readerProgress||{};return state.readerProgress[id]||{chapter:0,completed:[]}}
const READER_COMMON={a:'一个；一',an:'一个；一',the:'定冠词：这个、那个',and:'和；并且',or:'或者',but:'但是',so:'因此；所以',because:'因为',if:'如果',then:'然后；那时',than:'比',that:'那个；那；引导从句',this:'这个',these:'这些',those:'那些',it:'它；这件事',its:'它的',he:'他',him:'他（宾格）',his:'他的',she:'她',her:'她；她的',hers:'她的',they:'他们；她们',them:'他们（宾格）',their:'他们的',we:'我们',us:'我们（宾格）',our:'我们的',you:'你；你们',your:'你的；你们的',i:'我',me:'我（宾格）',my:'我的',who:'谁；……的人',what:'什么',which:'哪一个；哪个',where:'在哪里',when:'何时；当……时',why:'为什么',how:'怎样；如何',is:'是',am:'是',are:'是',was:'过去是',were:'过去是',be:'是；成为',been:'be的过去分词',being:'存在；正处于',has:'有；已经',have:'有；已经',had:'曾经有；已经',do:'做；助动词',did:'做了；过去式助动词',does:'做；助动词',can:'能够',could:'能够；可能',would:'会；愿意',should:'应该',will:'将会；愿意',may:'可以；可能',might:'也许',must:'必须',not:'不',no:'不；没有',yes:'是；对',to:'向；到；不定式标记',for:'为了；给',of:'……的',from:'从',in:'在……里',on:'在……上',at:'在；在某时',by:'通过；由；在旁边',as:'作为；像；当……时',with:'和；带有',without:'没有',into:'进入',through:'穿过',across:'横过；穿过',around:'在……周围',over:'在……上方',under:'在……下面',before:'在……之前',after:'在……之后',above:'在……上方',below:'在……下面',between:'在……之间',behind:'在……后面',beside:'在……旁边',about:'关于；大约',up:'向上',down:'向下',out:'向外',back:'返回；后面',off:'离开；关闭',away:'离开',again:'再次',there:'那里；存在句引导词',here:'这里',now:'现在',very:'非常',much:'很多',many:'许多',more:'更多',most:'最多；大多数',less:'更少',little:'小的；一点',few:'少量',some:'一些',any:'任何；一些',all:'全部',every:'每一个',each:'每一个',another:'另一个',other:'其他的',one:'一；一个',two:'二；两个',three:'三；三个',first:'首先；第一个',last:'最后的',next:'接下来的',only:'仅仅；唯一的',just:'恰好；刚才',even:'甚至',also:'也',too:'也；太',together:'一起',always:'总是',never:'从不',sometimes:'有时',often:'经常',soon:'很快',still:'仍然',almost:'几乎',enough:'足够',well:'好；健康的',good:'好的',better:'更好的',best:'最好的',great:'伟大的；极好的',new:'新的',old:'旧的；年老的',young:'年轻的',long:'长的；长久的',short:'短的',small:'小的',large:'大的',big:'大的',strange:'奇怪的',happy:'快乐的',sad:'难过的',beautiful:'美丽的',important:'重要的',different:'不同的',same:'相同的',real:'真实的',really:'真的',true:'真实的',truly:'真正地',know:'知道',knew:'知道（过去式）',think:'认为；思考',thought:'想法；思考过',look:'看；看起来',looked:'看了；看起来',see:'看见',saw:'看见（过去式）',seen:'看见（过去分词）',say:'说',said:'说（过去式）',tell:'告诉',told:'告诉（过去式）',ask:'问；请求',asked:'问了；请求了',want:'想要',wanted:'想要（过去式）',need:'需要',needed:'需要（过去式）',get:'得到',got:'得到（过去式）',give:'给',gave:'给（过去式）',take:'拿；带走',took:'拿了（过去式）',make:'做；使',made:'制作了；使',go:'去',went:'去了',come:'来',came:'来了',find:'找到',found:'找到了',feel:'感觉',felt:'感觉到（过去式）',begin:'开始',began:'开始了',become:'成为',became:'成为了',leave:'离开',left:'离开了',put:'放置',keep:'保持',kept:'保持了',sit:'坐',sat:'坐了',stand:'站立',stood:'站着',run:'跑',ran:'跑了',walk:'走路',walked:'走了',move:'移动',moved:'移动了',live:'生活；居住',lived:'生活过；住过',open:'打开',opened:'打开了',close:'关上',closed:'关上了',play:'玩；戏剧',work:'工作',help:'帮助',love:'爱；热爱',like:'喜欢；像',liked:'喜欢过',remember:'记得',understand:'理解',understood:'理解了',time:'时间；次数',day:'一天',night:'夜晚',morning:'早晨',evening:'傍晚',year:'年',minute:'分钟',hour:'小时',today:'今天',tomorrow:'明天',yesterday:'昨天',home:'家',house:'房子',room:'房间',door:'门',window:'窗户',table:'桌子',chair:'椅子',book:'书',letter:'信；字母',word:'单词；话',story:'故事',life:'生活；生命',world:'世界',place:'地方',country:'国家；乡村',town:'城镇',city:'城市',garden:'花园',river:'河流',tree:'树',flower:'花',road:'道路',sky:'天空',sun:'太阳',water:'水',food:'食物',money:'金钱',people:'人们',person:'人',family:'家庭',friend:'朋友',child:'孩子',children:'孩子们',girl:'女孩',boy:'男孩',woman:'女人',women:'女人们',man:'男人',men:'男人们',mother:'母亲',father:'父亲',sister:'姐妹',brother:'兄弟',aunt:'姨妈；姑妈',uncle:'叔叔；舅舅',dog:'狗',cat:'猫',bird:'鸟',animal:'动物',alice:'爱丽丝（人名）',anne:'安妮（人名）',mary:'玛丽（人名）',dorothy:'多萝西（人名）',tom:'汤姆（人名）',watson:'华生（人名）',holmes:'福尔摩斯（人名）',scrooge:'斯克鲁奇（人名）',bingley:'宾利（人名）',darcy:'达西（人名）',elizabeth:'伊丽莎白（人名）'};
function makeReaderGloss(word,b){
 let key=word.toLowerCase().replace(/[’]/g,"'");let normalized=key;
 const tryKeys=[key,key.replace(/'s$/,''),key.replace(/s$/,''),key.replace(/ies$/,'y'),key.replace(/ing$/,''),key.replace(/ed$/,'')];
 for(let i=0;i<tryKeys.length;i++){
  const v=tryKeys[i],g=b?.glossary?.[v]||READER_COMMON[v],w=SprintBooks.lookup('lex:'+v)||words.find(x=>x.word.toLowerCase()===v)||Object.values(state.readerWords||{}).find(x=>x.word.toLowerCase()===v);
  if(g||w?.zh){normalized=v;return {zh:g||w.zh,normalized,level:w?.level||b?.level||'阅读'}}
 }
 return {zh:'暂无精确中文释义，请结合下方句译理解，或先标记后复习',normalized:key,level:b?.level||'阅读'}
}
function renderClickableSentence(sentence,b,ch,p){return esc(sentence).replace(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g,token=>{
  const id='lex:'+token.toLowerCase().replace(/[’]/g,"'");const flagged=Object.values(state.mistakes||{}).some(m=>m.kind==='readingword'&&m.unit===id);
  return `<button type="button" class="word-token ${flagged?'marked':''}" data-reader-word="${esc(token.toLowerCase())}" data-reader-p="${p}" aria-label="查询单词 ${esc(token)}">${token}</button>`
 })}
function renderLiterature(){ui.readerBookId=null;return renderBookShelf()}
function renderBookShelf(){let saved={};try{saved=JSON.parse(localStorage.getItem('sprint7_originals_progress')||'{}')}catch(e){}
 return `<div class="kicker">02 / ENGLISH CLASSICS</div><h1 class="title">读喜欢的书，学遇见的词</h1><p class="subtitle">共20本公版英文原著 · 当前已安装 ${window.PipiAssetStatus?.installedBooks?.length??OriginalBooks.length} 本 · 上下滑动连续阅读 · 点词查义 · 续读。</p>
 <div class="v5-library-grid">${OriginalBooks.map(b=>{const p=saved[b.id],installed=!window.PipiAssetStatus||window.PipiAssetStatus.installedBooks.includes(b.id);return `<a class="v5-literature-card ${installed?'':'unavailable'}" ${installed?'href="./originals-reader.html?book='+encodeURIComponent(b.id)+'"':'aria-disabled="true"'}><span class="v5-literature-cover" style="--book-accent:${esc(b.accent)}">${esc(b.emoji)}<small>${esc(b.enTitle)}</small></span><span class="v5-literature-detail"><b>${esc(b.zhTitle)}</b><small>${esc(b.author)}</small><span>${!installed?'离线素材待补齐':p?`已读至第 ${Number(p.chapter||0)+1} 章 · 继续阅读`:'开始阅读'} ${installed?'→':''}</span></span></a>`}).join('')}</div>
 <div class="note">阅读器从安装包内读取原文。单击单词仅查询，不自动添加为生词；点击“不会”才计入复习。</div>`;
}

function openReaderBook(id){const b=getReaderBook(id);if(!b)return;ui.readerBookId=id;ui.readerChapter=readingProgress(id).chapter||0;const p=readingProgress(id);state.readerProgress[id]={...p,chapter:ui.readerChapter,last:dateKey(),completed:p.completed||[]};save();showPage('library')}
function moveReaderChapter(delta,finished=false){const b=getReaderBook(ui.readerBookId);if(!b)return;const p=readingProgress(b.id),old=ui.readerChapter;
 if(finished)p.completed=[...new Set([...(p.completed||[]),old])];
 const next=clamp(old+delta,0,b.chapters.length-1);p.chapter=next;p.last=dateKey();state.readerProgress[b.id]=p;ui.readerChapter=next;save();
 if(finished&&old===b.chapters.length-1){markActivity('read');toast('恭喜，已读完这本经典导读！')}else if(finished){markActivity('read');toast('已记录本节阅读进度')}render(true)
}
function showReaderWord(token,pindex){const b=getReaderBook(ui.readerBookId);if(!b)return;const para=b.chapters[ui.readerChapter]?.paragraphs[pindex];if(!para)return;
 const normalized=token.toLowerCase().replace(/[’]/g,"'");const lookup=makeReaderGloss(normalized,b),id='lex:'+normalized,marked=Object.values(state.mistakes||{}).some(m=>m.kind==='readingword'&&m.unit===id);
 ui.readerSelection={id,word:normalized,zh:lookup.zh,level:lookup.level,bookId:b.id,sentence:para.en,sentenceZh:para.zh};
 ui.dialog=`<div class="sheet-header"><div class="sheet-title">点词查询</div><button class="close" data-action="close-dialog">✕</button></div><h2 class="reader-dictionary-word">${esc(normalized)} <button class="reader-font" data-action="reader-pronounce" aria-label="播放发音">${icon('volume',19)}</button></h2><div class="reader-dictionary-zh">${esc(lookup.zh)}</div><span class="lesson-badge">${esc(b.zhTitle)} · ${esc(lookup.level)}</span><div class="reader-context"><strong>原句</strong><p>${esc(para.en)}</p><strong>句译</strong><p>${esc(para.zh)}</p></div><button class="btn full" data-action="reader-mark-word">${marked?'再次标记不会 · 更新错词次数':'★ 不会这个词 · 加入错词本'}</button><div class="sp12"></div><button class="btn ghost full" data-page="review">去错词本复习</button><p class="micro">词义优先来自已下载词书、本机基础词库和导读词表；未覆盖的词会提示无精准释义，不会编造词义。</p>`;renderDialog()
}
function saveReaderMarkedWord(){const v=ui.readerSelection;if(!v)return;state.readerWords=state.readerWords||{};
 state.readerWords[v.id]={id:v.id,word:v.word,zh:v.zh,level:v.level,topic:'名著点词',example:v.sentence,book:'reader'};
 upsertMistake('readingword',v.id,0,'主动标记不会',{source:'《'+(getReaderBook(v.bookId)?.zhTitle||'经典阅读')+'》点词',bookId:v.bookId,sentence:v.sentence,sentenceZh:v.sentenceZh});
 // Put novel-marked words into the active spaced-repetition queue as well.
 if(!state.vocab[v.id])state.vocab[v.id]={reps:0,interval:1,ease:2.5,lapses:1,due:dateKey(),last:dateKey()};
 save();ui.dialog=null;render();toast(`已收录“${v.word}” · 可在错词本查看并复习`)
}
// ===== PIPI V5: shared navigation, answer journal, unified due queue =====
PipiV5.ensure(state);
state.wordGoal=PipiV5.bookGoal(state,activeBook());
function pipiUndoBar(){const g=ui.lastGrade;return g&&Date.now()-g.at<=3000?`<div class="v5-undo" id="pipiUndoBar"><span>已保存「${esc(g.word)}」</span><button data-action="v5-undo">撤销（3秒）</button></div>`:''}
function pipiGradeUndo(){const g=ui.lastGrade;if(!g||!PipiV5.restoreGrade(state,g.snapshot)){toast('撤销已超时');ui.lastGrade=null;return}if(!save(true)){state=JSON.parse(g.afterJSON);toast('撤销保存失败，已恢复已保存状态');return}ui.lastGrade=null;ui.wordId=g.id;ui.flip=false;render();toast('已撤销上一词，恢复学习位置')}
async function pipiReviewOpen(id){
 if(!wordById(id)?.zh){toast('正在读取相关离线词书…');for(const bookId of Object.keys(SprintBooks.BOOKS)){try{await SprintBooks.load(bookId)}catch(e){}if(wordById(id)?.zh)break}}
 const known=wordById(id);
 if((!known?.zh||/^(?:待查释义|暂无|未找到)/.test(known.zh))&&id.startsWith('lex:')&&window.SprintECDICT?.lookup){
   try{const row=await window.SprintECDICT.lookup(id.slice(4));if(row?.translation&&/[\u3400-\u9fff]/.test(row.translation)){
      const record=state.readerWords?.[id];if(record){record.zh=row.translation;if(!save())return}
   }}catch(e){console.warn('离线词义回查失败',e)}
 }
 pipiReview(id);
}
function pipiReview(id){const w=wordById(id),m=state.vocab?.[id];if(!m){toast('该单词未在学习记录中');return}if(!w||!w.zh||/^(?:待查释义|暂无|未找到)/.test(w.zh)){toast('这张词卡暂无准确中文释义，可从词书或原著离线词典查找');return}
 ui.v5ReviewId=id;ui.dialog=`<div class="sheet-header"><div class="sheet-title">间隔复习</div><button class="close" data-action="close-dialog">✕</button></div><p class="micro">先在心里想一想，再揭示答案。来源：${esc((Object.values(state.mistakes||{}).find(x=>x.unit===id)?.source)||'词书学习')}</p><h2 class="qword">${esc(w.word)} <button class="textbtn" data-action="v5-speak">${icon('volume',18)}</button></h2><button class="btn full" id="pipiReveal" data-action="v5-reveal">显示释义</button><div id="pipiReviewMeaning" class="v5-review-answer" hidden><h3>${esc(w.zh)}</h3><p>${esc(w.example||'')}</p><div class="binary-actions"><button class="binary-grade unknown" data-action="v5-review-fail">不会</button><button class="binary-grade known" data-action="v5-review-pass">会</button></div></div>`;renderDialog()}
function pipiReviewAnswer(known){const id=ui.v5ReviewId;if(!id)return;const word=wordById(id)?.word||id;const m=state.mistakes?.[errorKey('vocab',id,0)];const before=JSON.stringify(state);if(known){if(m)healMistake(m.kind,id,0);else reviewMemory(id,true)}else upsertMistake(m?.kind||'vocab',id,0,'复习：未记住',{source:m?.source||'间隔复习'});
 PipiV5.addEvent(state,{type:'review_done',wordId:id,verdict:known?'good':'again'});const d=dateKey();state.dayReviews[d]||={reviews:0,new:0};state.dayReviews[d].reviews++;
 if(!save(true)){state=JSON.parse(before);toast('存储失败，作答未保存');return}
 ui.v5ReviewId=null;ui.dialog=null;render();toast(`「${word}」已复习 · ${known?'会':'不会'}`)}
function pipiNavBack(){
 flushWordListProgress();
 if(ui.dialog){ui.dialog=null;renderDialog();return true}
 if(ui.bookQuiz){ui.bookQuiz=null;render();return true}
 if(ui.page==='train'&&ui.bookStudyOpen){ui.bookStudyOpen=false;ui.wordId=null;ui.flip=false;render(true);return true}
 pipiSavePosition();
 const previous=pipiNavHistory.pop();
 if(previous){ui.page=previous.page;ui.training=previous.training;ui.bookStudyOpen=previous.bookStudyOpen;ui.dialog=null;render(true);
  if(!(ui.page==='train'&&ui.bookStudyOpen))requestAnimationFrame(()=>{document.getElementById('viewport').scrollTop=previous.scrollTop||0});
  return true}
 if(ui.page!=='today'){showPage('today',null,{history:false});return true}
 return false;
}
window.PipiNavigateBack=pipiNavBack;

// Save origin before navigating to a separate local HTML document.
document.addEventListener('click',e=>{
 const a=e.target.closest('a[href]');if(!a||e.defaultPrevented)return;
 const href=a.getAttribute('href')||'';
 if(!/^\.\/[^?#]+\.html(?:[?#]|$)/.test(href))return;
 try{sessionStorage.setItem('pipi_nav_main_v511',JSON.stringify({page:ui.page,training:ui.training,bookStudyOpen:ui.bookStudyOpen,scrollTop:document.getElementById('viewport').scrollTop}));
  window.PipiWebNavigation?.recordDepart?.('index.html?nav='+encodeURIComponent(ui.page));}catch(_){}
},true);
// A single event dispatcher keeps all generated screens interactive.
document.addEventListener('click',e=>{const target=e.target.closest('[data-action],[data-page],[data-training],[data-go-train],[data-grade],[data-review],[data-review-answer],[data-sound-choice],[data-word-say],[data-stage-answer],[data-quiz-answer],[data-book],[data-book-answer],[data-listen-answer],[data-read-answer],[data-rate],[data-reader-book],[data-reader-word],[data-review-filter],[data-v5-filter],[data-v5-review-id]');if(!target)return;if(target.classList.contains('overlay')&&e.target.closest('.sheet'))return;
if(target.dataset.v5Filter){ui.reviewFilterV5=target.dataset.v5Filter;render();return}
if(target.dataset.v5ReviewId){pipiReviewOpen(target.dataset.v5ReviewId);return}
if(target.dataset.readerBook){openReaderBook(target.dataset.readerBook);return}
if(target.dataset.readerWord){showReaderWord(target.dataset.readerWord,Number(target.dataset.readerP));return}
if(target.dataset.reviewFilter){ui.reviewFilter=target.dataset.reviewFilter;render();return}
if(target.dataset.book){flushWordListProgress();if(target.dataset.book==='basic'){ui.dialog=null;ui.bookStudyOpen=true;state.wordStudyModes=state.wordStudyModes||{};state.wordStudyModes.basic='list';state.wordBook='basic';state.wordGoal=PipiV5.bookGoal(state,'basic');state.wordLevel='adaptive';state.wordTopic='all';ui.bookQuiz=null;ui.wordId=null;ui.flipOverride=null;ui.flip=false;save();render();toast('已切换基础词库')}else{loadSelectedBook(target.dataset.book)}return}
if(target.dataset.bookAnswer!==undefined){bookQuizChoose(Number(target.dataset.bookAnswer));return}
if(target.dataset.page){flushWordListProgress();stopSpeak();if(ui.recording)stopRecorder(true);showPage(target.dataset.page);if(target.dataset.scrollRes)setTimeout(()=>document.getElementById('resources')?.scrollIntoView({behavior:'smooth',block:'start'}),50);return}
if(target.dataset.goTrain){flushWordListProgress();stopSpeak();showPage('train',target.dataset.goTrain);return}
if(target.dataset.training){stopSpeak();if(ui.recording)stopRecorder(true);showPage('train',target.dataset.training);return}
if(target.dataset.grade){gradeWord(target.dataset.grade);return}
if(target.dataset.wordSay){speak(wordById(target.dataset.wordSay)?.word||'');return}
if(target.dataset.stageAnswer!==undefined){if(state.stageTest){state.stageTest.answers[state.stageTest.index]=Number(target.dataset.stageAnswer);save();render()}return}
if(target.dataset.soundChoice!==undefined){answerSound(Number(target.dataset.soundChoice));return}
if(target.dataset.review){reviewOne(target.dataset.review);return}
if(target.dataset.reviewAnswer!==undefined){answerReview(Number(target.dataset.reviewAnswer));return}
if(target.dataset.quizAnswer!==undefined){pickQuizAnswer(Number(target.dataset.quizAnswer));return}
if(target.dataset.listenAnswer){const [q,a]=target.dataset.listenAnswer.split(',').map(Number);ui.answers[q]=a;render();return}
if(target.dataset.readAnswer){const [q,a]=target.dataset.readAnswer.split(',').map(Number);ui.readingAnswers[q]=a;render();return}
if(target.dataset.rate){ui.speechRate=Number(target.dataset.rate);render();return}
if(target.dataset.action){onAction(target.dataset.action,target)}});
document.addEventListener('change',e=>{
if(e.target.id==='wordLevelFilter'||e.target.id==='wordTopicFilter'||e.target.id==='wordGoalFilter'||e.target.id==='wordOrderFilter'){if(e.target.id==='wordLevelFilter')state.wordLevel=e.target.value;if(e.target.id==='wordTopicFilter')state.wordTopic=e.target.value;if(e.target.id==='wordGoalFilter')PipiV5.setBookGoal(state,activeBook(),e.target.value);if(e.target.id==='wordOrderFilter')state.wordOrder=e.target.value;ui.wordId=null;ui.flip=false;save();render();return}
if(e.target.id==='listenPicker'||e.target.id==='readPicker'){const k=e.target.id==='listenPicker'?'lesson':'reading';ui[k]=Number(e.target.value);if(k==='lesson'){ui.answers={};ui.lessonSubmitted=false;ui.transcript=false;ui.dictationIndex=0;ui.dictationResult=null}else{ui.readingAnswers={};ui.readingSubmitted=false}render(true);return}
if(e.target.id==='speakingPicker'){ui.speak=Number(e.target.value);ui.recordBlob=null;ui.audioUrl=null;ui.recordSeconds=0;render(true);return}
if(e.target.id==='writingPicker'){ui.write=Number(e.target.value);render(true);return}
if(e.target.id==='v5Search'){ui.reviewQueryV5=e.target.value;render();const n=document.getElementById('v5Search');if(n){n.focus();n.setSelectionRange(e.target.selectionStart||0,e.target.selectionStart||0)}return}if(e.target.id==='mistakeSearch'){ui.reviewQuery=e.target.value;render();return}if(e.target.id==='guessBox')ui.quizGuess=e.target.checked;if(e.target.dataset.rubric)ui['r_'+e.target.dataset.rubric]=e.target.checked;if(e.target.dataset.writeRubric)ui['w_'+e.target.dataset.writeRubric]=e.target.checked;if(e.target.id==='restoreFile'&&e.target.files?.[0]){location.href='./backup.html';return}});
document.addEventListener('input',e=>{if(e.target.id==='mistakeSearch'){ui.reviewQuery=e.target.value;const q=e.target.value.toLowerCase().trim();document.querySelectorAll('.review-entry').forEach(el=>{el.style.display=!q||el.textContent.toLowerCase().includes(q)?'':'none'});return}if(e.target.id==='libraryQuery'){searchWords(e.target.value);return}if(e.target.id==='writingInput'){state.writingDrafts[ui.write]=e.target.value;save();const n=wordsOf(e.target.value).length,need=writing[ui.write].min;const count=document.getElementById('writing-count'),meter=document.getElementById('writing-meter');if(count)count.textContent=`${n} words`;if(meter)meter.style.width=`${clamp(n/need*100,0,100)}%`}});
// Import and recovery are handled only on backup.html with validated rollback.
migrateNotebook();
// Restores the last top-level module after opening a separate HTML screen.
try{const requested=new URLSearchParams(location.search).get('nav');
 if(['today','train','library','review','me','metrics','test','plan'].includes(requested))ui.page=requested;
 const snapshot=JSON.parse(sessionStorage.getItem('pipi_nav_main_v511')||'null');
 if(snapshot&&(!requested||requested===snapshot.page)){
  ui.page=snapshot.page;ui.training=snapshot.training||'words';ui.bookStudyOpen=!!snapshot.bookStudyOpen;
  if(snapshot.scrollTop>=0)pipiScrollByPage.set(pipiPageKey(),snapshot.scrollTop);
 }
}catch(e){}
render();
requestAnimationFrame(()=>{const pos=pipiScrollByPage.get(pipiPageKey());if(Number.isFinite(pos)&&!(ui.page==='train'&&ui.bookStudyOpen))document.getElementById('viewport').scrollTop=pos});
if(activeBook()!=='basic'){SprintBooks.load(activeBook()).then(()=>{if(ui.page==='train'&&ui.training==='words'&&!document.getElementById('pipiVirtualList'))render()}).catch(()=>{if(ui.page==='train'&&ui.training==='words'&&!document.getElementById('pipiVirtualList'))render()})}

window.PipiNavigationDebug={back:pipiNavBack,history:pipiNavHistory,scroll:pipiScrollByPage};

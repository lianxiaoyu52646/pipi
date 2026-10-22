/* Pipi V5.5 - one consistent, offline pronunciation control for all screens. */
(function(){
  'use strict';
  var KEY='pipi_offline_voice_rate_v55';
  var RATES=[.75,1,1.25];
  function rate(){try{var x=Number(localStorage.getItem(KEY));return RATES.includes(x)?x:1}catch(e){return 1}}
  function setRate(x){if(!RATES.includes(x))x=1;try{localStorage.setItem(KEY,String(x))}catch(e){}update();return x}
  function next(){var i=RATES.indexOf(rate());return setRate(RATES[(i+1)%RATES.length])}
  function update(){document.querySelectorAll('[data-voice-rate]').forEach(function(n){n.textContent='语速 '+rate()+'×'})}
  function notify(message){
    var el=document.querySelector('#pipi-tts-toast');
    if(!el){el=document.createElement('div');el.id='pipi-tts-toast';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:94px;left:50%;transform:translateX(-50%);background:#24203c;color:white;padding:10px 15px;max-width:90vw;border-radius:12px;font:13px/1.5 system-ui;z-index:2147483647;box-shadow:0 5px 20px #0003;pointer-events:none';document.body.appendChild(el)}
    el.textContent=message;el.hidden=false;
    clearTimeout(notify.timeout);notify.timeout=setTimeout(function(){el.hidden=true},3200);
  }
  function speak(text,multiplier){
    var word=String(text||'').trim();if(!word)return;
    if(word.split(/\s+/).length>=4){speakPassage(word,multiplier);return;}
    var speed=Math.max(.6,Math.min(1.5,rate()*(Number(multiplier)||1)));
    if(window.SprintAndroid){
      if(typeof window.SprintAndroid.speakWithRate==='function'){window.SprintAndroid.speakWithRate(word,speed);return}
      if(typeof window.SprintAndroid.speak==='function'){window.SprintAndroid.speak(word);return}
    }
    if(!('speechSynthesis' in window)){notify('当前浏览器没有语音引擎；安卓安装版内置离线发音');return}
    try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(word);u.lang='en-US';u.rate=speed;speechSynthesis.speak(u)}catch(e){notify('浏览器语音不可用；请使用安卓安装版')}
  }
  function stop(){
    passage=null;
    if(window.SprintAndroid&&window.SprintAndroid.stopSpeech)window.SprintAndroid.stopSpeech();
    if(window.SprintAndroid&&window.SprintAndroid.stopArticle)window.SprintAndroid.stopArticle();
    else try{speechSynthesis.cancel()}catch(e){}
  }
  const VOICES=[{id:2,name:'Nicole · 美式女声'},{id:3,name:'Sarah · 美式女声'},{id:7,name:'Emma · 英式女声'}];
  const VOICE_KEY='pipi_article_voice_id_v56';
  function voiceId(){try{var id=Number(localStorage.getItem(VOICE_KEY));return VOICES.some(v=>v.id===id)?id:3}catch(e){return 3}}
  function nextVoice(){var id=voiceId(),idx=VOICES.findIndex(v=>v.id===id);var voice=VOICES[(idx+1)%VOICES.length];try{localStorage.setItem(VOICE_KEY,String(voice.id))}catch(e){}return voice}
  function voiceName(){return VOICES.find(v=>v.id===voiceId())?.name||'Sarah · 美式女声'}
  function articlePlay(segments,token){
    if(window.SprintAndroid&&typeof window.SprintAndroid.speakArticle==='function'){
      window.SprintAndroid.speakArticle(JSON.stringify(segments),rate(),voiceId(),String(token));return true;
    }
    notify('文章离线朗读仅在 Android 安装版中可用');return false;
  }
  function articleAppend(segments,token){
    if(window.SprintAndroid&&typeof window.SprintAndroid.appendArticle==='function'){
      window.SprintAndroid.appendArticle(JSON.stringify(segments),String(token));return true;
    }
    notify('当前安装包不支持跨批次连续朗读');return false;
  }
  function articleFinish(token){
    if(window.SprintAndroid&&typeof window.SprintAndroid.finishArticle==='function')window.SprintAndroid.finishArticle(String(token));
  }
  function articleAction(action){
    var name={pause:'pauseArticle',resume:'resumeArticle',stop:'stopArticle'}[action];
    if(name && window.SprintAndroid&&typeof window.SprintAndroid[name]==='function')window.SprintAndroid[name]();
  }
  var passage=null,passageSerial=0;
  function splitPassage(input){
    var words=String(input).trim().match(/\S+\s*/g)||[],parts=[],chunk='';
    for(var i=0;i<words.length;i++){
      var word=words[i];
      if(chunk && chunk.length+word.length>280){parts.push(chunk.trim());chunk=''}
      if(word.length>280){if(chunk.trim())parts.push(chunk.trim());chunk='';for(var j=0;j<word.length;j+=280)parts.push(word.slice(j,j+280).trim())}
      else chunk+=word;
    }
    if(chunk.trim())parts.push(chunk.trim());return parts;
  }
  function speakPassage(input,multiplier){
    var content=String(input||'').trim();if(!content)return;
    var list=splitPassage(content).map(function(text,i){return {text:text,chapter:0,page:0,part:i,sub:0}});
    if(!window.SprintAndroid||typeof window.SprintAndroid.speakArticle!=='function'){
      notify('文章离线朗读需要安卓安装版');return;
    }
    passage={parts:list,index:0,token:'',rate:Math.max(.7,Math.min(1.3,rate()*(Number(multiplier)||1)))};
    playNextPassageBatch();
  }
  function playNextPassageBatch(){
    if(!passage)return;
    if(passage.index>=passage.parts.length){passage=null;return}
    var next=passage.parts.slice(passage.index,passage.index+30);
    passage.index+=next.length;
    passage.token='pipi-generic-'+(++passageSerial)+'-'+Date.now();
    window.SprintAndroid.speakArticle(JSON.stringify(next),passage.rate,voiceId(),passage.token);
    articleFinish(passage.token); // Legacy generic short-passage player uses separate batches.
  }
  window.addEventListener('pipi-article-tts',function(ev){
    var d=ev.detail||{};
    if(!passage||d.token!==passage.token)return;
    if(d.code==='article-error'||d.code==='article-stopped'){passage=null;return}
    if(d.code==='article-batch-done')playNextPassageBatch();
  });
  window.PipiVoice={speak:speak,stop:stop,rate:rate,setRate:setRate,nextRate:next,
    speakPassage:speakPassage,refreshRateUI:update,article:{play:articlePlay,append:articleAppend,finish:articleFinish,pause:function(){articleAction('pause')},resume:function(){articleAction('resume')},stop:function(){articleAction('stop')},voiceId:voiceId,voiceName:voiceName,nextVoice:nextVoice}};
  window.addEventListener('pipi-article-tts',function(e){
    var d=e.detail||{};if(d.code==='article-error'||d.code==='article-loading')notify(d.message||'文章朗读状态未知');
  });
  window.addEventListener('pipi-tts-status',function(e){
    var d=e.detail||{};
    if(d.code==='error'||d.code==='loading')notify(d.message||'语音状态未知');
  });
  // V5.9: no extra speed chip crowding the mobile app header.
  // Settings panel owns the visible speed button; the reader owns its speed selector.
  document.addEventListener('click',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-tts-control="1"]');
    if(el){next();}
  });
  document.addEventListener('DOMContentLoaded',update);
})();

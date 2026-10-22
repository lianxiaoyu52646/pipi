from pathlib import Path
from playwright.sync_api import sync_playwright
src=Path(__file__).resolve().parent.parent/'app/src/main/assets/voice-cache.html'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security'])
 for width in (320,360,390,430):
  page=b.new_page(viewport={'width':width,'height':790},device_scale_factor=1)
  script='''window._events=[];window._voiceState={state:"idle",done:0,total:42264};window.SprintAndroid={
  getLibraryVoiceCacheStatus(){return JSON.stringify(window._voiceState)},
  startLibraryVoiceCache(v,s){window._events.push(["start",v,s]);window._voiceState={state:"running",done:15,total:42264,book:"爱丽丝梦游仙境",chapter:1}},
  pauseLibraryVoiceCache(){window._events.push(["pause"]);window._voiceState.state="paused"},
  clearLibraryVoiceCache(){window._events.push(["clear"]);window._voiceState={state:"idle",done:0,total:0}}
  };window.confirm=()=>true;'''
  page.set_content(src.read_text(encoding='utf-8').replace('<body>','<body><script>'+script+'</script>'),wait_until='domcontentloaded')
  page.locator('#start').click();page.wait_for_timeout(900)
  assert page.locator('#status').inner_text()=='后台缓存中'
  assert page.evaluate('window._events[0]')==['start',3,1]
  assert page.locator('#pause').is_enabled()
  page.locator('#pause').click();page.wait_for_timeout(750)
  assert page.locator('#status').inner_text()=='已暂停'
  assert page.evaluate('window._events[1]')==['pause']
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  if width==390:page.screenshot(path='/mnt/data/pipi_voice_cache_screen.png',full_page=True)
  print('PASS',width,'px, start/pause/status/no overflow')
  page.close()
 b.close()

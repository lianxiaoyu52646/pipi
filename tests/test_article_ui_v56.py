from pathlib import Path
import subprocess, time, socket
import os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
file='http://127.0.0.1:8877/originals-reader.html'
server=subprocess.Popen(['python','-m','http.server','8877','--bind','127.0.0.1','--directory',str(root/'app/src/main/assets')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(.3)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.add_init_script('''window.__native=[];
      window.SprintAndroid={
      speakArticle:(data,rate,sid,token)=>window.__native.push({type:'play',data:JSON.parse(data),rate,sid,token}),
      pauseArticle:()=>window.__native.push({type:'pause'}),
      resumeArticle:()=>window.__native.push({type:'resume'}),
      stopArticle:()=>window.__native.push({type:'stop'}),
      stopSpeech:()=>{},speakWithRate:()=>{}};''')
    page.set_content((root/'app/src/main/assets/originals-reader.html').read_text())
    page.evaluate("""() => {const db={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k],clear:()=>Object.keys(db).forEach(k=>delete db[k])}});history.pushState=()=>{};history.replaceState=()=>{}}""")
    page.evaluate("""() => {window.__native=[];window.SprintAndroid={speakArticle:(data,rate,sid,token)=>window.__native.push({type:'play',data:JSON.parse(data),rate,sid,token}),pauseArticle:()=>window.__native.push({type:'pause'}),resumeArticle:()=>window.__native.push({type:'resume'}),stopArticle:()=>window.__native.push({type:'stop'}),stopSpeech:()=>{},speakWithRate:()=>{}};}""")
    import re
    html=(root/'app/src/main/assets/originals-reader.html').read_text()
    for src in re.findall(r'<script src="([^"]+)"',html):
        page.add_script_tag(content=(root/'app/src/main/assets'/src).read_text())
    page.wait_for_timeout(350)
    assert not errors,errors
    assert page.locator('[data-book]').count()>=9
    page.locator('[data-book]').first.click()
    page.wait_for_function("document.querySelector('#readingPane') && !document.querySelector('#readingPane').hidden",timeout=20000)
    assert page.locator('.reader-stream-chunk').count()>0
    page.locator('#playPart').click()
    calls=page.evaluate('window.__native')
    play=[x for x in calls if x['type']=='play']
    assert len(play)==1,play
    info=play[0]
    assert info['data'] and len(info["data"])<=36,info
    assert all(len(x['text'])<=500 for x in info['data'])
    assert 0<=info['sid']<=10
    page.evaluate('''d=>window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:{code:'article-segment',token:d.token,index:0,...d.data[0]}}))''',info)
    assert page.locator('.article-speech-current').count()>=1
    saved=page.evaluate("JSON.parse(localStorage.getItem('pipi_article_position_v56'))")
    assert saved['book'] and saved['part']==info['data'][0]['part']
    page.locator('#playPart').click()
    assert page.evaluate('window.__native.at(-1).type')=='pause'
    page.locator('#playPart').click()
    assert page.evaluate('window.__native.at(-1).type')=='resume'
    page.evaluate("d=>window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:{code:'article-batch-done',token:d.token}}))",info)
    assert page.evaluate('window.__native.filter(c=>c.type===\'play\').length')>=2
    page.locator('#stopArticle').click()
    assert page.locator('#stopArticle').is_hidden()
    assert page.locator('#playPart').inner_text().strip()=='▶ 朗读'
    page.locator('#articleVoice').click()
    assert 'Emma' in page.locator('#articleVoice').inner_text()
    assert not errors,errors
    print('PASS: novel offline narrator GUI + native bridge + chunking + bookmark + pause/resume + voice + highlight')
    browser.close()
    server.terminate()

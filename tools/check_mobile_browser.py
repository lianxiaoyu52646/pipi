#!/usr/bin/env python3
"""Real Chromium DOM test using file-backed JS/CSS, no network dependency.
Not a substitute for Android WebView or sherpa-onnx model execution.
"""
import re,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'app/src/main/assets'
SCRIPTS=re.findall(r'<script defer src="\./([^"]+)"', (ROOT/'index.html').read_text())

def build(page):
  html=(ROOT/'index.html').read_text()
  html=re.sub(r'<script defer src="\./[^"]+"\s*></script>','',html)
  html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
  page.set_content(html,wait_until='domcontentloaded')
  store={}
  page.evaluate("""() => {window.__local={};Object.defineProperty(window,'localStorage',{value:{
    getItem:k=>Object.prototype.hasOwnProperty.call(window.__local,k)?window.__local[k]:null,
    setItem:(k,v)=>{window.__local[k]=String(v)},removeItem:k=>{delete window.__local[k]},clear:()=>{window.__local={}}
  }});}""")
  data={f'./schoolbooks/{id}.json':(ROOT/f'schoolbooks/{id}.json').read_text() for id in ('primary','junior','senior')}
  data.update({f'./wordbooks-data/{id}.txt':(ROOT/f'wordbooks-data/{id}.txt').read_text() for id in ('cet4','cet6','ielts','toefl')})
  page.evaluate("""data=>{window.__files=data;window.fetch=async function(u){const raw=window.__files[String(u)];return {
    ok:typeof raw==='string',status:typeof raw==='string'?200:404,
    text:async()=>raw||'',json:async()=>JSON.parse(raw||'null')
  }}}""",data)
  for css in ('styles.css','v5-styles.css','ui-modern.css'):page.add_style_tag(content=(ROOT/css).read_text())
  for js in SCRIPTS:page.add_script_tag(content=(ROOT/js).read_text())

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [320,360,390,430]:
   page=browser.new_page(viewport={'width':width,'height':780},is_mobile=True,has_touch=True)
   errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
   build(page)
   page.locator('button[data-page="train"]').first.click()
   page.locator('button[data-book="primary"]').click()
   page.wait_for_selector('.pipi-list-row',timeout=5000)
   time.sleep(1)
   pos=page.evaluate('document.getElementById("viewport").scrollTop')
   time.sleep(1.8)
   assert abs(page.evaluate('document.getElementById("viewport").scrollTop')-pos)<1,(width,'idle jump')
   assert page.locator('.pipi-list-row').count()>=35,(width,'missing rows')
   curr=page.evaluate('wordListProgress().next')
   page.evaluate('document.getElementById("viewport").scrollTop+=200')
   time.sleep(.25)
   assert page.evaluate('wordListProgress().next')==curr,(width,'program scroll marked known')
   page.evaluate('document.getElementById("viewport").scrollTop=0')
   time.sleep(.25)
   page.mouse.move(width/2,330);page.mouse.wheel(0,890)
   time.sleep(.4)
   progressed=page.evaluate('wordListProgress().next')
   assert progressed>curr,(width,'manual scroll not counted',progressed,curr)
   page.locator('button[data-action="choose-wordbook"]').first.click()
   page.locator('button[data-book="primary"]').click()
   page.wait_for_selector('.pipi-list-row',timeout=5000)
   next_index=int(page.locator('.pipi-list-row').first.get_attribute('data-row-index'))
   assert next_index==progressed,(width,'resume index',next_index,progressed)
   assert page.evaluate('document.getElementById("viewport").scrollTop')<3,(width,'resume jumps')
   assert not errors,(width,'JS errors',errors)
   print(f'PASS {width}px: idle stable, program scroll ignored, manual learn={progressed}, reopened at {next_index+1}')
   page.close()
  browser.close()
if __name__=='__main__':main()

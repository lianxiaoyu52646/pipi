#!/usr/bin/env python3
"""Chromium reading-page smoke test using file-backed scripts/fetch and no network.
Does not execute Android TTS or verify JNI model load.
"""
import re,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'app/src/main/assets'
SCRIPTS=re.findall(r'<script src="\./([^"]+)"', (ROOT/'originals-reader.html').read_text())
def build(page):
 html=(ROOT/'originals-reader.html').read_text()
 html=re.sub(r'<script src="\./[^"]+"\s*></script>','',html)
 html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
 page.set_content(html,wait_until='domcontentloaded')
 page.evaluate("""() => {history.replaceState=()=>{};history.pushState=()=>{};window.__local={};Object.defineProperty(window,'localStorage',{value:{
 getItem:k=>Object.prototype.hasOwnProperty.call(window.__local,k)?window.__local[k]:null,
 setItem:(k,v)=>{window.__local[k]=String(v)},removeItem:k=>{delete window.__local[k]},clear:()=>{window.__local={}}
 }});}""")
 data={f'./books/{p.stem}.txt':p.read_text(encoding='utf-8-sig') for p in (ROOT/'books').glob('*.txt')}
 page.evaluate("""data=>{window.__files=data;window.fetch=async function(u){const raw=window.__files[String(u)];return {
   ok:typeof raw==='string',status:typeof raw==='string'?200:404,
   text:async()=>raw||'',json:async()=>JSON.parse(raw||'null')
 }}}""",data)
 for f in ('originals-reader.css','reader-modern.css'): page.add_style_tag(content=(ROOT/f).read_text())
 for f in SCRIPTS:page.add_script_tag(content=(ROOT/f).read_text())
def main():
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=b.new_page(viewport={'width':390,'height':820})
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  build(page)
  page.evaluate("window.__readSmoke=[]; window.SprintOriginals && window.SprintOriginals.books.forEach(b => window.__readSmoke.push(b.id))")
  ids=page.evaluate('window.__readSmoke')
  # The readers parse the embedded novels and generate chapter markup independently.
  for i,book_id in enumerate(ids):
   if i:page.evaluate("document.getElementById('homeShelf').click()")
   # Call in-app book opener without modifying about:blank history.
   page.locator(f'button[data-book="{book_id}"]').first.click()
   page.wait_for_function('document.getElementById("readingPane")?.hidden === false || document.getElementById("loadStatus")?.textContent?.includes("失败")',timeout=16000)
   ready=page.locator('#readingPane').evaluate('(e)=>!e.hidden')
   assert ready,(book_id,'reader not available',page.locator('#loadStatus').inner_text())
   text=page.locator('#readingText').inner_text(timeout=5000)
   assert len(text.strip())>80,(book_id,'empty chapter text')
   assert page.locator('#playPart').count()==1,(book_id,'missing narration button')
   print(f'PASS reader {book_id}: English original chapter rendered, narration controls available')
  assert not errors,errors
  print('PASS twenty in-app books, no JS page errors')
  page.close();b.close()
if __name__=='__main__':main()

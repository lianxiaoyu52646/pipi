#!/usr/bin/env python3
"""Chromium UI state test with FAKE Android bridge. Does NOT test real Kokoro synthesis."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_reader_browser import build

def main():
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
  page=b.new_page(viewport={'width':360,'height':780})
  errs=[]
  page.on('pageerror',lambda e:errs.append(str(e)))
  build(page)
  page.evaluate("""() => {window.__ttsCalls=[];window.SprintAndroid={speakArticle:(batch,rate,voice,token)=>window.__ttsCalls.push({batch,rate,voice,token}),appendArticle:()=>{},finishArticle:()=>{},stopArticle:()=>{},pauseArticle:()=>{},resumeArticle:()=>{},setImmersive:()=>{}};}""")
  page.locator('button[data-book="alice"]').first.click()
  page.wait_for_function('document.getElementById("readingPane").hidden === false', timeout=15000)
  page.locator('#playPart').click()
  token=page.evaluate('window.__ttsCalls[0]?.token')
  assert token, 'native speakArticle not invoked'
  assert '准备' in page.locator('#playPart').inner_text(), 'initial buffering not visible'
  page.evaluate("""token=>window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:{code:'article-buffering',token,message:'正在准备连续朗读 6/20 秒音频'}}))""",token)
  assert '准备' in page.locator('#playPart').inner_text(), 'buffer event not visible'
  page.evaluate("""token=>window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:{code:'article-audio-start',token}}))""",token)
  assert '暂停' in page.locator('#playPart').inner_text(), 'playing state not visible'
  page.locator('#playPart').click()
  assert '继续' in page.locator('#playPart').inner_text(), 'pause state not visible'
  assert not errs, errs
  print('PASS: real browser reader controls: initial/buffer/playing/pause states (Android bridge simulated)')
  b.close()
if __name__=='__main__':main()

# coding: utf-8
"""Acquire PG #74 on the build computer; no network is ever required on the Android device.
Strictly refuse incomplete, adapted, or wrong book editions. User may supply tom.txt manually.
"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,time,urllib.request
root=Path(__file__).resolve().parent
assets=root/'app/src/main/assets'
dest=assets/'books/tom.txt'
manifest=assets/'books_manifest.json'
SOURCE='https://www.gutenberg.org/ebooks/74'
URLS=['https://www.gutenberg.org/cache/epub/74/pg74.txt',
      'https://www.gutenberg.org/files/74/74-0.txt',
      'https://www.gutenberg.org/files/74/74.txt',
      'https://raw.githubusercontent.com/hazelcast/hazelcast-jet/master/examples/wordcount/src/main/resources/books/tom-sawyer.txt']
ROM_TABLE={'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}
def roman(v):
    v=v.upper(); total=prev=0
    for c in v[::-1]:
        if c not in ROM_TABLE:return -1
        n=ROM_TABLE[c];total+=(-n if n<prev else n);prev=n
    return total

def clean(text):
    return text.replace('\r\n','\n').replace('\r','\n').lstrip('\ufeff')

def validate(data):
    try: txt=clean(data.decode('utf-8-sig'))
    except UnicodeDecodeError:return False,'不是有效 UTF-8 纯文本',None
    if not (320_000<=len(data)<=1_200_000):return False,'文件长度异常，疑似节选',None
    start=re.search(r'\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*',txt,re.I)
    end=re.search(r'\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK',txt,re.I)
    main=txt[start.end():end.start()] if start and end else txt
    if 'TOM SAWYER' not in main[:5000].upper():return False,'文件不是汤姆·索亚历险记',None
    headings=[]
    # Match the standalone printed chapter markers, not the Contents entry with subtitle.
    for m in re.finditer(r'^\s*CHAPTER\s+([IVXLCDM]+|\d+)\.?\s*$',main,re.I|re.M):
        n=int(m.group(1)) if m.group(1).isdigit() else roman(m.group(1))
        if 1<=n<=35:headings.append((n,m.start()))
    # Find the last narrative 1-35 run, which excludes duplicate table-of-contents headings.
    valid_run=None
    for i,(n,startpos) in enumerate(headings):
        if n!=1:continue
        run=headings[i:i+35]
        if len(run)==35 and [a for a,_ in run]==list(range(1,36)):
            lens=[b[1]-a[1] for a,b in zip(run,run[1:])]
            if min(lens)>250:valid_run=run
    if valid_run is None:return False,'不能识别35章连续且正文完整的章节内容',None
    narrative=main[valid_run[0][1]:]
    words=re.findall(r"[A-Za-z]+(?:['’\-][A-Za-z]+)*",narrative)
    if not 50_000<=len(words)<=130_000:return False,f'正文词数异常：{len(words)}',None
    if len(narrative)<280_000:return False,'正文文本异常短',None
    return True, f'35章，约{len(words):,}词；英文TXT完整性基础校验通过',{'characters':len(txt),'word_count':len(words),'chapters':35}

def download(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Sprint7 Offline Reader (public domain Gutenberg #74)','Accept':'text/plain,*/*'})
    try:
        with urllib.request.urlopen(req,timeout=32) as r:
            body=r.read(1_400_000)
            if len(body)<1_400_000:return body
    except Exception as e:print('  Python HTTPS:',str(e)[:130])
    # Windows Curl has a different TLS implementation than Python, frequently recovers from SSL EOF.
    try:
        c=subprocess.run(['curl.exe','-fL','--connect-timeout','12','--max-time','60','-A','Mozilla/5.0',url],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=65)
        if c.returncode==0:return c.stdout
        print('  curl.exe:',c.stderr.decode('utf-8','replace')[:130])
    except Exception as e:print('  curl.exe not available:',str(e)[:100])
    return None

def ensure():
    if dest.is_file():
        ok,msg,info=validate(dest.read_bytes())
        if ok:
            print('OK · 已发现本地完整《汤姆·索亚历险记》：',msg)
            update_manifest(dest.read_bytes(),info)
            return
        print('本地 tom.txt 未通过校验：',msg,'\n将尝试重新下载')
    for k,u in enumerate(URLS,1):
        print(f'[{k}/{len(URLS)}] 获取公版原文: {u}',flush=True)
        b=download(u)
        if not b:continue
        ok,msg,info=validate(b)
        if ok:
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(b);update_manifest(b,info)
            print('SUCCESS · 《汤姆·索亚历险记》已纳入本地素材：',msg,flush=True)
            return
        print('  无效或不完整：',msg)
    print('\n构建停止：无法取得《汤姆·索亚历险记》完整英文原著。')
    print('请用电脑浏览器打开 https://www.gutenberg.org/ebooks/74 ，选择 Plain Text。')
    print('将 UTF-8 全文另存为：',dest)
    print('再次运行“一键制作Android离线APK.bat”，切勿使用缩写、导读或改写版。')
    sys.exit(2)

def update_manifest(raw,info):
    items=json.loads(manifest.read_text('utf-8'))
    items=[v for v in items if v.get('id')!='tom']
    items.append({'id':'tom','book_id':74,'sha256':hashlib.sha256(raw).hexdigest(),'characters':info['characters'],'chapters':35,'words':info['word_count'],'source':SOURCE})
    manifest.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n','utf-8')

if __name__=='__main__':ensure()

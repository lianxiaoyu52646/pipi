# coding: utf-8
"""Produce an honest, offline-only inventory embedded into the APK at build time."""
from pathlib import Path
import json,hashlib
A=Path(__file__).resolve().parent/'app/src/main/assets'
expected=['alice','anne','christmas','littlewomen','machine','oz','pride','secret','sherlock','tom','treasure','peterpan','blackbeauty','heidi','willows','huckfinn','aroundworld','callwild','littleprincess','pinocchio']
rows={x['id']:x for x in json.loads((A/'books_manifest.json').read_text('utf-8'))}
installed=[]
for ident in expected:
    file=A/'books'/f'{ident}.txt'
    if file.is_file() and file.stat().st_size>=100_000 and ident in rows and hashlib.sha256(file.read_bytes()).hexdigest()==rows[ident]['sha256']:
        installed.append(ident)
wordbooks=[]
for k in ['primary','junior','senior']:
    p=A/'schoolbooks'/f'{k}.json'
    if p.is_file():
        try:
            if len(json.loads(p.read_text('utf-8')).get('words',[]))>300:wordbooks.append(k)
        except (ValueError,KeyError,TypeError):pass
for k in ['cet4','cet6','ielts','toefl']:
    p=A/'wordbooks-data'/f'{k}.txt'
    if p.is_file() and p.stat().st_size>8_000 and len([line for line in p.read_text('utf-8').splitlines() if '\t' in line]) > {'cet4':3600,'cet6':5000,'ielts':4600,'toefl':6500}[k]:wordbooks.append(k)
result={'expectedBooks':20,'installedBooks':installed,'expectedWordbooks':7,'installedWordbooks':wordbooks,'releaseReady':len(installed)==20 and len(wordbooks)==7}
(A/'asset-status.js').write_text('window.PipiAssetStatus = Object.freeze('+json.dumps(result,ensure_ascii=False,separators=(',',':'))+');\n','utf-8')
print('Embedded resources:',len(installed),'/20 books and',len(wordbooks),'/7 wordbook categories; RELEASE',result['releaseReady'])

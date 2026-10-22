# -*- coding: utf-8 -*-
"""皮皮 V5 release gate. No downloads, no silent resource replacement."""
from pathlib import Path
import json,sys,hashlib
A=Path(__file__).resolve().parent/'app/src/main/assets'
issues=[]
books=json.loads((A/'books_manifest.json').read_text('utf-8'))
ids={x['id'] for x in books}
expected=set(['alice','anne','christmas','littlewomen','machine','oz','pride','secret','sherlock','tom','treasure','peterpan','blackbeauty','heidi','willows','huckfinn','aroundworld','callwild','littleprincess','pinocchio'])
for ident in sorted(expected):
    p=A/'books'/f'{ident}.txt'
    if not p.is_file() or p.stat().st_size < 100_000:issues.append(f'原著缺失或不完整：books/{ident}.txt')
    elif (row:=next((x for x in books if x['id']==ident),None)) and hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:
        issues.append(f'原著哈希不匹配：{ident}.txt')
if ids != expected: issues.append('原著清单 books_manifest.json 并非20本完整清单（请检查 20 本原著清单）')
for name in ['primary','junior','senior']:
    p=A/'schoolbooks'/f'{name}.json'
    if not p.is_file():issues.append(f'学段词书缺失：{name}')
for name in ['cet4','cet6','ielts','toefl']:
    p=A/'wordbooks-data'/f'{name}.txt'
    if not p.is_file() or p.stat().st_size<8_000:issues.append(f'考试词书缺失：wordbooks-data/{name}.txt')
    elif sum('\t' in line for line in p.read_text('utf-8').splitlines()) < {'cet4':3600,'cet6':5000,'ielts':4600,'toefl':6500}[name]: issues.append(f'考试词书词数不足：{name}.txt')
if len(list((A/'ecdict').glob('??.json')))!=256:issues.append('ECDICT词典分片数量不为256')
for name in ['index.html','app.js','v5-core.js','v5-styles.css','originals-reader.html','originals-reader.js']:
    if not (A/name).is_file():issues.append(f'核心程序缺失：{name}')
if issues:
    print('NOT RELEASE READY：离线素材尚未齐全，禁止宣称APK已完成。')
    for i in issues:print('  - '+i)
    print('\n处理：Windows上运行“一键制作Android离线APK.bat”，该脚本先运行 prepare_offline.py 校验离线词书，并校验 20 本完整公版原著；网络不通时手动放到对应目录。')
    sys.exit(2)
print('OK：所有必要的离线素材均已齐全，可运行 python verify_assets.py，然后编译、真机测试 APK。')

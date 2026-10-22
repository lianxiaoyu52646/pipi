#!/usr/bin/env python3
# coding: utf-8
"""Reproducible, OFFLINE exam-study wordbooks from the app's licensed ECDICT data.

ECDICT tags are community classifications, NOT official CET/IELTS/TOEFL syllabi.
Existing manually/imported books are never overwritten unless --force is used.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
A=ROOT/'app/src/main/assets'
DB=A/'ecdict'
OUT=A/'wordbooks-data'
NAMES=('cet4','cet6','ielts','toefl')
FLOORS={'cet4':3600,'cet6':5000,'ielts':4600,'toefl':6500}
WORD=re.compile(r"[a-z][a-z\-']{0,47}")
CJK=re.compile(r'[\u3400-\u9fff]')

def clean_meaning(translation):
    trans=' '.join(str(translation or '').split())
    trans=trans.replace('\t',' ').replace('¦','；').replace('::', '：')
    return trans[:220]

def build():
    groups={k:{} for k in NAMES}
    parts=sorted(DB.glob('??.json'))
    if len(parts)!=256:raise ValueError(f'expected 256 ECDICT data shards, got {len(parts)}')
    count=0
    for p in parts:
        rows=json.loads(p.read_text('utf-8'))
        for word, row in rows.items():
            count+=1
            if not WORD.fullmatch(word):continue
            trans=clean_meaning(row.get('t'))
            if not CJK.search(trans):continue
            tags=set(str(row.get('g') or '').lower().split())
            try:rank=int(row.get('f') or 0)
            except (ValueError,TypeError):rank=0
            try:bnc=int(row.get('b') or 0)
            except (ValueError,TypeError):bnc=0
            rank=rank if rank>0 else 10**9
            bnc=bnc if bnc>0 else 10**9
            for k in tags.intersection(groups):
                groups[k][word]=(rank,bnc,trans)
    OUT.mkdir(parents=True,exist_ok=True)
    manifest={'source':'ECDICT bundled 256-shard dictionary, field g (exam community tags)',
              'source_license':'ECDICT_LICENSE.txt (bundled with the dictionary)',
              'disclaimer':'Community study classifications; not official exam vocabulary lists.',
              'source_entries':count,'generated_files':{}}
    return groups,manifest

def write(groups,manifest,force=False):
    for k,words in groups.items():
        if len(words)<FLOORS[k]:raise ValueError(f'{k} tag entries too few: {len(words)}')
        lines=[f'{w}\t{entry[2]}' for w,entry in sorted(words.items(),key=lambda p:(p[1][0],p[1][1],p[0]))]
        raw=('\n'.join(lines)+'\n').encode('utf-8')
        dest=OUT/(k+'.txt')
        if dest.exists() and not force:
            existing=dest.read_bytes()
            if existing==raw:
                print('VERIFIED existing ECDICT tags:',dest.name,'count',len(lines))
                origin='ecdict-tagged'
            else:
                print('KEEP imported or older list:',dest.name,'size',len(existing))
                origin='external-existing'
            actual=existing
        else:
            dest.write_bytes(raw)
            print('GENERATED',k,len(lines),'words',len(raw),'bytes')
            origin='ecdict-tagged'
            actual=raw
        manifest['generated_files'][k]={
            'source_kind':origin,
            'tagged_entries':len(lines),
            'entries_in_file':sum(b'\t' in ln for ln in actual.splitlines()),
            'sha256':hashlib.sha256(actual).hexdigest(),
            'bytes':len(actual)
        }
    (OUT/'ECDICT_TAG_SOURCE.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
    print('Dictionary-derived exam lists are community-tagged, not official exam syllabi.')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--force',action='store_true',help='regenerate and replace existing exam wordbooks')
    args=ap.parse_args()
    groups,manifest=build();write(groups,manifest,args.force)

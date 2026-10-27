#!/usr/bin/env python3
"""Precompute bounded per-chapter TTS assets without changing existing book IDs or clip text.
Run with --verify to fail closed on stale/corrupt precomputed assets.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'app/src/main/assets/voice-library'
DEST = ROOT / 'chapters'
MANIFEST = ROOT / 'chapter-manifest.json'

def sha(data): return hashlib.sha256(data).hexdigest()

def packed(obj): return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def main(verify=False):
    books = json.loads((ROOT/'index.json').read_text('utf-8'))
    planned=[]
    for book in books:
        book_id=book['id']
        source=(ROOT/f'{book_id}.json').read_bytes()
        sections=json.loads(source)['sections']
        assert len(sections)==book['chapters'], book_id
        position=0
        entries=[]
        for number,section in enumerate(sections,1):
            texts=section['sentences']
            content=packed({'sentences':texts})
            target=DEST/book_id/f'{number:03d}.json'
            if verify:
                assert target.exists() and target.read_bytes()==content, f'stale voice chapter {target}'
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(content)
            entries.append({'count':len(texts),'start':position,'sha256':sha(content)})
            position+=len(texts)
        assert position==book['sentences'], (book_id,position,book['sentences'])
        planned.append({'id':book_id,'sha256':sha(source),'chapters':entries})
    manifest=packed({'version':1,'books':planned})
    if verify:
        assert MANIFEST.exists() and MANIFEST.read_bytes()==manifest, 'chapter manifest out of sync'
    else:
        MANIFEST.write_bytes(manifest)
    assert sum(sum(x['count'] for x in b['chapters']) for b in planned)==82926
    print(('verified' if verify else 'generated'),len(books),'books',sum(len(b['chapters']) for b in planned),'chapters',sum(sum(x['count'] for x in b['chapters']) for b in planned),'segments')

if __name__=='__main__':
    a=argparse.ArgumentParser()
    a.add_argument('--verify',action='store_true')
    args=a.parse_args()
    main(args.verify)

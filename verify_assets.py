# coding: utf-8
"""Offline-only asset checks. No network access needed."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent
assets=root/'app/src/main/assets'
assert len(list((assets/'ecdict').glob('??.json')))==256
m=json.loads((assets/'ecdict/manifest.json').read_text('utf-8'))
assert m['entries']==770611 and m['shards']==256
books=sorted((assets/'books').glob('*.txt'))
assert len(books)==20
assert all(p.stat().st_size>100000 for p in books)
from prepare_tom import validate as validate_tom
ok,msg,info=validate_tom((assets/'books/tom.txt').read_bytes())
assert ok, 'Tom Sawyer source invalid: '+msg
book_manifest=json.loads((assets/'books_manifest.json').read_text('utf-8'))
assert len(book_manifest)==20 and set(x['id'] for x in book_manifest)==set(x.stem for x in books)
import hashlib
for row in book_manifest:
    payload=(assets/'books'/(row['id']+'.txt')).read_bytes()
    assert hashlib.sha256(payload).hexdigest()==row['sha256'], 'Book source SHA256 mismatch: '+row['id']

voice_index=json.loads((assets/'voice-library/index.json').read_text('utf-8'))
assert len(voice_index)==20 and set(x['id'] for x in voice_index)==set(x.stem for x in books), 'Offline voice library index is missing novels'
assert all((assets/'voice-library'/f"{x['id']}.json").is_file() for x in voice_index)
assert all(x['sentences']>100 and x['chapters']>0 for x in voice_index), 'Offline voice library malformed'

for key,num in [('primary',818),('junior',2584),('senior',2708)]:
    obj=json.loads((assets/f'schoolbooks/{key}.json').read_text('utf-8'))
    assert len(obj['words'])==num,(key,len(obj['words']))
for n in ['index.html','dictionary.html','originals-reader.html','backup.html']:
    s=(assets/n).read_text('utf-8')
    for path in re.findall(r'\b(?:src|href)=["\'](\./[^"\']+)',s):
        assert (assets/path.split('?',1)[0].split('#',1)[0]).exists(),(n,path)
android_manifest=(root/'app/src/main/AndroidManifest.xml').read_text('utf-8')
assert '<uses-permission android:name="android.permission.INTERNET"' not in android_manifest
js=(assets/'wordbooks.js').read_text('utf-8')
assert 'https://raw.githubusercontent.com/' not in js
assert "'./wordbooks-data/'+key+'.txt'" in js
assert all((assets/f'wordbooks-data/{key}.txt').exists() for key in ('cet4','cet6','ielts','toefl')), 'Four exam books must be pre-bundled'
print('Static validation PASSED: 256 ECDICT shards; 20 complete novels; 7 offline wordbooks; valid HTML; no INTERNET permission')
missing=[key for key in ('cet4','cet6','ielts','toefl') if not (assets/f'wordbooks-data/{key}.txt').exists()]
if missing:print('BEFORE BUILD: fetch four exam book files via prepare_offline.py:',', '.join(missing))
else:print('Exam wordbook files are present')

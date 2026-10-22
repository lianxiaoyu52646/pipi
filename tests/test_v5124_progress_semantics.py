"""Simulate real completion accounting against every packaged audiobook sentence.
Does not synthesize audio; tests duplicates, resume and total invariants.
"""
import json
from collections import Counter
from pathlib import Path
root=Path(__file__).resolve().parents[1]
lib=root/'app/src/main/assets/voice-library'
books=json.loads((lib/'index.json').read_text())
all_sentences=[]
for b in books:
    chapters=json.loads((lib/(b['id']+'.json')).read_text())['sections']
    for section in chapters:
        all_sentences.extend(section['sentences'])
assert len(all_sentences)==sum(x['sentences'] for x in books)>40000
counts=Counter(all_sentences)
for existing_fraction in [0, 1, 20, 65, 100]:
    # Deterministic existing keys to mimic old files and a process restart.
    existing=set(text for i,text in enumerate(counts) if i%100<existing_fraction)
    done=sum(1 for text in all_sentences if text in existing)
    unresolved=Counter(text for text in all_sentences if text not in existing)
    for text in all_sentences:
        if text not in existing:
            existing.add(text)
            done+=unresolved.pop(text,0)
    assert done==len(all_sentences),(existing_fraction,done,len(all_sentences))
    assert not unresolved
print(f'PASS multiday restart progress: {len(all_sentences)} sentence positions, {len(counts)} unique cache keys, duplicates and five prior-completion scenarios')

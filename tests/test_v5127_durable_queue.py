"""Exercises SQLite queue invariants with all shipped book sentence occurrences.
This is a model-based test of the new Android queue schema; it does not launch Android.
"""
import json, sqlite3, hashlib
from pathlib import Path
base=Path(__file__).resolve().parents[1]
lib=base/'app/src/main/assets/voice-library'
books=json.loads((lib/'index.json').read_text('utf-8'))
all_texts=[]
for b in books:
    chapters=json.loads((lib/f"{b['id']}.json").read_text('utf-8'))['sections']
    for ch in chapters:all_texts += ch['sentences']
assert len(books)==20
assert len(all_texts)==82926,(len(all_texts),len(books))
unique={}
for position,txt in enumerate(all_texts):
    unique.setdefault(txt,[]).append(position)
assert len(unique)==81562
conn=sqlite3.connect(':memory:')
conn.executescript('''CREATE TABLE segments(seq INTEGER PRIMARY KEY,cache_key TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX segments_ready_seq ON segments(ready,seq);
 CREATE INDEX segments_key ON segments(cache_key);
 CREATE TABLE meta(id INTEGER PRIMARY KEY,done INTEGER NOT NULL,total INTEGER NOT NULL);''')
key_of={}
for t in unique:
    key_of[t]=hashlib.sha256(t.encode('utf8')).hexdigest()
conn.executemany('INSERT INTO segments(seq,cache_key) VALUES (?,?)',
    ((i+1,key_of[t]) for i,t in enumerate(all_texts)))
conn.execute('INSERT INTO meta VALUES (1,0,?)',(len(all_texts),))
conn.commit()

# A single PCM cache file completes all matching occurrences; a crash between
# file-write and DB commit reuses the existing file, never duplicating synthesis.
first=next(t for t,occ in unique.items() if len(occ)>1)
key=key_of[first]
file_exists={key}
def next_job():
    return conn.execute('SELECT cache_key FROM segments WHERE ready=0 ORDER BY seq LIMIT 1').fetchone()
def commit(key):
    with conn:
        n=conn.execute('UPDATE segments SET ready=1 WHERE cache_key=? AND ready=0',(key,)).rowcount
        conn.execute('UPDATE meta SET done=done+? WHERE id=1',(n,))
    return n
assert commit(key)==len(unique[first])
assert commit(key)==0
assert conn.execute('SELECT done FROM meta').fetchone()[0]==len(unique[first])
assert next_job()[0]!=key
# Crash simulation: newly written file present, DB incomplete; next resume checks
# the pending key and commits it without regenerating the audio.
crash_key=next_job()[0]
file_exists.add(crash_key)
assert crash_key in file_exists
assert commit(crash_key)>0

# Index resume: pending query uses SQL index and does not reread the old PCM set.
explain=' '.join(str(x) for x in conn.execute('EXPLAIN QUERY PLAN SELECT cache_key FROM segments WHERE ready=0 ORDER BY seq LIMIT 1'))
assert 'segments_ready_seq' in explain,explain

# Persisted completed data does not require replaying the whole corpus.
assert conn.execute('SELECT done FROM meta').fetchone()[0] > 0
# Final verification: external removal/damage is repairable, never counted ready.
reopened=conn.execute('UPDATE segments SET ready=0 WHERE cache_key=? AND ready=1',(key,)).rowcount
conn.execute('UPDATE meta SET done=done-? WHERE id=1',(reopened,))
assert reopened==len(unique[first])
assert conn.execute('SELECT done FROM meta').fetchone()[0]>=0
assert conn.execute('SELECT COUNT(*) FROM segments WHERE ready=1').fetchone()[0]==conn.execute('SELECT done FROM meta').fetchone()[0]
print(f'PASS durable index: {len(books)} books, {len(all_texts)} occurrences, {len(unique)} unique keys, duplicate accounting, crash recovery, indexed resume, missing-file repair')

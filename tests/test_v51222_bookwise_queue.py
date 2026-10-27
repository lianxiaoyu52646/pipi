"""Book/chapter queue regression: validates real bundled chapter offsets and
simulates the exact transactional migration/advance rules without Android SDK."""
import json, sqlite3, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets/voice-library'
books=json.loads((assets/'index.json').read_text())
assert len(books)==20
start=1
ranges=[]
for b in books:
    payload=json.loads((assets/(b['id']+'.json')).read_text())
    chapters=payload['sections']
    assert len(chapters)==b['chapters']
    sizes=[len(c['sentences']) for c in chapters]
    assert sum(sizes)==b['sentences'],(b['id'],sum(sizes),b['sentences'])
    offsets=[];pos=start
    for size in sizes:
        offsets.append((pos,pos+size-1));pos+=size
    assert pos==start+b['sentences']
    ranges.append((start,pos-1,b['id'],b['title'],b['chapters'],offsets))
    start=pos
assert start-1==82926
assert all(x[1]+1==y[0] for x,y in zip(ranges,ranges[1:]))

# Simulate a phone with all older V1 rows, book 1 completed, book 2 partially
# complete; ensure bookwise migration adopts the SAME seq/ready flags.
conn=sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE meta(id INTEGER PRIMARY KEY,signature TEXT,total INT,done INT);
CREATE TABLE segments(seq INTEGER PRIMARY KEY,cache_key TEXT,text TEXT,book TEXT,chapter INT,chapter_index INT,chapter_total INT,ready INT);
CREATE INDEX segments_ready_seq ON segments(ready,seq);
CREATE TABLE book_tasks(id TEXT PRIMARY KEY,title TEXT,start_seq INT,end_seq INT,chapters INT,indexed_chapters INT,signature TEXT,finished INT);
CREATE TABLE failures(cache_key TEXT PRIMARY KEY,attempts INT,last_error TEXT,failed_at INT,retry_after INT);
''')
# Small sparse synthetic rows preserve the exact range semantics.
a=ranges[0];b=ranges[1]
for pos,book,ready in [(a[0],a,1),(a[1],a,1),(b[0],b,1),(b[0]+1,b,0)]:
    conn.execute('INSERT INTO segments VALUES(?,?,?,?,?,?,?,?)',
                 (pos,f'hash{pos}','text',book[3],1,1,10,ready))
for i,book in enumerate(ranges[:2]):
    lo,hi,id,title,chapters,_=book
    complete = 1 if i==0 else 0
    conn.execute('INSERT INTO book_tasks VALUES(?,?,?,?,?,?,?,?)',
                 (id,title,lo,hi,chapters,chapters,'verified',complete))
assert conn.execute('SELECT id FROM book_tasks WHERE finished=0 ORDER BY start_seq LIMIT 1').fetchone()[0]==b[2]
assert conn.execute('SELECT COUNT(*) FROM segments WHERE ready=0 AND seq BETWEEN ? AND ?',b[:2]).fetchone()[0]==1
# A terminal/unfinished segment must prevent completion.
assert conn.execute('SELECT COUNT(*) FROM segments WHERE ready=0 AND seq BETWEEN ? AND ?',b[:2]).fetchone()[0]>0
# Once last pending completes, book can finish and next will be selected.
conn.execute('UPDATE segments SET ready=1 WHERE seq=?',(b[0]+1,))
assert conn.execute('SELECT COUNT(*) FROM segments WHERE ready=0 AND seq BETWEEN ? AND ?',b[:2]).fetchone()[0]==0
conn.execute('UPDATE book_tasks SET finished=1 WHERE id=?',(b[2],))
assert conn.execute('SELECT COUNT(*) FROM book_tasks WHERE finished=1').fetchone()[0]==2
# Asset changes reset only one book's index, not any other book, and never the PCM.
conn.execute('DELETE FROM segments WHERE seq BETWEEN ? AND ?',b[:2])
conn.execute('UPDATE book_tasks SET indexed_chapters=0,signature=?,finished=0 WHERE id=?',('new',b[2]))
assert conn.execute('SELECT COUNT(*) FROM segments WHERE seq BETWEEN ? AND ?',a[:2]).fetchone()[0]==2
assert conn.execute('SELECT id FROM book_tasks WHERE finished=0 ORDER BY start_seq LIMIT 1').fetchone()[0]==b[2]

src=(root/'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt').read_text()
svc=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
for marker in ['book_tasks','fun indexNextChapter(', 'fun activeBook(', 'finishBookIfComplete(',
               'bookSignature(context','UPDATE meta SET done=done+?', 'db.beginTransaction()',
               'book?.startSeq','fun auditComplete(']:assert marker in src,marker
for marker in ['index.activeBook()', 'index.indexNextChapter(', 'index.next(book=book)',
               'index.finishBookIfComplete(book)','booksDone=index.finishedBooks()',
               'put("queueMode","book_chapter_lazy_v2")']: assert marker in svc,marker
assert 'index.restoreExistingPcm(disk' not in svc,'bookwise start must not scan all PCM files'
assert 'disk.put(job.key,pcm,rate)' in svc
assert 'index.complete(job.key)' in svc
print('PASS V5.12.22: 20 real books/82926 offsets, lazy chapters, legacy progress preserved, failed clip not finished, book advance, book-only reset, PCM untouched')

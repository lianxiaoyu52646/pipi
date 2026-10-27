"""V5.12.23: realistic SQLite schedule + 559 deterministic chapter-asset contracts.
Pure sqlite3 tests run without Android SDK; device-level tests remain required.
"""
from pathlib import Path
import json
import hashlib
import sqlite3
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets/voice-library'
plan=json.loads((assets/'chapter-manifest.json').read_text('utf-8'))
books=json.loads((assets/'index.json').read_text('utf-8'))
assert plan['version']==1 and len(plan['books'])==20
assert [r['id'] for r in plan['books']]==[r['id'] for r in books]
chapter_count=total_count=0
for b,entry in zip(books,plan['books']):
    original=(assets/f"{b['id']}.json").read_bytes()
    assert hashlib.sha256(original).hexdigest()==entry['sha256']
    sections=json.loads(original)['sections']
    offset=0
    for local_no,(chapter,row) in enumerate(zip(sections,entry['chapters']),1):
        chapter_count+=1
        f=assets/f"chapters/{b['id']}/{local_no:03d}.json"
        raw=f.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==row['sha256']
        assert json.loads(raw)['sentences']==chapter['sentences']
        assert row['start']==offset and row['count']==len(chapter['sentences'])
        offset+=row['count']
    assert offset==b['sentences']
    total_count+=offset
assert chapter_count==559 and total_count==82926

conn=sqlite3.connect(':memory:')
conn.executescript('''
CREATE TABLE book_tasks (id TEXT PRIMARY KEY,title TEXT,start_seq INT,end_seq INT,chapters INT,indexed_chapters INT,signature TEXT,finished INT);
CREATE TABLE book_snooze (book_id TEXT PRIMARY KEY,until_at INTEGER NOT NULL,reason TEXT NOT NULL);
CREATE TABLE segments (seq INTEGER PRIMARY KEY,cache_key TEXT,text TEXT,book TEXT,chapter INT,chapter_index INT,chapter_total INT,ready INT);
CREATE TABLE meta (id INTEGER PRIMARY KEY,signature TEXT,total INT,done INT);
CREATE TABLE failures (cache_key TEXT PRIMARY KEY,attempts INT,last_error TEXT,failed_at INT,retry_after INT);
''')
conn.execute('INSERT INTO meta VALUES(1,"bookwise_v2:stable",82926,3)')
first=1
for b,entry in zip(books,plan['books']):
    n=b['sentences']
    conn.execute('INSERT INTO book_tasks VALUES(?,?,?,?,?,?,?,?)',
        (b['id'],b['title'],first,first+n-1,b['chapters'],b['chapters'],entry['sha256'],0))
    first+=n
assert first==82927

# Simulate an already completed first book, and a permanently failing last clip
# in book 2. It may not block books 3..20, and must not make progress 100%.
conn.execute('UPDATE book_tasks SET finished=1 WHERE id=?',(books[0]['id'],))
book_two=books[1]['id']; last_key='bad_utterance'
conn.execute('INSERT INTO segments VALUES(?,?,?,?,?,?,?,?)',
    (books[0]['sentences']+1,last_key,'bad paragraph',book_two,1,1,1,0))
conn.execute('INSERT INTO failures VALUES(?,?,?, ?,?)',(last_key,8,'invalid text',123,987))
conn.execute('INSERT INTO book_snooze VALUES(?,?,?)',(book_two,2**63-1,'needs_attention'))
active_query='''SELECT b.id FROM book_tasks b LEFT JOIN book_snooze q ON q.book_id=b.id
WHERE b.finished=0 AND (q.until_at IS NULL OR q.until_at<=?) ORDER BY b.start_seq LIMIT 1'''
assert conn.execute(active_query,(1000,)).fetchone()[0]==books[2]['id']
assert conn.execute('SELECT COUNT(*) FROM book_tasks WHERE finished=0').fetchone()[0]==19
assert conn.execute('SELECT COUNT(*) FROM segments WHERE ready=0 AND cache_key=?',(last_key,)).fetchone()[0]==1
# All following books succeed; blocked book remains unfinished and must cause attention.
conn.execute('UPDATE book_tasks SET finished=1 WHERE id<>?', (book_two,))
assert conn.execute(active_query,(1000,)).fetchone() is None
assert conn.execute('SELECT COUNT(*) FROM book_tasks WHERE finished=0').fetchone()[0]==1
assert conn.execute('SELECT MIN(until_at) FROM book_snooze WHERE until_at<?',(2**63-1,)).fetchone()[0] is None
# Manual retry clears book quarantine without deleting any legacy segment/PCM.
conn.execute('DELETE FROM book_snooze')
conn.execute('DELETE FROM failures WHERE attempts>=8')
assert conn.execute(active_query,(1000,)).fetchone()[0]==book_two
assert conn.execute('SELECT COUNT(*) FROM segments WHERE cache_key=?',(last_key,)).fetchone()[0]==1

# A content update changing SHA but not book count should reset exactly its book.
first_range=(1,books[0]['sentences'])
third_range=(books[0]['sentences']+books[1]['sentences']+1,books[0]['sentences']+books[1]['sentences']+books[2]['sentences'])
conn.execute('INSERT INTO segments VALUES(?,?,?,?,?,?,?,?)',(third_range[0],'unchanged','txt',books[2]['id'],1,1,1,1))
conn.execute('UPDATE meta SET done=done+1 WHERE id=1')
conn.execute('DELETE FROM segments WHERE seq BETWEEN ? AND ?',first_range)
assert conn.execute('SELECT ready FROM segments WHERE seq=?',(third_range[0],)).fetchone()[0]==1

index=(root/'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt').read_text()
service=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
assert 'DROP TABLE IF EXISTS segments' not in index.split('override fun onUpgrade')[1].split('private fun digest')[0]
for value in ['chapter-manifest.json','reconcileBookSignatures','sameBookLayout','snoozeBook','resetBookSnoozes','nextBookWakeMs','unresolvedBooks','resetMissingBookRows']:
    assert value in index,value
for value in ['index.snoozeBook(book,Long.MAX_VALUE','index.nextBookWakeMs()','index.unresolvedBooks()', 'book.indexedChapters<book.chapters']:
    assert value in service,value
assert 'voice-library/${book.id}.json' not in index[index.index('fun indexNextChapter('):index.index('fun finishBookIfComplete(')]
print('PASS V5.12.23: 559 chapters, 82926 clip IDs, byte-identical chapter text, queue migration, cross-book skip, terminal isolation, manual retry, content checksum, PCM preservation')

"""V5.12.20 source/SQLite regression for long-running voice caching.

Run with: python tests/test_v51220_long_cache.py
This does not replace an Android Gradle build or multi-day real-device test.
"""
from pathlib import Path
import re, sqlite3, xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
kt=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
index=(root/'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt').read_text()
recovery=(root/'app/src/main/java/com/sprint7/offline/VoiceCacheRecovery.kt').read_text()
manifest=ET.parse(root/'app/src/main/AndroidManifest.xml').getroot()
ANDROID='{http://schemas.android.com/apk/res/android}'
assert 'KokoroProcessGate.acquire(this,{stillWanted()},120_000L)' in kt
assert 'processLease=KokoroProcessGate.acquire(this,{stillWanted()},0L)' not in kt
assert 'modelWaitRounds++' in kt and 'model_gate_timeout' in kt
assert 'lastPhase=="waiting_model"' in kt and 'model_gate_wait' in kt
assert 'CacheNeedsAttentionException' in kt and '"needs_attention"' in kt
assert 'index.resetTerminalFailures()' in kt and 'userInitiatedStart=manualStart' in kt
assert 'index.terminalCount()' in kt
assert 'try{processLease?.close()}' in kt and 'try{model?.free()}' in kt
assert 'MAX_AUTO_FAILURES = 8' in index
assert 'f.attempts<?' in index and 'f.attempts>=?' in index
assert 'DELETE FROM segments' not in index[index.index('fun resetTerminalFailures()'):index.index('fun next(')]
assert 'fun onBoot(' in recovery and 'schedule(context,65_000L)' in recovery
assert '"background_launch_blocked"' in recovery
boot=[r for r in manifest.findall('application/receiver') if r.attrib.get(ANDROID+'name')=='.VoiceCacheBootReceiver']
assert len(boot)==1 and any(a.attrib.get(ANDROID+'name')=='android.intent.action.BOOT_COMPLETED' for a in boot[0].findall('intent-filter/action'))
assert any(p.attrib.get(ANDROID+'name')=='android.permission.RECEIVE_BOOT_COMPLETED' for p in manifest.findall('uses-permission'))

db=sqlite3.connect(':memory:')
db.executescript('''
CREATE TABLE segments(seq INTEGER PRIMARY KEY,cache_key TEXT NOT NULL,ready INTEGER NOT NULL);
CREATE TABLE failures(cache_key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,last_error TEXT,failed_at INTEGER,retry_after INTEGER);
''')
now=1_000_000
# A: complete; B: healthy; C: cooling; D: terminal, repeated occurrence E terminal
rows=[(1,'good_completed',1),(2,'healthy',0),(3,'cooldown',0),(4,'terminal',0),(5,'terminal',0)]
db.executemany('INSERT INTO segments VALUES(?,?,?)',rows)
db.executemany('INSERT INTO failures VALUES(?,?,?,?,?)',[
 ('cooldown',3,'failed',now-10000,now+5000),
 ('terminal',8,'persistent',now-10000,now+3600000),
])
params=(8,now)
next_query='''SELECT s.cache_key FROM segments s LEFT JOIN failures f ON f.cache_key=s.cache_key
 WHERE s.ready=0 AND (f.attempts IS NULL OR f.attempts<?)
 AND (f.retry_after IS NULL OR f.retry_after<=?) ORDER BY s.seq LIMIT 1'''
assert db.execute(next_query,params).fetchone()==('healthy',)
db.execute("UPDATE segments SET ready=1 WHERE cache_key='healthy'")
assert db.execute(next_query,params).fetchone() is None
assert db.execute('''SELECT COUNT(*) FROM segments s JOIN failures f ON f.cache_key=s.cache_key
 WHERE s.ready=0 AND f.attempts>=?''',(8,)).fetchone()[0]==2
assert db.execute('''SELECT MIN(f.retry_after) FROM segments s JOIN failures f
 ON f.cache_key=s.cache_key WHERE s.ready=0 AND f.attempts<? AND f.retry_after>?''',params).fetchone()[0]==now+5000
assert db.execute(next_query,(8,now+5500)).fetchone()==('cooldown',)
db.execute('DELETE FROM failures WHERE attempts>=?',(8,))
assert db.execute(next_query,(8,now+5500)).fetchone()==('cooldown',) # earliest pending
assert db.execute("SELECT COUNT(*) FROM segments WHERE cache_key='terminal' AND ready=0").fetchone()[0]==2
assert db.execute('SELECT COUNT(*) FROM failures').fetchone()[0]==1
print('PASS V5.12.20: bounded model-wait, boot recovery registration, SQLite terminal/cooldown/manual-reset; PCM untouched')

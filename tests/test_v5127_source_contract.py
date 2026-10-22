from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
i=(root/'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt').read_text()
u=(root/'app/src/main/assets/voice-cache.html').read_text()
assert 'lastDone=0;lastTotal=0;lastPhase="starting"' not in s
assert 'VoiceCacheRecovery.status(this)' in s
assert 'VoiceCacheIndex(this,lastSpeaker,lastSpeed)' in s
assert 'index.next()' in s and 'index.complete(job.key)' in s
assert 'index.auditComplete' in s
assert 'VoiceCacheIndex.deleteAll(this)' in s
assert s.index('check(disk.has(job.key))')<s.rindex('val added=index.complete(job.key)')
assert 'CREATE INDEX segments_ready_seq ON segments(ready,seq)' in i
assert 'db.beginTransaction()' in i and 'db.setTransactionSuccessful()' in i
assert 'signature(context)' in i
assert 'VoiceCacheIndex.deleteFor(this' in s
assert 'lastRestartReason' in s
assert all(t in u for t in ['realClips','realBytes','realSpeed','recoveryCount','正在快速恢复缓存任务'])
assert "s.phase==='generating'" in u
assert (root/'app/src/main/assets/app-version.js').read_text().strip()=="window.PipiBuildVersion = '5.12.7';"
assert "versionName '5.12.7'" in (root/'app/build.gradle').read_text()
print('PASS source contracts for durable queue, resume, atomic write accounting, UI and version')

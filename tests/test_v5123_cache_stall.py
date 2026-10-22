"""V5.12.3 stall regression: no false running, no sleep without CPU wake, no 90s PCM failure loop.
These checks don't replace overnight Android runtime tests.
"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
service=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
cache=(root/'app/src/main/java/com/sprint7/offline/NarrationAudioCache.kt').read_text()
guard=(root/'app/src/main/java/com/sprint7/offline/KokoroModelGuard.kt').read_text()
reader=(root/'app/src/main/java/com/sprint7/offline/ArticleVoiceEngine.kt').read_text()
ui=(root/'app/src/main/assets/voice-cache.html').read_text()
assert 'lastProgressAt' in service and 'lastWrittenAt' in service
assert 'lastProgressAt=System.currentTimeMillis()' in service
assert 'lastWrittenAt=lastProgressAt' in service
assert 'monitorProgress()' in service and 'STALLED' not in service
assert 'Process.killProcess(Process.myPid())' in service and 'VoiceCacheRecovery.schedule(this' in service
assert 'WeakReference<ArticleVoiceEngine>' in guard
assert 'KokoroModelGuard.registerReader(this)' in reader
assert 'KokoroModelGuard.unregisterReader(this)' in reader
assert 'private val maxClipSeconds = 300' in cache
assert 'rate * 90' not in cache and 'sampleRate * 90' not in cache
# Lock must not drop during retry or storage polling.
sleep=service.split('private fun sleepUntilRetry(ms:Long)',1)[1].split('private fun execute()',1)[0]
space=service.split('private fun waitForSpace():Boolean',1)[1].split('private fun sleepUntilRetry',1)[0]
assert 'releaseWake()' not in sleep and 'ensureAwake()' in sleep
assert 'releaseWake()' not in space and 'ensureAwake()' in space
assert "const suspicious=s.state==='running'" in ui
assert "s.state==='running'&&!suspicious&&s.phase==='generating'" in ui
assert "距离上次真实完成片段" in ui
assert 'versionName \'5.12.7\'' in (root/'app/build.gradle').read_text()
print('PASS V5.12.3 cache-stall source regression')

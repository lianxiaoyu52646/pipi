"""Static integration regression for V5.12.1 user-initiated continuous audiobook caching.
Runtime and battery limits still require Android on-device validation.
"""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
java=(root/'app/src/main/java/com/sprint7/offline/MainActivity.java').read_text()
service=(root/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
html=(root/'app/src/main/assets/voice-cache.html').read_text()
manifest=(root/'app/src/main/AndroidManifest.xml').read_text()

def between(text, start, end):
    return text.split(start, 1)[1].split(end,1)[0]

speak=between(java, '@JavascriptInterface public void speakArticle(', '@JavascriptInterface public void appendArticle(')
assert 'ACTION_PAUSE' not in re.sub(r'//[^\n]*', '', speak), 'Narration still automatically pauses caching'
assert 'LibraryVoiceCacheService.isActive()' in speak
assert 'shouldResume(getApplicationContext())' in speak
assert 'article-error' in speak, 'Reader must get feedback instead of waiting silently for model lock'
assert re.search(r'@JavascriptInterface public void pauseLibraryVoiceCache\(', java)
assert 'ACTION_PAUSE' in between(java,'@JavascriptInterface public void pauseLibraryVoiceCache(', '@JavascriptInterface public void clearLibraryVoiceCache(')
assert 'void onResume()' in java and 'ACTION_RESTORE' in java

start=between(service,'override fun onStartCommand(', 'private fun startWorker(')
assert 'ACTION_START' in start and 'START_STICKY' in start, 'Service cannot recover after process reclaim'
assert 'null, ACTION_RESTORE' in start, 'Null intent restart must retain the previous job'
assert re.search(r'ACTION_PAUSE\s*->\s*\{[\s\S]*?rememberDesired\(false\)', start)
assert 'putInt("speaker",speaker)' in start and 'putFloat("speed",speed)' in start
assert 'ACTION_CLEAR' in start and 'pauseRequested=true' not in between(start,'ACTION_CLEAR ->','ACTION_START ->')
assert 'VoiceCacheRecovery.desired(this)' in service
assert 'rememberDesired(false)' not in between(service,'private fun cacheAll()', 'private fun loadModel()')
assert 'waitForSpace()' in service and 'waiting_storage' in service
assert 'retrying' in service and 'sleepUntilRetry' in service
assert 'android:process=":voice_cache"' in manifest, 'Native model must be isolated to allow watchdog recovery'
assert 'VoiceCacheRecovery.request(this' in service
assert 'PARTIAL_WAKE_LOCK' in service and 'releaseWake()' in service
assert 'FOREGROUND_SERVICE_SPECIAL_USE' in manifest and 'FOREGROUND_SERVICE' in manifest
assert '用户手动暂停' in html or '手动暂停' in html
assert "versionName '5.12.6'" in (root/'app/build.gradle').read_text()
assert 'pipi-kokoro-library-v1' in service, 'Cache must preserve existing files'
print('PASS V5.12.1 uninterrupted caching source contract: explicit pause only; sticky recovery; persisted intent; storage wait; retries; reader isolation; compatible cache folder')

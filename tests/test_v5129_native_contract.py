from pathlib import Path
r=Path(__file__).resolve().parents[1];java=r/'app/src/main/java/com/sprint7/offline'
a=(java/'ArticleVoiceEngine.kt').read_text();m=(java/'MainActivity.java').read_text();i=(java/'VoiceCacheIndex.kt').read_text();d=(java/'NarrationAudioCache.kt').read_text();s=(java/'StudyStateStore.java').read_text()
assert 'fun speakCachedBatch' in a and 'if(run.cacheOnly)error(' in a
assert a.index('val clip = memory ?: persisted ?: run {') < a.index('KokoroModelGuard.gate.acquire()',a.index('private fun produce('))
assert 'articleVoice.speakCachedBatch(' in m and 'setAction(LibraryVoiceCacheService.ACTION_PAUSE)' not in m[m.index('@JavascriptInterface public void speakArticle('):m.index('@JavascriptInterface public void appendArticle(')]
assert 'CREATE TABLE IF NOT EXISTS import_state' in i and 'if(seq<checkpoint){seq++;continue}' in i
assert 'if(seq-nextBatch>=1000)' in i and 'UPDATE import_state SET processed=?, verified=?' in i
assert 'hasDeep(key)' in i and 'fun hasDeep(key:String)' in d and 'digestFile(key).writeText(' in d
assert 'saveReaderProgressToSQLite' in m and 'getReaderProgressFromSQLite' in m
assert 'writeReaderProgress(String raw)' in s and 'public synchronized boolean clear()' in s
assert "versionName '5.12.9'" in (r/'app/build.gradle').read_text()
print('PASS V5.12.9 native source: cache-first audio, persistent batch index, checksum audit and reading progress SQLite')

from pathlib import Path
import json,re,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1];src=root/'app/src/main';assets=src/'assets';native=src/'java/com/sprint7/offline'
books=json.loads((assets/'voice-library/index.json').read_text());assert len(books)==9
assert sum(x['sentences'] for x in books)==42264
for book in books:
 data=json.loads((assets/'voice-library'/f'{book["id"]}.json').read_text())
 assert len(data['sections'])==book['chapters']
 assert sum(len(s['sentences']) for s in data['sections'])==book['sentences']
 assert all(0<len(t)<=1400 for s in data['sections'] for t in s['sentences'])
assert 'voice-cache.html' in (assets/'app.js').read_text()
html=(assets/'voice-cache.html').read_text();assert all(x in html for x in ['startLibraryVoiceCache','pauseLibraryVoiceCache','clearLibraryVoiceCache','getLibraryVoiceCacheStatus'])
manifest=(src/'AndroidManifest.xml').read_text()
assert 'foregroundServiceType="specialUse"' in manifest and 'FOREGROUND_SERVICE_SPECIAL_USE' in manifest and 'WAKE_LOCK' in manifest
k=(native/'LibraryVoiceCacheService.kt').read_text();a=(native/'ArticleVoiceEngine.kt').read_text();m=(native/'MainActivity.java').read_text()
assert 'PowerManager.PARTIAL_WAKE_LOCK' in k and 'publish("running")' in k
assert 'Long.MAX_VALUE,Int.MAX_VALUE' in k and 'Long.MAX_VALUE, Int.MAX_VALUE' in a
assert ('KokoroModelGuard.gate' in k or 'android:process=":voice_cache"' in manifest) and 'KokoroModelGuard.gate' in a
assert 'pipi-kokoro-library-v1' in k and 'LibraryVoiceCacheService.cacheFolder' in a
for method in ['startLibraryVoiceCache','pauseLibraryVoiceCache','clearLibraryVoiceCache','getLibraryVoiceCacheStatus']:
 assert method in m
assert (native/'NarrationBufferPolicy.kt').exists()
assert (native/'KokoroModelGuard.kt').exists()
assert re.search(r"versionName '5\.(?:10|11|12)\.\d+'",(root/'app/build.gradle').read_text())
print('PASS V5.10.9: 9 books 42264 exact reader segments, Android foreground permissions, native JS bridge, shared permanent storage, guarded Kokoro, dependent Kotlin source files')

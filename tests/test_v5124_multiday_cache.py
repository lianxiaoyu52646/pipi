"""V5.12.4 static architecture checks; not a substitute for Android overnight testing."""
from pathlib import Path
import xml.etree.ElementTree as ET
r=Path(__file__).resolve().parents[1]
base=r/'app/src/main'
serv=(base/'java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
reco=(base/'java/com/sprint7/offline/VoiceCacheRecovery.kt').read_text()
manifest=(base/'AndroidManifest.xml').read_text()
voice=(base/'java/com/sprint7/offline/NarrationSynthesisPlan.kt').read_text()
assert 'android:process=":voice_cache"' in manifest
assert 'VoiceCacheRecoveryReceiver' in manifest
assert 'START_STICKY' in serv and 'startForeground(' in serv
assert 'PowerManager.PARTIAL_WAKE_LOCK' in serv
assert 'VoiceCacheRecovery.publish(this,json)' in serv
assert 'VoiceCacheRecovery.desired(context)' in serv
assert 'VoiceCacheRecovery.schedule(this,35_000L)' in serv
assert 'Process.killProcess(Process.myPid())' in serv
assert 'WATCHDOG_RECYCLE_MS' in serv and 'nativeHang' in serv and 'modelHang' in serv and 'writeHang' in serv
assert 'AlarmManager.ELAPSED_REALTIME_WAKEUP' in reco and 'setAndAllowWhileIdle' in reco
assert 'AtomicFile' in reco and 'Context' in reco and 'VoiceCacheRecovery.onTick' in reco
assert 'startForegroundService' in reco and 'HEARTBEAT_STALE_MS' in reco
assert 'VoiceCacheRecovery.request(this,wants' in serv
assert 'rememberDesired(false)' not in serv.split('}catch(e:Throwable) {',1)[1].split('    /** A retry safely',1)[0]
assert 'missingOccurrences' in serv and 'lastDone+=missingOccurrences.remove(key)' in serv
assert 'lastWrittenAt=System.currentTimeMillis()' in serv and 'activeSynthesisAt' in serv
assert 'NarrationSynthesisPlan.pieces(text)' in serv and 'maxChars: Int = 220' in voice
assert 'numThreads=minOf(4,maxOf(2,Runtime.getRuntime().availableProcessors()-1))' in serv
assert "versionName '5.12.6'" in (r/'app/build.gradle').read_text()
assert 'pipi-kokoro-library-v1' in serv
assert len(list((base/'assets/voice-library').glob('*.json')))>=9
ET.parse(base/'AndroidManifest.xml')
print('PASS V5.12.4 isolated-process watchdog, durable intent, alarm retry, truthful progress, native segmentation')

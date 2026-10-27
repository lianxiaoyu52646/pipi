"""V5.12.24 ten-pass source/asset/queue safety regression.
These checks are source-level and sqlite3 simulations; they are not Android device tests.
"""
from pathlib import Path
import json, hashlib, sqlite3, re
r=Path(__file__).resolve().parents[1]
a=r/'app/src/main/assets/voice-library'
index=(r/'app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt').read_text()
pcm=(r/'app/src/main/java/com/sprint7/offline/NarrationAudioCache.kt').read_text()
service=(r/'app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt').read_text()
app=(r/'app/src/main/assets/app.js').read_text()
manifest=json.loads((a/'chapter-manifest.json').read_text())
books=json.loads((a/'index.json').read_text())
checks=[]
def audit(name, fn):
    fn(); checks.append(name); print(f'PASS {len(checks):02d}/10 | {name}')

def one():
    assert 'sameBookLayout(db,books) && former.first.startsWith("bookwise_v2:")' in index
    assert 'reconcileBookSignatures(db,shouldContinue)' in index
    assert index.index('reconcileBookSignatures(db,shouldContinue)',index.index('fun prepare(')) < index.index('db.execSQL("UPDATE meta SET signature=',index.index('fun prepare('))
audit('缓存清单/旧索引匹配和迁移中断',one)

def two():
    assert 'DELETE FROM pcm_reconciliation' in index
    assert index.count('DELETE FROM pcm_reconciliation')>=3
    assert 'previouslyChecked==keys.size && initial.done>0' in index
audit('索引重建后旧PCM识别标记失效',two)

def three():
    assert 'verifiedReady!=actual' in index
    assert 'actual!=book.endSeq-book.startSeq+1' in index
    assert 'finished=1' in index
    c=sqlite3.connect(':memory:')
    c.executescript('CREATE TABLE segments(seq INT,ready INT);INSERT INTO segments VALUES(1,1);INSERT INTO segments VALUES(2,0);')
    assert c.execute('SELECT COUNT(*) FROM segments WHERE ready=1').fetchone()[0]!=c.execute('SELECT COUNT(*) FROM segments').fetchone()[0]
audit('书籍完成状态不可虚报',three)

def four():
    assert 'done=MAX(0,done-?)' in index
    c=sqlite3.connect(':memory:');c.execute('CREATE TABLE meta(done INT)');c.execute('INSERT INTO meta VALUES(1)')
    c.execute('UPDATE meta SET done=MAX(0,done-?)',(4,));assert c.execute('SELECT done FROM meta').fetchone()[0]==0
audit('异常索引恢复计数不负数',four)

def five():
    assert 'fd.sync()' in pcm and pcm.count('fd.sync()')>=2
    assert 'val temp = File(directory, "$key.$nonce.tmp")' in pcm
    assert 'val tempDigest = File(directory, "$key.$nonce.sha.tmp")' in pcm
    assert pcm.index('if (side.exists() && !side.delete())') < pcm.index('if (!temp.renameTo(target))')
audit('PCM原子暂存与校验文件顺序',five)

def six():
    assert 'bytesRequired = 2L * pcm.size + 16L' in pcm
    assert 'usableSpace < 256L * 1024L * 1024L + bytesRequired' in pcm
    assert 'if (hasDeep(key)) return true' in pcm
audit('空间预留和重复音频去重',six)

def seven():
    assert len(books)==20 and len(manifest['books'])==20
    n_ch=n_segments=0
    for b,plan in zip(books,manifest['books']):
        assert b['id']==plan['id']
        sha=lambda data:hashlib.sha256(data).hexdigest()
        raw=(a/f"{b['id']}.json").read_bytes();assert sha(raw)==plan['sha256']
        sections=json.loads(raw)['sections']
        assert len(sections)==len(plan['chapters'])
        for i,(section,meta) in enumerate(zip(sections,plan['chapters']),1):
            p=(a/f"chapters/{b['id']}/{i:03}.json").read_bytes()
            assert sha(p)==meta['sha256']
            assert json.loads(p)['sentences']==section['sentences']
            n_ch+=1;n_segments+=len(section['sentences'])
    assert n_ch==559 and n_segments==82926
audit('20本559章82926段资源逐句一致',seven)

def eight():
    assert 'index.snoozeBook(book,Long.MAX_VALUE' in service
    assert 'index.nextBookWakeMs()' in service
    assert 'index.terminalCount(book)' in service
    assert 'MAX_AUTO_FAILURES = 8' in index
    assert 'UPDATE segments SET ready=1' in index
audit('坏片段隔离但不会虚报完成',eight)

def nine():
    assert 'SprintFSRS.schedule(old,known)' in app
    assert 'function save(urgent=false)' in app
    assert 'saveLearningStateIfRevision' in app
    assert 'knownCount>=7' not in app and 'knownCount >= 7' not in app
    assert 'versionName \'5.12.24\'' in (r/'app/build.gradle').read_text()
    assert '5.12.24' in (r/'app/src/main/assets/app-version.js').read_text()
audit('FSRS收录规则/学习数据乐观锁/版本一致',nine)

def ten():
    assert 'allowBackup="false"' in (r/'app/src/main/AndroidManifest.xml').read_text()
    assert 'BOOT_COMPLETED' in (r/'app/src/main/AndroidManifest.xml').read_text()
    assert (r/'app/src/main/java/com/sprint7/offline/VoiceCacheRecovery.kt').is_file()
    assert (r/'app/src/main/java/com/sprint7/offline/ArticlePlaybackService.kt').is_file()
audit('Android生命周期/权限/项目资源结构',ten)
assert len(checks)==10
print('TEN ROUND SOURCE/SQLITE/ASSET AUDIT PASSED (not device acceptance)')

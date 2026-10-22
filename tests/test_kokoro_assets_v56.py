from pathlib import Path
import io,tarfile,tempfile,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from prepare_v56_voice import unpack_kokoro,kokoro_ok,ARCHIVE_DIR

def archive(path,evil=False):
    with tarfile.open(path,'w:bz2') as tar:
        names={
            'model.int8.onnx':b'\0'*41_000_000,
            'voices.bin':b'1'*1_010_000,
            'tokens.txt':b'w'*700,
            'LICENSE':b'Apache License 2.0',
        }
        for i in range(6):names[f'espeak-ng-data/{i}.dat']=b'x'*30
        if evil:names['../breakout.txt']=b'x'
        for name,data in names.items():
            obj=tarfile.TarInfo(f'{ARCHIVE_DIR}/{name}');obj.size=len(data);tar.addfile(obj,io.BytesIO(data))
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);file=root/'kokoro.tar.bz2';out=root/'model'
    archive(file);unpack_kokoro(file,out);assert kokoro_ok(out)
    archive(file,evil=True)
    try:unpack_kokoro(file,root/'unsafe');raise AssertionError('Path traversal accepted')
    except ValueError:pass
    assert not (root/'unsafe').exists()
print('PASS: Kokoro model content checks, safe tar import and missing-model rejection')

from pathlib import Path
import io, tarfile, tempfile, sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from prepare_offline_voice import extract_model,model_ok

def make_archive(path:Path,evil=False):
    with tarfile.open(path,'w:bz2') as tf:
        prefix='vits-piper-en_US-lessac-low/'
        names=[prefix+'en_US-lessac-low.onnx',prefix+'tokens.txt',
               *[prefix+'espeak-ng-data/'+str(i)+'.dat' for i in range(4)]]
        if evil:names+=['../../outside-dangerous-file']
        for n in names:
            data= b'0'*(10_000_004 if n.endswith('.onnx') else 20)
            info=tarfile.TarInfo(n);info.size=len(data)
            tf.addfile(info, io.BytesIO(data))

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    archive=root/'model.tar.bz2'
    make_archive(archive)
    extract_model(archive,root/'tts')
    assert model_ok(root/'tts')
    make_archive(archive,evil=True)
    try:extract_model(archive,root/'bad');raise AssertionError('unsafe member allowed')
    except RuntimeError as exc:assert '路径' in str(exc)
    assert not (root/'bad').exists()
print('PASS: model archive extraction, completeness and path traversal prevention')

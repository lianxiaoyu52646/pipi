#!/usr/bin/env python3
"""Package Piper + Kokoro into the MAIN Android APK at build time.

The *phone* needs no download, text-to-speech system service or permissions.
Run this on the build computer. Gradle rejects builds without both resources.
"""
from __future__ import annotations
import argparse
import hashlib
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent
KOKORO=ROOT/'app/src/main/assets/tts/kokoro-int8-en-v0_19'
KOKORO_URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-en-v0_19.tar.bz2'
ARCHIVE_DIR='kokoro-int8-en-v0_19'
MODEL_NAME='model.int8.onnx'

sys.path.insert(0,str(ROOT))
from prepare_offline_voice import verify as piper_verify, main as piper_main, download as fetch


def sha256(path:Path)->str:
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for piece in iter(lambda:stream.read(1024*1024),b''):
            digest.update(piece)
    return digest.hexdigest()


def kokoro_ok(base:Path=KOKORO)->bool:
    try:
        return ((base/MODEL_NAME).stat().st_size>40_000_000 and
                (base/'voices.bin').stat().st_size>1_000_000 and
                (base/'tokens.txt').stat().st_size>500 and
                (base/'LICENSE').is_file() and
                len(list((base/'espeak-ng-data').iterdir()))>5)
    except (OSError,FileNotFoundError):
        return False


def unpack_kokoro(archive:Path,dst:Path=KOKORO):
    """Tar traversal/link/bomb defense; all output moved into the APK tree atomically."""
    with tempfile.TemporaryDirectory(prefix='pipi-kokoro-') as tmp:
        extracted=Path(tmp)/ARCHIVE_DIR
        extracted.mkdir()
        size=0;count=0
        with tarfile.open(archive,'r:bz2') as reader:
            for member in reader:
                parts=Path(member.name.replace('\\','/')).parts
                if (not parts or parts[0]!=ARCHIVE_DIR or '..' in parts or
                        Path(member.name).is_absolute()):
                    raise ValueError('Kokoro 包含不安全的路径：'+member.name)
                if member.isdir():continue
                if not member.isfile():raise ValueError('不允许符号链接或特殊文件：'+member.name)
                count+=1;size+=member.size
                if count>18000 or size>900_000_000:raise ValueError('语音包超出安全限制')
                output=extracted.joinpath(*parts[1:])
                output.parent.mkdir(parents=True,exist_ok=True)
                with reader.extractfile(member) as raw,output.open('wb') as target:
                    if raw is None:raise ValueError('压缩包文件读取失败')
                    shutil.copyfileobj(raw,target,1024*1024)
        if not kokoro_ok(extracted):
            raise RuntimeError('Kokoro 模型不完整（需要 model.int8.onnx、voices.bin、tokens.txt、LICENSE、espeak-ng-data）')
        dst.parent.mkdir(parents=True,exist_ok=True)
        if dst.exists():shutil.rmtree(dst)
        shutil.copytree(extracted,dst)


def verify():
    print('Piper:', '已准备' if piper_verify() else '缺失（不可编译）')
    print('Kokoro INT8:', '已准备' if kokoro_ok() else '缺失（不可编译）')
    if kokoro_ok():
        print('Kokoro ONNX SHA256:',sha256(KOKORO/MODEL_NAME))
    if kokoro_ok() and piper_verify():
        print('双引擎资源齐全。Build 时将打包进同一个 APK，手机无需安装其他组件。')
        return True
    return False


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--kokoro',type=Path,help='已下载的 Kokoro 官方 .tar.bz2 文件路径')
    parser.add_argument('--piper-aar',type=Path,help='已有的 sherpa-onnx 官方 AAR 文件')
    parser.add_argument('--piper-model',type=Path,help='已有的 Piper .tar.bz2 文件')
    parser.add_argument('--verify-only',action='store_true')
    args=parser.parse_args()
    if args.verify_only:return 0 if verify() else 2
    if not piper_verify():
        from prepare_offline_voice import LIB,DIR,LIB_URL,VOICE_URL,LIB_SHA256,sha256 as psha,extract_model,model_ok
        with tempfile.TemporaryDirectory(prefix='pipi-piper-') as tmp:
            temp=Path(tmp)
            if not LIB.is_file() or psha(LIB)!=LIB_SHA256:
                aar=args.piper_aar or temp/'sherpa-onnx-1.13.8.aar'
                if not args.piper_aar:fetch(LIB_URL,aar)
                if psha(aar)!=LIB_SHA256:raise RuntimeError('sherpa-onnx AAR 官方 SHA256 不匹配')
                LIB.parent.mkdir(parents=True,exist_ok=True)
                if aar.resolve()!=LIB.resolve():shutil.copy2(aar,LIB)
            if not model_ok(DIR):
                package=args.piper_model or temp/'piper.tar.bz2'
                if not args.piper_model:fetch(VOICE_URL,package)
                extract_model(package,DIR)
    if not kokoro_ok():
        with tempfile.TemporaryDirectory(prefix='pipi-kokoro-download-') as tmp:
            source=args.kokoro or Path(tmp)/'kokoro-int8-en-v0_19.tar.bz2'
            if not args.kokoro:fetch(KOKORO_URL,source)
            if not source.is_file():raise FileNotFoundError(source)
            unpack_kokoro(source)
    return 0 if verify() else 2

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print('\\n资源准备失败：',error,file=sys.stderr)
        print('开发电脑需要联网下载官方 Piper 与 Kokoro 包；也可先在浏览器下载模型，再传 --kokoro 运行。',file=sys.stderr)
        sys.exit(1)

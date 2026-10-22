#!/usr/bin/env python3
"""Pipi V5.5: fetch official sherpa-onnx Android AAR + Piper voice to be BUNDLED into an APK.

Run once on the build PC, not on the phone. Once embedded, speech is fully offline.
"""
from __future__ import annotations
import argparse
import hashlib
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIB = ROOT / 'app' / 'libs' / 'sherpa-onnx-1.13.8.aar'
DIR = ROOT / 'app' / 'src' / 'main' / 'assets' / 'tts' / 'vits-piper-en_US-lessac-low'
LIB_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar'
VOICE_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-low.tar.bz2'
LIB_SHA256 = '633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96'


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        while True:
            block = f.read(1024*1024)
            if not block: break
            h.update(block)
    return h.hexdigest()


def model_ok(where: Path) -> bool:
    espeak = where / 'espeak-ng-data'
    return ((where/'en_US-lessac-low.onnx').is_file() and
            (where/'en_US-lessac-low.onnx').stat().st_size > 10_000_000 and
            (where/'tokens.txt').is_file() and
            espeak.is_dir() and len(list(espeak.iterdir())) > 3)


def verify() -> bool:
    aar = LIB.is_file() and LIB.stat().st_size > 10000000 and sha256(LIB) == LIB_SHA256
    model = model_ok(DIR)
    print('引擎 AAR:', 'SHA256 校验通过' if aar else '未安装或校验失败')
    print('英文模型:', '完整' if model else '未安装或文件缺失')
    if aar and model:
        print('资源可随 APK 一起打包；手机端不需要系统语音引擎。')
    return aar and model


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            print('下载:', url)
            req = urllib.request.Request(url, headers={'User-Agent': 'PipiOfflineTtsInstaller/5.5'})
            with urllib.request.urlopen(req, timeout=75) as resp, path.open('wb') as out:
                while (chunk := resp.read(1024*1024)):
                    out.write(chunk)
            if path.stat().st_size < 10_000_000:
                raise RuntimeError('下载文件太小，可能是网络错误页面')
            return
        except Exception as exc:
            path.unlink(missing_ok=True)
            if attempt == 2:
                raise RuntimeError(f'三次下载失败: {url}\n{exc}') from exc
            print('下载失败，重试:', exc)
            time.sleep(2)


def extract_model(archive: Path, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pipi-sherpa-') as temp:
        dest = Path(temp)
        with tarfile.open(archive, 'r:bz2') as tf:
            total = 0
            count = 0
            for member in tf:
                path = Path(member.name.replace('\\','/'))
                # Tar starts with official top-level folder; block absolute paths and links.
                if path.is_absolute() or '..' in path.parts or not path.parts:
                    raise RuntimeError('不安全的压缩包路径: '+member.name)
                if member.isdir(): continue
                if not member.isfile():
                    raise RuntimeError('不允许语音素材包含符号链接或特殊文件: '+member.name)
                if path.parts[0] != 'vits-piper-en_US-lessac-low':
                    raise RuntimeError('模型压缩包内容与预期不符: '+member.name)
                total += member.size
                count += 1
                if total > 220_000_000 or count > 25000:
                    raise RuntimeError('语音素材超出安全大小')
                output = dest.joinpath(*path.parts[1:])
                output.parent.mkdir(parents=True, exist_ok=True)
                raw = tf.extractfile(member)
                if raw is None: raise RuntimeError('解压失败: '+member.name)
                with raw, output.open('wb') as out: shutil.copyfileobj(raw,out)
        if not model_ok(dest):
            raise RuntimeError('模型不完整：需要 onnx、tokens.txt、espeak-ng-data；请确认下载的是 sherpa-onnx 发布版。')
        if target.exists(): shutil.rmtree(target)
        shutil.move(str(dest), str(target))


def main():
    ap=argparse.ArgumentParser(description='Prepare Pipi embedded/offline English voice')
    ap.add_argument('--aar',type=Path,help='Use previously downloaded official sherpa-onnx AAR')
    ap.add_argument('--model',type=Path,help='Use previously downloaded Piper .tar.bz2')
    ap.add_argument('--verify-only',action='store_true')
    args=ap.parse_args()
    if args.verify_only: return 0 if verify() else 2
    if verify(): return 0
    with tempfile.TemporaryDirectory(prefix='pipi-tts-download-') as td:
        tmp=Path(td)
        if not LIB.is_file() or sha256(LIB)!=LIB_SHA256:
            source=args.aar or tmp/'sherpa-onnx-1.13.8.aar'
            if not args.aar: download(LIB_URL,source)
            if not source.is_file() or sha256(source)!=LIB_SHA256:
                raise RuntimeError('AAR SHA256 不匹配，已拒绝导入，可能文件损坏/版本不正确')
            LIB.parent.mkdir(parents=True, exist_ok=True)
            if source.resolve()!=LIB.resolve(): shutil.copy2(source, LIB)
        if not model_ok(DIR):
            source=args.model or tmp/'vits-piper-en_US-lessac-low.tar.bz2'
            if not args.model: download(VOICE_URL, source)
            if not source.is_file(): raise FileNotFoundError(source)
            extract_model(source, DIR)
    return 0 if verify() else 2

if __name__=='__main__':
    try: sys.exit(main())
    except Exception as exc:
        print('\n错误:', exc, file=sys.stderr)
        print('可在浏览器手动下载官方两个文件，然后运行：', file=sys.stderr)
        print('python prepare_offline_voice.py --aar "AAR文件路径" --model "tar.bz2文件路径"',file=sys.stderr)
        sys.exit(1)

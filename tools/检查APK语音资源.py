#!/usr/bin/env python3
# 离线检查打包结果：只验证资源实际进入 APK，不能代替 Android 真机推理测试。
from pathlib import Path
from zipfile import ZipFile
import sys
apk=Path(sys.argv[1]) if len(sys.argv)>1 else Path('app/build/outputs/apk/debug/app-debug.apk')
if not apk.is_file():
 print('FAIL: 找不到APK:',apk);sys.exit(2)
with ZipFile(apk) as z:
 names=set(z.namelist())
 checks={
  'V5.10.6 网页版本': any(n=='assets/index.html' and b'V5.10.6' in z.read(n) for n in names if n=='assets/index.html'),
  '词书新增滚动代码': 'assets/app.js' in names and b'listRenderedUntil=next' in z.read('assets/app.js'),
  'Kokoro ONNX': 'assets/tts/kokoro-int8-en-v0_19/model.int8.onnx' in names,
  'Kokoro voices': 'assets/tts/kokoro-int8-en-v0_19/voices.bin' in names,
  'Kokoro tokens': 'assets/tts/kokoro-int8-en-v0_19/tokens.txt' in names,
  'Piper ONNX': 'assets/tts/vits-piper-en_US-lessac-low/en_US-lessac-low.onnx' in names,
  'Piper tokens': 'assets/tts/vits-piper-en_US-lessac-low/tokens.txt' in names,
  '原生 ARM64 so 库': any(n.startswith('lib/arm64-v8a/') and n.endswith('.so') for n in names),
 }
 print('APK：',apk, '大小：',round(apk.stat().st_size/1024/1024,1),'MB')
 for k,ok in checks.items():print(('PASS' if ok else 'FAIL')+' : '+k)
 print('核查结果:',sum(checks.values()),'/',len(checks))
 print('注意：此工具不能验证模型能否在手机上成功推理、AudioTrack实际发声。')
 sys.exit(0 if all(checks.values()) else 1)

# 皮皮 V5.12.19：全书语音缓存断点续接与旧 PCM 找回

适用基线：V5.12.18（GitHub main 对应源码）。升级前务必备份项目，并**使用同签名覆盖安装**；不要卸载、清除应用数据，或点击“删除全部已缓存语音”。

## 为什么会从零开始

V5.12.18 `voice-cache.html` 会从“阅读朗读设置 localStorage”设置音色、语速，直接把该值传给 `startLibraryVoiceCache`。与此同时，`VoiceCacheIndex.dbName(speaker,speed)` 和 `NarrationAudioCache.key(text,speaker,speed)` 都区分音色和语速；如果这两个值与上一次实际缓存任务不同，按钮会无提示开启另一套 SQLite 队列。此时新的档案从 0 开始，并不一定代表旧的 PCM 文件丢失。

另一种情况是 SQLite 进度或索引异常：旧 PCM 文件仍在，但元数据 `done=0`，旧代码优先信任元数据，页面显示从零开始。本修复为可疑的进度归零增加了磁盘 PCM 重新认领操作。

这两处是源码确认的**风险路径**；未读取用户手机内的 DB 和 PCM，不能确定用户这次中断一定是哪种情况。

## 修改内容

1. Android 原生端保存上次使用的音色和语速，普通“继续缓存”强制沿用旧配置（包括原先只有两个参数的 JS 调用）。
2. 缓存页面初次打开从原生已保存档案恢复选项，不再偷偷沿用阅读页的另一种音色。要切换另一套声库需弹出明确确认；旧 PCM 保留。
3. 已有合法 SQLite 队列在恢复后为 0（或低于上次同档案进度）时，**只扫描 PCM 目录中已有的哈希文件名**；与队列匹配的合法文件批量事务化标记为 `ready`，恢复 `meta.done`，不重新合成、不删除 PCM。
4. 扫描标记避免正常空队列每次反复扫描；常规 SQLite 断点恢复路径不做完整文件扫描。
5. 新音色档案独立计数，不错误继承旧档案的上报进度和统计。
6. 缓存页面把“累计已完成”和“本次新生成”区分开，并保留故障恢复诊断入口。

## 特别说明

- 如果 PCM 实际已被用户删除、卸载清理或覆盖安装变成了不同应用数据目录，程序无法凭 SQLite 凭空恢复音频。
- PCM 能复用的前提是**音色、语速、文本、Kokoro PCM 键版本**一致。明确更换音色确实需要另一份缓存。
- 这版不修改 FSRS、学习 SQLite、原著文本或语音模型。
- 本地当前环境没有完整 Android SDK / 小米手机，不宣称 APK 构建或真实多日稳定性已通过。

## 覆盖安装

把增量 ZIP 解压到 `C:\Users\74787\Downloads\pipi` 根目录覆盖，运行：

```powershell
cd C:\Users\74787\Downloads\pipi
.\gradlew.bat :app:assembleDebug
```

使用原包名和签名覆盖安装 `app\build\outputs\apk\debug\app-debug.apk`；**不要卸载旧版**。进入“全部原著语音缓存”，检查“上次缓存档案”是否与以前一致，点击继续，等索引恢复完成后再判断累计数量。新版本第一次核对可能需要时间。

## 如何判断音频到底还在

若 APK 是 Debug 版、电脑 ADB 已连接，可通过 PowerShell 执行（不删数据）：

```powershell
adb shell "run-as com.sprint7.offline sh -c 'ls files/pipi-kokoro-library-v1/*.pcm 2>/dev/null | wc -l'"
```

若输出有数千，意味着缓存文件大概率仍在（音色匹配与 PCM 有效性仍需检查）；输出 0 或 `run-as` 报错不自动意味着音频丢失，例如非 Debug 安装不能使用 `run-as`。运行前请确认设备和包名。已完成数量可能大于实际 PCM 文件数，因为重复句段可以共享相同 PCM。

## GitHub 提交

此工作环境无 GitHub 推送授权，也无法访问用户 Windows 文件系统。解压到本地 Git 仓库后，使用 `PUSH_V5.12.19.ps1`（执行前检查 Git 工作区）或手动运行：

```powershell
cd C:\Users\74787\Downloads\pipi
git add app/build.gradle app/src/main/assets/app-version.js app/src/main/assets/voice-cache.html app/src/main/java/com/sprint7/offline/MainActivity.java app/src/main/java/com/sprint7/offline/LibraryVoiceCacheService.kt app/src/main/java/com/sprint7/offline/VoiceCacheIndex.kt app/src/main/java/com/sprint7/offline/VoiceCacheRecovery.kt app/src/main/java/com/sprint7/offline/NarrationAudioCache.kt tests/test_v51219_cache_resume_ui.js tests/native/TestV51219PcmRecovery.kt tests/test_v51218_review_phonetics.js tests/test_v5123_cache_ui.js README_V5.12.19_语音缓存断点续接修复.md TEST_REPORT_V5.12.19.md
git commit -m "fix: preserve voice cache profile and recover existing PCM checkpoints"
git pull --rebase origin main
git push origin main
```

不要使用 `git push --force`。若 Git 提示远端领先、冲突或本地有未提交修改，应先解决后再继续。

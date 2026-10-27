皮皮 V5.12.24 — 缺少逐章缓存校验清单修复（累积补丁）

本补丁修复 Gradle :app:verifyVoiceChapterAssets 报错：
  缺少逐章缓存校验清单，运行 tools/build_voice_chapter_assets.py

根因：5.12.24 增量补丁只包含8个改动文件，不含 5.12.23 新增的
chapter-manifest.json、559章 JSON 和 tools/build_voice_chapter_assets.py。
如果跳过了 5.12.23，直接覆盖 5.12.24 就会缺资源。

使用说明：
1) 先关闭 Android Studio 的运行构建，备份 Windows 本地工程（特别是任何自行修改的源码）。
2) 把 ZIP 解压至 C:\Users\74787\Downloads\pipi 项目根目录；
   解压后应该出现 app\src\main\assets\voice-library\chapter-manifest.json；
   app\src\main\assets\voice-library\chapters\ 子目录应有559个 JSON。
3) 在项目根目录 PowerShell 依次执行：
   py -3 tools\build_voice_chapter_assets.py --verify
   .\gradlew.bat :app:verifyVoiceChapterAssets :app:assembleDebug
   如果找不到 py，可用 python 替代；只要清单已放好，Gradle 构建本身不需要 Python。
4) APP 使用原签名覆盖安装，不要卸载、不要清除应用数据。

包含：V5.12.23 的新增/修改文件、V5.12.24 的修改文件（后者优先覆盖）。
因此可以修复误跳过 V5.12.23 升级步骤导致的资源/源码缺失。
不会清理手机 PCM 音频、数据库，不包含音频文件/语音模型。

验收：ZIP 文件 CRC 检查、全部补丁文件与 V5.12.24 完整源码逐一对比、
全套 20本/559章/82926语音片段预处理校验通过。
但此环境未运行完整 Gradle 构建，需本地 Android Studio 验收。

# V5.10.9 测试与限制

## 通过
- `node tools/generate_voice_library.js`：调用阅读器原版原著分章函数、段落处理和朗读分句函数生成九部原著42,264段音频待生成清单。
- `python tests/test_v5109_background_cache.py`：全部9本清单的章数/句数/非空句/长度校验通过；Gradle版本、manifest 前台权限、前端工具按钮、Java bridge 和 Kotlin Service 文件依赖检查通过。
- `kotlinc` 将 `ArticleVoiceEngine.kt` / `LibraryVoiceCacheService.kt` / `NarrationAudioCache.kt` / `NarrationBufferPolicy.kt` / `NarrationPcmPacing.kt` / `KokoroModelGuard.kt` 与简化 Android/sherpa 接口桩编译通过。说明 Kotlin 类型/接口结构检查通过，不等于真实 JNI/Gradle 构建通过。
- Kotlin JVM：`TestNarrationBufferAndDiskCache.kt` 和 `TestNarrationPermanentCache.kt`，缓存校验、损坏再生成、音色隔离、没有全书自动淘汰均通过。
- Chromium：320、360、390、430px 的工具页面“开始 → 进度 → 暂停”交互、无水平溢出通过；通过模拟 Java bridge，不是真实 Android 服务。

## 未通过 / 不具备测试条件
- 本环境未包含用户的 `9 (2)` 工程二进制 Kokoro/Piper 模型与 sherpa AAR，也无 Android SDK 构建环境。**无法声明 `assembleDebug` 完整构建成功、真机后台缓存已运行或锁屏可持续整晚**。
- 没有实际检测几小时 TTS 耗时、真实手机散热和 Android 省电限制，必须真机验收。

## 真机验收步骤
1. Android Studio 构建无错误，APK能安装并打开9本原著、词书原功能。
2. 工具页面选择 Sarah 1x，开始后通知栏显示进度，持续生成至少20个片段。
3. 锁屏10分钟再打开，观察累计完成片段数继续增加。
4. 点击暂停，然后点击继续，已生成音频不重复生成。
5. 在阅读页播放刚刚缓存的一小段，观察首句能否直接命中缓存。
6. 在缓存任务中手动点击文章朗读，应该先暂停后台生成而不会双模型崩溃。
7. 模拟手机空间不足时应报错暂停，不应继续写到系统空间耗尽。

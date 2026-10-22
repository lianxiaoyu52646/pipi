# 皮皮 V5.10.7 测试记录

| 维度 | 结果 | 测试命令 |
|---|---|---|
| 现有 JS 回归 | 18/18 PASS | `for f in tests/test_*.js; do node "$f"; done` |
| 朗读自适应和缓存 Kotlin 单测 | PASS | `kotlinc ...NarrationBufferPolicy.kt ...NarrationAudioCache.kt tests/native/TestNarrationBufferAndDiskCache.kt` 后运行 |
| 朗读标点静音 Kotlin 单测 | PASS | `kotlinc ...NarrationPcmPacing.kt tests/native/TestNarrationPcmPacing.kt` 后运行 |
| 原生 Kotlin 主类接口桩编译 | PASS | Kotlin + Android/sherpa/json 接口桩；**非真实 AAR 编译** |
| 9本原著浏览器页面 | PASS | `python tools/check_reader_browser.py` |
| 4类手机屏宽词书滚动/续学 | PASS | `python tools/check_mobile_browser.py` |
| 阅读状态按钮浏览器模拟 | PASS | `python tools/check_reader_voice_ui.py` |
| 真正的 Android Gradle assembleDebug | **未运行** | 运行环境没有 Android SDK 与本机语音模型 |
| 真机 Kokoro 朗读十分钟 | **未验证** | 需在用户手机安装实际 APK 测试 |

说明：缓冲策略以“音频秒数”而非“句数”计算，Kotlin 单测覆盖低/高合成耗时，磁盘缓存测试覆盖坏文件回退；这些证明代码路径和边界行为，**不构成任何设备的真实连续播放性能承诺**。

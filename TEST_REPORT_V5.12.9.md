# 皮皮 V5.12.9 测试记录

- JavaScript 原有 24/24 项回归测试通过。
- 新增 `tests/test_v5129_stability.js`：SQLite 修订号择新与旧版恢复、滑词不自动加入 FSRS、书签桥接、相同词数不同内容的签名检测：通过。
- 新增 `tests/test_v5129_native_contract.py`：Kotlin/Java 改动路径与 P1/P2 接口契约：通过（源码级，不是设备测试）。
- 原有 `tests/test_v5127_durable_queue.py` 对20本原著断点逻辑验证：通过。
- `NarrationAudioCache.kt` + `TestNarrationPermanentCache.kt`：JVM 编译与读写通过。
- `NarrationAudioCache.kt` + `TestNarrationBufferAndDiskCache.kt`：JVM 编译与缓冲兼容测试通过。
- `NarrationAudioCache.kt` + `TestV5129Checksum.kt`：JVM 编译和同长度 PCM 字节篡改识别通过。
- `VoiceCacheIndex.kt`：利用 Android/SQLite/JSON 接口桩进行了 Kotlin 编译验证；不等于 Android SDK 实际编译。
- `check_v5_release.py` 和 `verify_assets.py`：20本英文原著、7套词书、256个词典分片检查通过。
- Playwright 本地 HTTP 浏览器试跑受环境安全策略阻止（ERR_BLOCKED_BY_ADMINISTRATOR），未作通过结论。
- **未编译实际 APK、未做真机72小时后台缓存及长词书滑动验收。**

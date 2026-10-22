# 皮皮 V5.12.4 自动缓存回归报告｜2026-10-22

- 基线：用户前一轮交付的 V5.12.3 Android Studio 完整工程源码。
- 编码：后台服务拆为独立 `:voice_cache` Android 进程；`VoiceCacheRecovery` 持久意图/进度及 `AlarmManager` 兜底；原生合成超时重启；自动扫描已验证文件恢复；PCM 批量写入；动态线程数；长文本分片生成。
- JavaScript：24/24 成功。
- Python：`test_v5109_background_cache.py`, `test_v5121_uninterrupted_cache.py`, `test_v5123_cache_stall.py`, `test_v5124_multiday_cache.py`, `test_v5124_progress_semantics.py`, `test_voice_assets_v55.py`, `test_kokoro_assets_v56.py` 全通过。
- 真实缓存索引：9 本原著，42,264 个句段，41,683 个不同文本键；模拟 0%、1%、20%、65%、100% 不同原有缓存恢复后均可计数到 100%。
- Kotlin：`LibraryVoiceCacheService.kt` + `VoiceCacheRecovery.kt` + PCM 缓存组件在自建 Android/sherpa/json API 接口桩下编译通过；核心 PCM 缓存 Java/Kotlin JVM 测试通过，含读写校验和损坏处理；长文本分段测试通过。
- 前端交互：320px / 360px / 390px / 430px 浏览器检查通过；静默超时停止 CSS 假动画。
- 资源发布核查：`check_v5_release.py` **失败**，缺完整第十本原著 `books/tom.txt` 和10本的书籍清单。

## 未执行／不能声称

- 未完成 Android Gradle assemble、真实 Kokoro JNI 推理、速度/热量测量、12/24/72 小时 Android 锁屏持续缓存的真机验收。
- 厂商后台管理、内存资源、FGS 启动限制、存储耗尽和异常原生库都可能阻止绝对的连续工作；闹钟恢复是 best-effort，不是绕过 Android 限制的保证。
- 现有 Piper/Kokoro 大模型与 AAR 未包含在本源码包。升级时需保留旧工程与应用私有数据。

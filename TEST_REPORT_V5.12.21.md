# V5.12.21 自动化检查报告

- Node JavaScript：36/36通过（含新增 `test_v51221_cache_recovery.js`）。
- `test_v51220_long_cache.py`：通过（旧队列冷却与隔离契约）。
- `test_v5127_durable_queue.py`：通过（20本、82,926段、81,562个独立缓存键、断点及重复音频复用）。
- `test_v5124_progress_semantics.py`：通过（多种崩溃后重启语义）。
- 原著资源：20本、82,926段；离线词典分片：256。
- 代码兼容性：没有更改原有SQLite数据库架构、原始PCM文件名/路径/格式、学习数据文件。
- 历史Python套件并非全部通过： `test_v5109_background_cache.py` 仍断言9本原著； `test_v5121_uninterrupted_cache.py` 的旧朗读反馈断言不适用于现在的跨进程模型锁； `test_article_ui_v56.py` 发生浏览器等待超时。不能据此声称所有测试通过。
- 未执行：完整 Android Gradle 编译、设备 Android UI 测试、小米持续整夜及跨天运行。

**注意：应用被 Android 强制停止时，后台主动拉起不受App完全控制。** 新版重点降低误报、增加可观察性和用户可操作的恢复路径，并非保证系统强行停止后完全无需干预。

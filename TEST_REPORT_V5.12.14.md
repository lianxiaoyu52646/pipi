# 皮皮 V5.12.14 · 测试报告

## 当前环境已完成

- JS回归：30/30 Node.js 测试通过；包括旧复习/FSRS、备份、原著以及新专项。
- 新测试 `test_v51214_backup_restore.js`：验证 SQLite优先导出、旧备份版本号重算、主SQLite失败、书签SQLite失败与回滚。
- 新测试 `test_v51214_parser_worker.js`：Web Worker同等解析逻辑逐本解析20本离线公版原著，完整章节计数校验全部通过。
- 新测试 `test_v51214_review_5000.js`：5000条模拟生词，分批显示、末尾搜索通过；该毫秒数字仅反映 Node 模拟环境，不代表小米手机性能。
- 新测试 `test_v51214_draft_and_lookup.js`：快速输入120次只提交1次防抖保存、手动刷新保存与优先当前词书释义的源码契约通过。
- `python verify_assets.py`：完整20本原著、7套离线词书、256分片离线词典、无 INTERNET 权限，PASS。
- `node --check`：app.js、wordbooks.js、originals-reader.js、reader-parser-worker.js，PASS。
- 原生增量SQLite实现：Javac Android接口桩编译成功；其 SQL 和 Android SQLite 真运行 **未测**。
- 锁屏前台播放服务：Kotlinc Android接口桩编译成功；实际 Android MediaPlayback 运行 **未测**。
- 补丁ZIP将验证覆盖正确路径、压缩完整性和 SHA-256。

## 未完成（不能宣称通过）

- 本环境未安装 Android SDK / Gradle Wrapper、缺少大模型和原始AAR，所以无法执行 `:app:assembleDebug`、完整 Kotlin/Java Android 项目编译。
- 新增的 `OfflineUiSmokeTest.java` 只是源代码，尚未在真实 Android 设备/模拟器运行；Gradle 需首次解析 AndroidX test 包。
- SQLite数据库真实迁移、设备断电恢复、各Android版本的数据库事务与大规模FSRS真人数据尚未实测。
- 小米手机锁屏10分钟和音频通知栏控制、连续8-12小时后台缓存、系统杀进程恢复尚未实测。
- JSON主记录仍有12,000,000字符限制。历史被分行写入不代表自动清理或永久无限容量。

## 真机验收清单

1. 先导出JSON，再使用同签名APK覆盖升级。重启APP，确认至少10个旧单词的复习日期与原著书签无变化。
2. 用一个较旧的导出JSON恢复，重启后确认是刚恢复的内容，不是恢复前的SQLite。
3. 在写作页连续输入500字并立即锁屏，再进入页面检查草稿；测试中不要卸载应用。
4. 今日到期卡片先隐藏答案、自动连续复习，检查生词本仍保留且日期变化。
5. 测试5000词真实列表搜索，切换页面返回仍保持滚动位置。
6. 首次打开《小妇人》等长篇检查是否出现卡死，检查全文章节完整。
7. 播放原著、锁屏10分钟、用通知栏暂停/继续/停止，返回检查目录与当前高亮。
8. 充电散热环境下运行整晚后台语音缓存，次日确认真实新增PCM数量、恢复次数及有无停滞。

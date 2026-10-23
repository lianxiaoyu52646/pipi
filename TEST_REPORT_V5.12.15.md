# 皮皮 V5.12.15 · 代码验证结果

## 通过

- 32/32 Node JavaScript 测试通过，新增 `tests/test_v51215_consistency.js` 专项验证 FSRS 23次“会”后不移出、词典只有“不会”建卡、SQLite 修订镜像和逐本书签合并。
- `node --check` 对 `app.js`、`full-dict.js`、`originals-reader.js`、`bookmark-merge.js`、`speaking-archive.js` 验证无 JS 语法错误。
- `python verify_assets.py`：20本原著、7套词书、256份ECDICT、HTML/Manifest、无INTERNET权限，全通过。
- `StudyStateStore.java` 在 Java 17 Android/SQLite/JSON **接口桩** 环境编译通过（并非 Android 运行测试）。
- 新增 Native SQLite API `writeIfRevision`、书签清理接口；对应 JavaScript 桥接调用源码静态核对完成。

## 未通过/未执行的验收

- 没有在本环境执行真实 `:app:assembleDebug`，因为没有完整 Android SDK / Gradle Wrapper 和离线模型/AAR；用户需要本地 Android Studio 编译确认。
- 尚未在手机上验证首次数据库迁移、SQLite 真实事务竞争、原著进度恢复、IndexedDB大录音归档、通知栏及锁屏播放、长时间后台缓存与省电限制。
- 仍有整份 WebView JSON 序列化、长期容量限制及部分原有 P1/P2 体验改进未做，不宣称全部16项彻底修复。

## 用户真机重点验收

1. 升级前导出 JSON；同签名覆盖安装后，核对旧 FSRS 到期日期和 20 本书签。
2. 从完整词典主动点“不会”，连续点“会”20次，生词仍在生词本、日期变化。
3. 在词书将**已经收录**的单词点“会”，它应从今日到期移走，但不从生词本消失。
4. 快速切换词典、原著、词书操作时如有并发冲突，必须提示失败而不是覆盖已有数据。
5. 重读原著旧章节，新进度应正确保留；导出 JSON 检查书签不被旧缓存替换。
6. 写作同题提交两次并在历史打开两份全文；口语录音提交并从历史播放。
7. 锁屏语音与整夜缓存分别测试；出现中断保留运行日志。

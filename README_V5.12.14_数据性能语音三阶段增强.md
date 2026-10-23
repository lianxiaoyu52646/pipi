# 皮皮 V5.12.14 · 数据安全 / 性能交互 / 锁屏听书整合增强

**升级基线**：已合并“V5.12.11 Kotlin 编译修复”的皮皮 V5.12.11 完整源码。此增量补丁根目录为 `app/`、`tests/`，须解压覆盖同一项目根目录，不要单独把 APK 解压到手机。

## 1. 数据安全（对应 V5.12.12）

- `StudyStateStore.java`：原有 `pipi_study_safety_v1.db` 无损升级为数据库版本 2，保留原先的 `study_state` SQLite 主记录及 `aux_state` 书签；不删除用户数据。
- 新增 `study_parts` 分字段 SQLite 表：`vocab`、`mistakes`、`readerWords` 逐词存储；`mistakeEvents`、写作/听力/阅读等历史数组逐事件存储；每次写入只更新内容发生变化的行，不再把整份记录作为每次 SQLite 主写入。事务统一提交。Java 层缓存已加载的行摘要，提高重复保存速度。旧版整包 JSON 继续作为每20次左右提交的检查点，另外保留上一个检查点供回退。**不会自动删除历史数据**。
- 仍会在 JS 与 WebView 兼容层维护整份 JSON（为兼容旧版阅读页和备份），并且每次 `save()` 仍会序列化状态；因此还不是百分之百的增量数据管线。原来12M字符的安全上限仍存在，不能声称容量无限。
- `backup.html`：导出时对比 SQLite 与 localStorage 的有效版本号，优先选择有效的较新 SQLite 记录；备份恢复时先写 SQLite，并回读校验，再更新本地镜像。任何失败均尝试回滚原先的 SQLite、书签与 WebView 记录，不再直接忽略写入返回的失败标志。
- 导入版本号较旧的备份时，自动给恢复的记录新的修订号，避免启动时被原来更高版本号的旧记录反向覆盖。
- 数据导出/恢复的输入尺寸限制和原有校验继续保留。

## 2. 性能与交互（对应 V5.12.13）

- 作文输入：输入时即时更新页面计数、约950ms静默后才提交学习数据库；页面转后台时立即尝试保存，提交作文前主动刷新保存。
- 同一单词多词书释义：`SprintBooks.lookup(id, preferredBook)` 优先从当前所选词书读取释义，FSRS 学习记录继续按单词 ID 共享。
- 复习页：搜索输入130ms防抖、单词来源等字段缓存，保留已有70词分批渲染和滚动位置逻辑。
- 原著首次解析：新增独立 Web Worker，首次从 APK 原文读入后在后台线程解析、校验章节；之前已缓存的解析结构继续直接读取 IndexedDB。没有 Worker 环境时降级为旧解析方法。
- 缓存诊断：UI 增强显示真实新增段数、自动恢复次数，并在提示中包含阶段、最后真实写盘间隔、最近一次恢复原因；只在真实生成阶段长期无写盘时标记停滞。

## 3. 锁屏朗读与测试（对应 V5.12.14）

- 新增 `ArticlePlaybackService.kt`：独立于整书预缓存服务的**同进程** Android 前台音频播放服务，通知栏提供暂停 / 继续 / 停止；正常锁屏或切到其他应用时，`MainActivity.onPause()` 不再无条件暂停原著朗读。
- 播放中的 Activity 重建会重新连接原朗读引擎，修复只因界面重建而被强制断开的情形。系统极端内存不足杀死整个进程时，仍不能保证音频不中断；只能依赖已保存的书签续读。
- Android 14 添加 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限和相应 service 类型，**未添加 INTERNET 权限**。
- 新增 `app/src/androidTest/java/.../OfflineUiSmokeTest.java` UI 冒烟测试，可通过 Android Studio 设备/模拟器执行 `:app:connectedDebugAndroidTest`；需要首次解析 AndroidX test 依赖。该测试只读浏览器业务，不清理或破坏学习数据。

## 编译和更新

1. 保留当前 APK、Android Studio 工程、原机 SQLite 和 PCM 语音缓存，不要卸载应用。先从“数据备份”页面导出 JSON，确认真实存到手机文件中。
2. 将**V5.12.14 增量补丁 ZIP**解压到你已成功编译的 V5.12.11 工程根目录（例如 `C:\Users\74787\Downloads\pipi`），覆盖 `app/` 等同名路径。
3. 在 Android Studio 同步 Gradle，执行 `:app:assembleDebug`；验收用 `:app:assembleDebugAndroidTest` 和在手机或模拟器上执行 `:app:connectedDebugAndroidTest`。此版本的 AndroidX UI 测试依赖可能需要联网首次从 Gradle 仓库拉取，但**APP 正常使用和语音模型仍完全离线**。
4. 保持原来的应用 ID、签名和包数据，**覆盖安装**，不要卸载旧 App。安装后先检查旧学习记录、FSRS 卡片和书签，再做主动的测试操作。
5. 全包仍不包含大型 Kokoro/Piper 模型及 sherpa AAR；编译时需从你原有完整工程引入。

## 已验证与尚待验证

见 `TEST_REPORT_V5.12.14.md`。Node JS 回归、20本原著后台解析、5000词检索模拟、Java SQLite API 接口桩编译、Kotlin 前台播放服务接口桩编译均已执行。**当前容器缺少 Android SDK/Gradle，因此没有完整 APK 编译成功记录，也未实际运行 Android UI 仪器测试、锁屏播放以及整夜缓存。** 下载后请用你的 Android Studio 完成这部分实机验收。

> 建议升级后先试：旧学习记录读回、恢复备份、输入500字作文、连续复习、打开未曾读过的长篇原著、锁屏播放10分钟与整夜缓存进度。遇到任何数据错误请停止反复覆盖，并保留原备份和日志。

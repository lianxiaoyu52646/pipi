# Sprint7 Android 离线版 v3 · 十部纯英文名著

> **本文件是 Android 源码工程 ZIP，不是 APK。** 此交付环境未安装 Android SDK，因此尚未实际编译和真机验收 APK。源包现在有九部已核验完整原文，**第十部《汤姆·索亚历险记》完整原文在 Windows 构建时通过 `prepare_tom.py` 自动下载并验证**。如果无法取得35章完整版，构建会直接停止，绝不制作“9本冒充10本”的 APK。考试词书（四级/六级/雅思/托福）也须在电脑构建时下载一次。

## 最终 APK 应包含

- 十部 **纯英文** 原著（9本原有全文 + Gutenberg 第74号《The Adventures of Tom Sawyer》**35章全文**），全部在 APK 内部 `assets/books`，无在线书架、下载、导入入口。第十部的下载是**电脑打包时的一次性素材获取**，**手机使用时完全不下载**。
- ECDICT 离线英汉词典：原始770,611词目，256个本地 JSON 分片，约767,533个有中文释义。非每一条都有中文、并非所有变形能百分百匹配。
- 词书：小学8册（818个去重词）、初中5册（2,584）、高中7册（2,708）；另有 CET-4、CET-6、IELTS、TOEFL 词表（电脑构建时获取），按词书学习与抽测。
- 点词底部抽屉：中文释义、音标、英文解释、上下文、离线发音入口；“不会”进入 FSRS 生词本，“会”保留累计7次掌握逻辑。
- 记忆进度：按词书+排序方式+主题分别持久化，上次学到100个，次日从第101个接着学；整书完成从头开始第2轮；FSRS 到期复习独立保留。
- 学习记录备份：`backup.html` 支持 JSON 导出和恢复；卸载 App、清除数据或换机前必须手动导出。

## Windows 一键打包步骤

1. 下载此 ZIP，完整解压到例如 `D:\Sprint7Android_v3`，不要在 ZIP 压缩包内部直接运行文件。
2. 电脑安装 Android Studio（https://developer.android.com/studio），在 SDK Manager 安装 **Android SDK Platform 35**。同时需可用的 Java 17+、Python 3.11 和首次联网下载 Gradle 依赖。
3. 双击 **`一键制作Android离线APK.bat`**。它会：
   - 验证和获取四级、六级、雅思、托福完整开源词表，并写入 `app/src/main/assets/wordbooks-data/`；
   - 下载并校验《汤姆·索亚历险记》公版完整英文 TXT（35章，大致60,000-100,000词）写入 `app/src/main/assets/books/tom.txt`，并更新 `books_manifest.json` 中其 SHA256；
   - 运行 `verify_assets.py`，严格校验 **10本正文、256个ECDICT分片、7类词书、文件链接及无 INTERNET 权限**；任何一项失败时不构建；
   - 通过 Gradle 编译。成功后输出 **`Sprint7-10Books-Offline-Android-debug.apk`**。
4. 把 APK 复制到安卓手机，使用文件管理器点击安装；若 Android 弹出“允许安装未知应用”，对该文件管理器临时授权安装。首次安装请保留安装包和备份。
5. 手机打开 App，开启**飞行模式**，分别测试第十本汤姆第一章和最后一章、旧九本、点词查中文、七类词书、FSRS “会/不会”、关闭重开后的学习进度。安卓系统 TTS 需事先安装**离线英文语音包**，否则朗读功能可能无法使用。

### 电脑下载第十本失败时

在电脑浏览器打开： https://www.gutenberg.org/ebooks/74 ，选择 **Plain Text**；或者直接访问 https://www.gutenberg.org/cache/epub/74/pg74.txt 。

下载的完整纯英文 TXT 放入：

`app/src/main/assets/books/tom.txt`

然后重新运行 BAT。脚本会自动校验文件大小、章数、正文词数等并生成校验清单。**请不要使用导读、缩写版、中文翻译版或仅部分章节替代全文。**

### 考试词书下载失败时

从 https://github.com/KyleBing/english-vocabulary/tree/master/full_line_tsv/simple/正序 获取 `四级.txt`、`六级.txt`、`雅思.txt`、`托福.txt`，复制到 `app/src/main/assets/wordbooks-data/`，分别改名 `cet4.txt`、`cet6.txt`、`ielts.txt`、`toefl.txt`；必须保留 UTF-8 和 TSV 制表符格式。构建脚本会校验内容与规模。

## 学习进度迁移与安全

- Android App 的包名保持 `com.sprint7.offline`，原学习数据库 key `sprint7_complete_v1`、小说进度 key `sprint7_originals_progress` 不变。**用同一签名证书覆盖升级**时，通常保留旧手机数据；不要卸载旧版再装。
- 从 Windows 浏览器移到 APK **不会自动同步学习记录**。先在原项目导出 JSON，然后在 App 的“学习记录备份”导入。只有备份文件实际包含的记录才能恢复。
- debug APK 在不同电脑构建时可能使用不同签名，导致无法覆盖安装。若准备长期使用，应生成固定签名的 release APK，保存密钥，先备份再升级。
- App 不声明 `android.permission.INTERNET`，WebView 只允许 `appassets.androidplatform.net/assets/` 本地素材。无 Vercel、无账户、无云端同步。
- 页面中未内置的在线课程或官方练习网站链接不可用，这不影响十本原著、词书和词典的核心离线学习。

## 测试与透明状态

**本次已通过：** ECDICT 数据抽样查询、256分片数量和元数据检查；九本旧小说原文的本地章节解析（本次修复福尔摩斯与绿野仙踪），35章汤姆章节解析**模拟文本测试**，词书顺序记忆100→101、轮次+1、FSRS保留测试，安卓 Manifest 不含 INTERNET 权限和 JS 语法检查。

**尚未通过：** 下载 Gutenberg 74号原始 TXT 并在本机对真实正文完成校验；下载四类考试词书；Android SDK 实际构建；安卓真机飞行模式验收。所以本 ZIP 不能当作 APK，也不能声称当前 ZIP 已内嵌第十本全文。Windows 一键打包通过后，APK 才满足十本纯英文离线书的验收前提。

## 来源

- 《The Adventures of Tom Sawyer》：Mark Twain，Project Gutenberg eBook #74，https://www.gutenberg.org/ebooks/74 。请自行确认适用地区公版状态。
- ECDICT：skywind3000/ECDICT（MIT，保留 `ECDICT_LICENSE.txt`）
- 考试词表：KyleBing/english-vocabulary（BSD-3-Clause，保留 `THIRD_PARTY_LICENSE.txt`）
- 学段词表：`SCHOOLBOOKS_SOURCE.md` 记录开源来源及注意事项。

**不接入 Vercel，也不对线上 Sprint7 做任何修改。**

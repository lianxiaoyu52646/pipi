皮皮 V5.12.11 编译错误热修复补丁（与 V5.12.11 版本兼容）

修复报错：
ArticleVoiceEngine.kt:82:29 Unresolved reference registerReader
ArticleVoiceEngine.kt:485:26 Unresolved reference unregisterReader

根本原因：如果从旧工程连续覆盖增量补丁，KokoroModelGuard.kt 仍可能是缺少以上两个方法的旧版本；V5.12.11 增量补丁未包含它。

安装：
1. 关闭 Android Studio 正在执行的构建任务，并备份原 Kotlin 文件。
2. 把本 ZIP 中的 app 文件夹合并到你当前 C:\Users\74787\Downloads\pipi 工程根目录。
3. 选择“覆盖” app/src/main/java/com/sprint7/offline/KokoroModelGuard.kt。
4. Android Studio 选择 Build > Rebuild Project；或在工程根目录运行：
   .\gradlew.bat :app:compileDebugKotlin
   .\gradlew.bat :app:assembleDebug
5. 如果仍报告这两个方法找不到，请搜索工程是否存在第二份名为 KokoroModelGuard.kt 的 Kotlin 文件，并检查该 Kotlin 文件已正确覆盖。

此补丁只替换一个 Kotlin 文件，不修改学习数据、SQLite、FSRS、原著、语音模型、已缓存 PCM 或 Android 安装签名。
注意：本补丁已通过独立 Kotlin 编译验证与符号检查，但当前环境没有完整 Android SDK/语音 AAR，未完成真实 :app:assembleDebug 构建。

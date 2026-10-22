皮皮 V5.10.8 编译修复（Unresolved reference NarrationBufferPolicy）

原因：V5.10.8 小更新补丁中的 ArticleVoiceEngine.kt 使用了 NarrationBufferPolicy，
但更新补丁漏放 NarrationBufferPolicy.kt，导致 compileDebugKotlin 失败。

操作：
1. 关闭正在运行的皮皮 App（可选），不要删除模型或学习数据。
2. 将本 ZIP 直接解压到你实际打开的 Android Studio 工程根目录：
   C:\Users\74787\Downloads\3
3. 确保解压后存在：
   app\src\main\java\com\sprint7\offline\NarrationBufferPolicy.kt
4. 回到 Android Studio，先 Sync Project with Gradle Files，
   然后重新执行 :app:assembleDebug。

本包只增加这一份 Kotlin 源文件，不修改 ArticleVoiceEngine、不碰语音模型及用户数据。
如果还有其他编译错误，请粘贴出现的前几条 e: 行；不要继续覆盖旧补丁。

验证：使用现有 V5.10.8 工程中完全相同的 NarrationBufferPolicy.kt；
该源文件可以通过独立 Kotlin 编译及相关缓冲/磁盘缓存测试。
说明：没有用户电脑完整工程/Android SDK，因此本次没有宣称整包 Android 编译通过。

# V5.12.16 验证记录

| 验证项 | 结果 | 说明 |
|---|---|---|
| 原有 JavaScript 回归 | 31/31 PASS | Node.js 逐文件运行 |
| 20本原著 | PASS | 82,926语音段，与 voice-library 索引一致 |
| 缓存页面 JS | PASS | 所有内联 JS 语法校验 |
| 跨进程文件锁 | PASS | Kotlin/JVM 实测争抢、释放、取消 |
| VoiceCacheIndex、Diagnostics、Gate | PASS | Kotlin API 接口桩编译，非 Android SDK |
| LibraryVoiceCacheService、Index | PASS | Kotlin API 接口桩编译，非 Android SDK |
| SQLite 旧队列兼容 | PASS | SQLite3 实测附加失败表，不丢原 ready 数据 |
| SQLite 坏片段重试 | PASS | 跳过失败 key / 过冷却期重试 / 重复 key 共享状态 |
| 完整 Android APK 构建 | 未执行 | 需 Windows Android Studio/SDK/语音库 |
| 小米整夜锁屏缓存 | 未执行 | 需实机与系统省电限制测试 |
| 提速幅度 | 未知 | 只增加量测和避免重复卡段；尚无真机对照数据 |

测试不意味着 Java/Kotlin Android 真机完整验证；请按照 README 完成本机编译和无人值守验收。

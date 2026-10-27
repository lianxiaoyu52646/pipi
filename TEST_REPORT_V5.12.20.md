# V5.12.20 测试与验收记录

| 检查项 | 结果 | 限制 |
|---|---|---|
| `tests/*.js` | 35/35 通过 | Node.js 模拟，无 Android 系统 |
| `tests/test_v51220_long_cache.py` | 通过 | 验证 SQL 查询和源码契约，不是实际 Android SQLiteOpenHelper 运行 |
| `KokoroProcessGate.kt` Kotlin/JVM 编译与占用/超时/释放/取消测试 | 通过 | 使用 Context 和 SystemClock 测试桩 |
| `tests/test_v5127_durable_queue.py` | 通过 | 索引断点模拟，全部 20 本 82,926 条出现位置 |
| `tests/test_v5124_progress_semantics.py` | 通过 | 历史测试 |
| XML Manifest 可解析、启动恢复广播存在 | 通过 | Android 系统权限行为需真机验证 |
| 补丁文件覆盖一致性 / ZIP CRC | 通过 | 压缩包结构静态校验 |
| 完整 Android Studio Gradle `assembleDebug` | 未执行 | 当前环境无 Android SDK 和 Kokoro 大型模型/AAR |
| 小米手机整夜缓存、重启后恢复 | 未执行 | 需用户真机验证，厂商系统可能限制后台服务 |

另：仓库保留旧版本特定测试，其中 `test_v5129_native_contract.py` 固定要求 versionName 5.12.9，`test_v5124_multiday_cache.py` 假设异常路径绝不能关闭持续缓存意图；二者已不适用于本版“自动重试达到上限后明确停止”的设计，不能作为本版本新逻辑通过的证明。

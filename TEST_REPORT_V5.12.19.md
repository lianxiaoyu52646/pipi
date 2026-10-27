# V5.12.19 测试报告

- 当前来源：GitHub main 对应 V5.12.18 完整源码（与该版本交付 ZIP 的缓存关键文件 SHA-256 相同）。
- 新增 JS 缓存档案测试：旧音色设定自动纠正、同档案继续、主动切换确认、取消继续、累计进度文案 —— PASS。
- 完整 JS 测试：34 / 34 通过（更新两个旧测试脚本的版本断言和 DOM 模拟字段）。
- Kotlin 原生独立测试：`NarrationAudioCache` + `TestNarrationPermanentCache` —— PASS。
- Kotlin 原生独立测试：`NarrationAudioCache` + `TestV5129Checksum` —— PASS。
- Kotlin 原生新增测试：`NarrationAudioCache` + `TestV51219PcmRecovery` —— PASS。
- 资源：20 本原著，82,926 语音句段，保留原始 PCM 格式。
- 修改的 Kotlin Android SQLite 服务及 Java WebView 桥接：源码与接口检查完成；**未能使用完整 Android SDK 编译 APK**，需用户 Windows Android Studio 完成最终构建。
- 用户手机数据：未取得，无法证明实际 PCM 仍存在、实际回退原因或恢复后的累计数字。
- 小米锁屏数小时/整夜测试：未执行，需真实设备验证。

如升级后进度仍为零，应先核对同音色/同语速，随后检查设备内 PCM 文件和 `pipi_library_voice_queue_v1_*.db` 是否实际存在；勿删除数据。

# 皮皮 V5.12.18 · 音标专项验收

- JavaScript 语法：`node --check app.js` 与 `node --check pipi-review-phonetics.js`：通过。
- `tests/*.js`：现有 + 新增测试回归通过（详见交付时终端结果）。
- 专项：词书音标直接显示；ECDICT 回查；IPA 旧符号转换；重复查询去重；缺失词条降级；抽屉切词防串音标；列表屏幕可见区惰性加载；中文释义仍隐藏。
- Android 真实 APK 构建 / 小米真机交互：**本环境未执行**，需要本地 Android Studio 验证。
- 原语音模型、PCM 文件、FSRS/SQLite 学习状态：没有调整其代码或数据。

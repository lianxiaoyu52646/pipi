# 皮皮 V5.10.6 整合工程 · 测试与交付记录

## 合并来源

- V5.10.4 早期完整 Android 工程（含前端、7本词书、9本小说、ECDICT、双引擎 Kotlin 接口；不含语音模型）
- V5.10.5 词书滚动防跳动与恢复早期文章首句出声候选补丁（11处代码文件及测试）
- V5.10.6：版本号及统一 Gradle 自动复制原有语音资源，打包前强制校验，更新 APK 检查脚本，避免重复叠补丁。

## 已运行、通过的项目

- **18/18 当前适用 Node.js JavaScript 回归测试**。9条检查旧虚拟列表/旧整章预生成实现的历史断言已转入 `tests/legacy`，明确不计入当前测试通过率。
- **Chromium 实际 DOM 渲染**：320/360/390/430px 四种手机视口，验证静止浏览不发生程序自动跳动、程序滚动不记入已学、手动滚过单词计进度、退出重进从下一词显示、无网页 JS 异常。使用项目内的 `tools/check_mobile_browser.py`（Playwright；网络隔离环境通过注入本机资源而非网络服务执行）。
- **9本现有原著逐本网页渲染成功**：alice、pride、sherlock、christmas、secret、oz、littlewomen、anne、machine；能看到正文和朗读按钮，无网页 JS 异常。使用 `tools/check_reader_browser.py`。
- **Kotlin PCM 测试通过**：`NarrationPcmPacing.kt` + `tests/native/TestNarrationPcmPacing.kt`，包括正常标点停顿不裁、有声采样保留等。**并非 Android Kokoro JNI 实际合成**。
- `check_v5_release.py` 正确标记 **NOT RELEASE READY**，当前第10本 `tom.txt` 不存在。

## 无法在本环境完成、不能宣称通过的项目

- 当前环境**没有 Android SDK**，无法执行 Gradle `:app:assembleDebug`；也没有用户电脑上的 `sherpa-onnx-1.13.8.aar` 与 Piper、Kokoro 模型，因此无法运行 Android Native JNI，无法产生经过验证的真实 APK。
- 手机端实际朗读音质、各标点处的停顿是否自然、启动时间、内存压力和跨应用切换，需要真实安装之后才能验收。
- Chromium 能证明网页滚动事件与布局逻辑基本正确，不能覆盖所有 Android WebView 的触控惯性、系统字体放大、输入法与系统 WebView 差异。
- 正式 Release 发布被10本原著内容检查挡住，Debug 测试版不代表正式上线质量。

**交付标准**：这是一份**可用于 Android Studio 构建的统一工程源码包**，不是已在真实手机上验收通过的最终 APK。若生成 APK 后模型仍失败，需以实际 APK 核对其完整性与错误信息。

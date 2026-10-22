# 皮皮 V5.12.0｜交付测试记录（2026-10-21）

测试对象：以 V5.11.1 源码为基线的修改版；本次没有运行 Android 设备或已安装 APK。

## 已通过
- `tests/*.js` 共 23 个，全部通过；涵盖原有 V5 业务测试、FSRS 到期规则、词书滑动续背、阅读/语音协议、词典及备份，并新增 V5.12 异常状态防覆盖和列表滑动与 FSRS 关系测试。
- `python tests/test_kokoro_assets_v56.py`，通过离线模型打包安全/资源结构测试（不能替代 Kokoro 模型音质测试）。
- `python tests/test_voice_assets_v55.py`，通过资源路径、防目录穿越等校验。
- `python tests/test_v5109_background_cache.py`，通过源码层面的后台缓存与章节分句契约校验。

## 有意未通过 / 未运行
- `python check_v5_release.py`：未通过。第十本《汤姆·索亚历险记》完整 TXT 缺失，书籍 manifest 尚不能标记为完整。
- `python verify_assets.py`：未通过。同样是十本全文缺少一本，资源校验正确拒绝发布。
- Android Gradle 真实 APK 构建：本环境没有所需 Android SDK、Piper/Kokoro 本机模型及 AAR。源码 ZIP 不等同于安装包。
- Android 真机测量：未测试。旧版 UI 自动化脚本不能证明 WebView 实机朗读性能；没有宣称零闪退。
- 浏览器交互试测：本容器浏览器限制本地 HTTP/file 访问，不能完成。未将失败的环境相关脚本伪装为通过。

## Windows 最终验收路径
运行 `01_Windows_检查资源并构建APK.bat`，资源下载校验必须全部通过，再用 Android Studio 或本机 Gradle 执行 `:app:assembleDebug`。完成 Android 实机的阅读、Piper 单词发音、Kokoro 章节朗读、备份导入导出、覆盖升级且记录不丢失测试后，方可标记为可发布候选。

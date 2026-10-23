# V5.12.11 · 回归与验收记录

## 源码级已验证
- 26项 `tests/test_*.js` 测试：通过26，失败0。
- `node --check`: `app.js`, `review-engine.js`, `originals-reader.js`：全部通过。
- `python verify_assets.py`：PASS，20本完整原著、7套离线词书、256 ECDICT 分片、无 INTERNET 权限。
- 新增 `tests/test_v51211_review.js`：主动不会收录、被动测试不收录、7次阈值恢复、先隐藏答案、标签排序、>200条加载、连续复习、多书来源、实时搜索和滚动恢复、历史保留等场景通过。

## 未完成/需真机复验
- 本环境没有 Android SDK/Gradle Wrapper，因此无法编译 APK 或宣称 Android 真实运行已通过。
- 本环境 Chromium 对 file:// 及 localhost 页面返回 ERR_BLOCKED_BY_ADMINISTRATOR，因此无法完成真实浏览器DOM/交互端到端测试；Node VM 验证了业务函数和 DOM 更新逻辑。
- 未做小米机型适配、SQLite真实断电恢复、Kokoro缓存72小时真机测试。

## 风险与使用建议
- 旧版诊断产生的 FSRS 单词全部保留在「全部」待人工确认。此策略避免误删，但可能导致首次升级后今日到期数量减少。这是有意防止非主动生词进入复习，非丢失。
- 批量查看数千单词仍需实际机型性能测试；本版分页加载已解除200条硬上限。
- 安装前请备份学习 JSON；保留应用数据，以原签名覆盖安装。

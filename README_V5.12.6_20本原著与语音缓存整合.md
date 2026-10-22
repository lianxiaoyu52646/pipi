# 皮皮 V5.12.6 · 20 本英文原著整合版

## 本次新增（原来9本 + 缺失1本 + 新增10本）

用户上传的 **11 本 Gutenberg 英文 TXT**均通过英文全文与文件结构检查，无任何中文自动翻译的正文。

补齐《汤姆·索亚历险记》（PG #74）和下列十本：

| 书名 | 原著 | Gutenberg 编号 | 识别章节数 |
|---|---|---:|---:|
| 金银岛 | Treasure Island | 120 | 34 |
| 彼得·潘 | Peter Pan | 16 | 17 |
| 黑骏马 | Black Beauty | 271 | 49 |
| 海蒂 | Heidi | 1448 | 23 |
| 柳林风声 | The Wind in the Willows | 289 | 12 |
| 哈克贝利·费恩历险记 | Adventures of Huckleberry Finn | 76 | 43 |
| 八十天环游地球 | Around the World in Eighty Days | 103 | 37 |
| 野性的呼唤 | The Call of the Wild | 215 | 7 |
| 小公主 | A Little Princess | 146 | 19 |
| 木偶奇遇记 | The Adventures of Pinocchio | 500 | 36 |

原有9本原著的文本未改动。新增11本用户 TXT 原文文件均保留原始字节，没有用节选替代。

## 完成的源码接入

- `app/src/main/assets/books/*.txt`：加入11本真实全文，合计20本。
- `app/src/main/assets/original-books.js`：书架资料扩展为20本，原ID不变，保护旧书签。
- `app/src/main/assets/originals-reader.js`：增加独立罗马章节号、数字章节号、`CHAPTER THE LAST` 等版式解析；`《金银岛》`原文本中的第17章编号排印误植只在导航层校正，原始 TXT 未改动。
- `app/src/main/assets/voice-library/*.json`：由**同一份阅读器解析与分句逻辑**为20本生成合计82,926个朗读片段。
- `app/src/main/assets/voice-library/index.json`：Android `LibraryVoiceCacheService` 自动扫描全部20本；已缓存PCM与缓存文件名算法不变，可重新校验旧音频并续接。
- 阅读书架、首页、朗读缓存页面、PWA简介和资源状态显示更新至20本。
- 资源清单 `books_manifest.json` 写入每本真实 TXT 的 SHA-256；Gradle发布校验、`verify_assets.py`、`check_v5_release.py`、`generate_asset_status.py` 同步升级为20本。
- `app/build.gradle` 版本名 5.12.6 / versionCode 35。
- 保留 V5.12.5 的小毛娃娃 App 头像、生词本/FSRS、词书滑动续背，以及“学习中”已移除的复习界面。

## 升级方法

### 现有源码为 V5.12.5（包括/不包括独立“移除学习中”小补丁）

1. 备份你的 Android Studio 工程。
2. **将增量补丁直接解压到工程根目录，按照相对路径覆盖**（`app/src/...`、`tests/...`、`tools/...`），不要解压到 `app/src/main/assets` 里面。
3. Windows 可运行 `01_Windows_检查资源并构建APK.bat`。正式编译仍需要从你原来的完整工程自动导入 Piper/Kokoro 模型和 sherpa-onnx AAR；没有模型则无法生成可用离线语音 APK。
4. 使用原应用相同的 applicationId、且与现有 APK 相同的签名覆盖安装。**不要卸载旧 App、不要清除应用数据**；更新前先从皮皮导出学习数据备份。

### 使用完整源码包

完整源码包不是可直接安装的 APK，也不包含本机几百MB的 TTS 模型，需要按上述脚本在电脑编译。补丁不会删除你手机上的阅读书签、生词记录或旧PCM音频缓存。

## 20本书对后台缓存的影响

- 原 V5.12.4 只有9本/42,264片段；V5.12.6 为20本/82,926片段。
- 由于分母增加，缓存页总体百分比可能较旧版下降；**已生成的PCM不会因此失效或被清空**，后台将跳过已校验文件。
- 长时间连续无人值守依然受到安卓厂商后台限制、温度、储存和底层Kokoro运行状态影响；本次增加书籍**不是**72小时真机可靠性的证明。
- 预计缓存容量较之前更大，注意剩余存储空间和设备散热。

## 验收结果

- 20/20 TXT 字节量/英文内容/章节解析/哈希校验完成。
- 20/20 浏览器阅读器逐本打开并显示章节正文和朗读控件，无页面脚本错误。
- 24/24 Node JavaScript 回归测试通过。
- `check_v5_release.py`、`verify_assets.py` 资源校验通过；7/7离线词书和256份ECDICT分片齐全。
- **未执行 Android Studio APK 完整编译或真实Kokoro模型逐句试听、72小时真机后台缓存**。发布前请在你的真实安卓设备上检查音频和跨章节体验。

**版权提示**：Project Gutenberg 的美国公版地位不等于世界每个地区均为公版；使用和分发前应根据所在地法律自行核对。

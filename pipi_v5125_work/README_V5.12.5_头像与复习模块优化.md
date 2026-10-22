# 皮皮 V5.12.5 头像与复习模块优化

## 本次修改内容

### 1）App 头像更换
- 将用户提供的小毛娃娃头像做专业化处理后接入为应用头像。
- 已替换 Android 启动图标（launcher icon）。
- 已替换应用顶部品牌头像。
- 已同步替换 Web 入口图标与 PWA manifest 图标资源。

### 2）复习模块优化
- 统一复习口径：**只有明确点击“不会”的单词才进入生词本**。
- 默认滑过/正常学习不再误入生词本，也不会误入 FSRS 新增记录。
- 阅读模块中手动标记“不会”的单词，**统一归入生词本**，不再单独割裂为另一套入口。
- 听写漏词、阅读点词、词书不会词，统一进入一套复习流。

### 3）已掌握统计弱化/去掉
- 复习页去掉“已掌握”独立筛选入口。
- 词汇记录卡去掉“已掌握/至少正确回忆3次”这类容易误导的展示，改为：
  - 累计进入复习
  - 当前生词本（含阅读）
  - 当前今日到期

### 4）今日到期说明
- **“今日到期”就是 FSRS 到期队列。**
- 页面文案已明确标注：今日到期完全来自 FSRS dueAt 到期时间。
- 也就是说，今日到期不是手写死逻辑，而是根据每个单词当前复习状态智能推送。

## 关键业务结论
- 默认所有单词都按“会”处理，不自动进生词本。
- 只有你主动点“不会”，才进入生词本，并进入 FSRS 复习流。
- 阅读点词里点“不会”，也会进入同一个生词本。
- 今日到期是 FSRS 算法按到期时间推送的。

## 本次主要修改文件
- `app/src/main/AndroidManifest.xml`
- `app/src/main/res/drawable/app_icon_baby.png`
- `app/src/main/assets/app-avatar.png`
- `app/src/main/assets/index.html`
- `app/src/main/assets/app.js`
- `app/src/main/assets/styles.css`
- `app/src/main/assets/app-version.js`
- `app/src/main/assets/manifest.webmanifest`
- `app/src/main/assets/sw.js`

## 补丁使用方式
如果你当前是 **V5.12.4**：
1. 解压 `Pipi_V5.12.5_头像与复习模块优化_增量补丁_适用V5.12.4.zip`
2. 直接覆盖原项目同名文件
3. 重新构建 APK 即可

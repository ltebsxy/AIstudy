# 验证记录 · 2026-10-03

已进行构建检查和针对实现问题的定向回归，没有运行桌面冒烟套件或大规模重复测试。

- JDK 17 / SDK Platform 35 / Build Tools 35：AAPT2、javac、D8、zipalign 构建成功，apksigner 验证开发签名成功（v3，最低 API 28）。APK 包名 `local.studydesk.android`。只声明 INTERNET 权限。
- `core.test.mjs`：3 项通过。使用现有阅读包确认只导入清单中的 50 篇正文；拒绝越界、重复、缺失及空文件；课程字段兼容；书写边界与双击判定。
- `mobile.mjs`：手机 390 × 844 浏览器流程通过。实际文件夹阅读包导入；英语单击不查询、双击查询；选区短语双击；阅读位置重启恢复；仅书写触发向下扩展且保存笔迹；普通课程选择/填空、重启恢复和提交查看；844 × 390 横屏。
- `reader-targeted.mjs`：文字层 PDF 在夜间模式中双击查词；画布向上扩展的世界坐标与视野补偿；滚动和橡皮不扩展。已修复 PDF 退出时先清理渲染器可能妨碍保存的顺序，现先保存并离开阅读页，再销毁 PDF 任务。
- `import-lifecycle.mjs`：导入期间锁定编辑；后台保存不覆盖正在提交的导入索引。
- APK 条目检查：Windows AAPT2 的反斜杠资源名在 zipalign/签名前归一为 `/`，校验词库、数学、PDF 与主页面资源存在；不把编译签名成功等同于资源路径正确。
- 检查截图：`build/verification/english-double-tap.png`、`canvas-restored.png`、`course-submission.png`、`pdf-dark-double-tap.png`。源文件和材料未写入 APK。

没有连接安卓设备。上述界面检查使用 Chrome 的手机尺寸、触控仿真和独立 IndexedDB；不是安卓原生 SAF 或真机通过证明。Android WebView、实际 SAF 提供者/长期授权、系统选择柄、真实笔压、后台进程回收、Keystore 与真实 API 服务仍需设备验证。构建成功仅证明原生源码可编译、资源可打包且签名可验证。

公开测试版构建输出：`build/outputs/AI-StudyDesk-Android-0.2.2.apk`（versionCode 2002）。最终文件大小与 SHA-256 以 0.2.2 发布页和 `SHA256SUMS.txt` 为准。

安卓版未读取或迁移桌面个人课程、API Key、账号、聊天或 `%APPDATA%/study-desk` 数据。0.2.2 同时分发桌面安装包与安卓测试 APK，并按 GPL 提供完整对应源码与许可。发布前仅重跑核心检查与构建、资源及签名检查，不重复上述浏览器流程；真机验证仍未完成。

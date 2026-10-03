# AI-StudyDesk 安卓测试版 0.2.2

独立 Android 工程，仅提供读写、普通课程及必要设置。桌面 `source/` 不被覆盖，`%APPDATA%/study-desk` 不被读取或迁移。没有编程工作区、外部 Windows 程序、桌面悬浮窗口、Harness 或订阅登录。

## 使用

下载 [AI-StudyDesk-Android-0.2.2.apk](https://github.com/ltebsxy/AIstudy/releases/download/v0.2.2/AI-StudyDesk-Android-0.2.2.apk)，本地构建输出位于 `build/outputs/`。包名 `local.studydesk.android`，版本 0.2.2（versionCode 2002），最低 Android 9（API 28），目标 API 35。本次为首个公开安卓测试版，使用开发签名，尚未真机验证。建议先更新 Android System WebView；阅读界面使用 ES modules、Web Worker、现代 PDF.js 和 KaTeX。

- 读写和课程各有独立文件夹，可创建、重命名、移动、删除及切换列表/网格和排序。文件通过系统单文件或文件夹选择器导入，复制进安卓应用数据目录；不申请整个设备存储权限。导入成功后记住 URI 并申请提供者支持的持久访问授权。
- 文件夹中的 `reading-pack.json` 按桌面 version 1 格式处理：只导入 `documents` 列出的正文，保留目录结构、顺序、显示名称和首次英语阅读模式。路径越界、重复、空文件、超限或缺失文件导致整批回滚。无清单时递归导入支持的阅读文件。Android 文档提供者不是本地路径系统；跳过虚拟文档和隐藏路径，拒绝循环目录，不解析符号链接。提供者实际 SAF 行为需要设备验证。
- TXT 和 Markdown 支持手机连续阅读；Markdown 支持标题、强调、代码、列表及数学公式，HTML 作为文字显示，不加载远程资源。PDF 使用本地 PDF.js 逐页按需绘制，文字层可选词；扫描页仅可查看与书写，不做 OCR。图片支持 PNG/JPEG/WebP/GIF/BMP。Word、电子书和其他格式需要先转为支持的格式。
- 在英语阅读中，**单击不查词，双击英文单词显示离线浮层**。长按选词、拖动安卓系统选择柄扩展短语，然后双击选区查询。系统选择菜单冲突时可点紧凑工具栏“查询选区”。短语上限 12 个词，不包含句末标点；完整短语未收录时明确显示分段释义。浮层点外关闭，不上传全文。
- ECDICT 使用桌面三层词库和相同查询算法，包括词形还原、常用短语及查无结果提示。词库压缩共 6,965,164 字节，首次查词才在 Worker 中加载常用层，扩展词/短语按需加载；详见内置 `SOURCE.json` 和 MIT 许可。
- 阅读/滚动、画笔、荧光和橡皮通过工具栏切换，避免查词与书写混用。支持压感、平滑笔迹、撤销/重做。空白笔记初始为一屏，画笔或荧光靠近上下边界时扩展一屏，滚动和橡皮不扩展。向上扩展补偿滚动偏移以保持同一世界坐标和视野；Canvas 仅绘制可见区域。
- 本地保存笔迹、字号/行距、位置、英语模式、作答、草稿和主题；重新进入恢复上次打开内容。横竖屏不重建 Activity。正文重新排版会改变文字对应位置，目前笔迹保持原世界坐标和相对横向位置，原文批注不会随段落重排。PDF 以打开时的排版宽度保存页面，旋转后可滚动；重新打开按新宽度排版。建议已有批注时保留原排版。
- 普通课程兼容桌面 `title / knowledge / knowledgeFormat / questions` 结构，支持 `written / choice / blank`、多选、图片、LaTeX、`grading.answer / criteria`。不导入桌面 `workTarget` 启动配置。练习进度按题目 ID 保存；提交保存包含所有题目作答及完整笔迹的本地快照，提交后才提供参考答案。最近提交可以在末题“查看提交”中打开，所有提交记录保存在应用笔记数据中。
- API 问答使用用户配置的 HTTPS Chat Completions 接口、实际模型 ID 和可编辑系统提示词。Key 经 Android Keystore AES-GCM 加密，不回传到页面、不写日志。选区需主动附上；批改发送本次提交快照，用户可先查看内容。带手写/题目图片的批改需要模型支持图像；接口不支持图像时可能返回错误。清除上下文只截断未来发送历史，保留本地记录、草稿及选区，不会在重启后重新发送旧上下文。不支持流式输出或桌面订阅账号迁移。

## 开发与构建

先在 `source/` 安装锁定依赖并生成阅读资源（不封装桌面版）：

```powershell
cd source
npm ci
npm run vendor:math
npm run vendor:reader
cd ../android
```

用 Android Studio 打开本目录，配置 JDK 17 和 SDK Platform 35 / Build Tools 35，然后执行：

```powershell
./gradlew.bat assembleDebug
```

AGP 8.10.1，Gradle Wrapper 8.14.3。构建会调用 `node scripts/sync-assets.mjs` 复制桌面词库、图标、PDF.js、KaTeX、许可并生成词库加载适配模块；没有创建第二套 npm 工程，不运行桌面 `npm run dist`。已安装的 Node.js 即可，无需在 android/ 运行 npm。

也可用现有安卓编译工具直接构建：

```powershell
./scripts/build-android.ps1 -JavaHome '你的 JDK17 路径' -PlatformDirectory 'SDK/platforms/android-35' -BuildToolsDirectory 'SDK/build-tools/35.0.0'
```

脚本使用 AAPT2 / javac / D8 / zipalign / apksigner，在对齐签名前校验并归一 Windows 工具产生的 ZIP 资源路径，生成自己的开发签名密钥于 `.tools/study-debug.jks`，不提交到源码。不要将开发签名视为生产发布签名。若需在其他机器覆盖安装本开发 APK，应安全保留同一开发密钥。

浏览器仅用于验证移动端界面，使用独立 IndexedDB；API Key 与原生 SAF 在浏览器预览中不启用：

```powershell
node android/scripts/sync-assets.mjs
node android/scripts/preview.mjs
# 在仓库根目录执行；打开 http://127.0.0.1:4186
node --test android/tests/core.test.mjs
node android/tests/mobile.mjs
node android/tests/reader-targeted.mjs
node android/tests/import-lifecycle.mjs
```

`core.test.mjs` 默认使用合成文件清单，无需下载课程；也可通过 `STUDY_READING_PACK` 指定本地 50 篇阅读包进行验证。`mobile.mjs` 使用 `source/node_modules/playwright-core` 和本机 Chrome，可通过 `STUDY_CHROME` 指定浏览器路径。浏览器阅读包验证需要本地 `source/output/courses/ai-3500-reading/` 素材，该素材不随源码或 APK 分发，也不将第三方 gk 标记口径声称为严格官方 3500 词表。

## 数据与边界

Android 应用内部 `files/study/` 保存 `state.json` 索引、`imports/` 文件副本、`notes/` 阅读/练习数据及 AI 非敏感配置。索引和笔记通过 `AtomicFile` 提交；导入先暂存、全部验证再原子提交。密钥仅在本应用的 SharedPreferences 保存加密密文，禁止系统备份。卸载或清除应用数据将移除本机数据；本轮未加入跨设备同步或导出恢复。界面删除经确认后提交索引，再清理对应文件与笔记；重启清理未完成的导入暂存、未入索引的文件和已删除项。索引损坏时保留原文件，不自动清理。

保存失败会显示提示；导入目录失效时系统选择器可以选择新位置。真机尚未连接，不能声称 SAF 提供者、系统选区手柄、压感、后台进程回收及 Keystore/API 联网已在手机通过。不要迁入个人 Key、账号、历史或 Windows 凭据。

## 源码与许可证

- `app/src/main/java/local/studydesk/android/`：安卓宿主、SAF 导入事务、原子保存、加密密钥与 HTTP 请求。
- `app/src/main/assets/app.mjs / ink.mjs / core.mjs`：移动界面、阅读查词、世界坐标画布及数据校验。
- `scripts/sync-assets.mjs`：沿用 `source/lib/english-dictionary.js` 查询逻辑；依赖源码改变时检查适配，不静默替换算法。
- `tests/`：三项核心检查、一次定向手机界面流程，以及 PDF/向上扩展和导入期间保存的回归检查。

本项目 GPL-3.0-only；ECDICT 与 KaTeX 为 MIT，PDF.js 为 Apache-2.0。APK 内含完整许可与来源说明。分发 APK 时需同步提供该构建的完整对应源码，包括此 android/ 工程及用于生成资源的 source/ 部分；0.2.2 对应源码见 [GitHub v0.2.2 标签](https://github.com/ltebsxy/AIstudy/tree/v0.2.2)。Gradle Wrapper 使用 Apache-2.0，许可位于 `gradle/wrapper/LICENSE`。

Android 文件选择与权限参考[官方 SAF 文档](https://developer.android.com/training/data-storage/shared/documents-files)，构建参考[官方命令行文档](https://developer.android.com/build/building-cmdline)。

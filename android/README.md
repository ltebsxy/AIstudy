# AI-StudyDesk 安卓英语阅读版 0.2.3

当前源码已精简为英语阅读专用：文章文件夹、连续阅读、离线查词、AI翻译、阅读笔记与排版/外观设置。已移除课程导入及作答、AI聊天/批改、手写画布和空白笔记功能。桌面端功能不受此精简影响。

下载 [0.2.3 APK](https://github.com/ltebsxy/AIstudy/releases/download/v0.2.3/AI-StudyDesk-Android-0.2.3.apk)。包名沿用 `local.studydesk.android`，versionCode 2003，最低 Android 9（API 28），目标 API 35。使用原开发签名，可覆盖同签名旧测试版。没有连接真机验证。0.2.2 是旧综合测试版。

## 使用

- 首页仅展示文章及其文件夹，支持导入文章/文件夹、新建文件夹、重命名、移动、删除、列表/网格、名称/最近阅读排序。
- 导入支持 TXT、Markdown、PDF。系统 SAF 选择器复制材料到应用内部目录，记住上次成功导入位置，不申请整个设备存储权限。
- 文件夹可带桌面兼容的 `reading-pack.json` version 1，仅导入 `documents` 指定正文，保留顺序、名称和非空目录层级；词表/答案等配套材料不在清单中就不导入。所有文章打开即支持英语查词，旧清单中的 `standard` 不再关闭查词。路径越界、重复、缺失、空文件或超限整批回滚。没有清单时递归导入支持的文件；隐藏/虚拟文档跳过，目录循环被拒绝。
- 单击不查词，**双击英文单词**显示词性、中文释义与音标。长按选词、拖动系统选择柄选短语，再双击选区或点击底部“查询选区”。本地短语查询最多 12 个词，未收录完整短语时明确展示分段释义。
- 词库沿用分层 ECDICT / MIT，首次查询才加载常用层，扩展词与短语按需加载；普通查词不调用 API。Markdown 安全渲染文字/公式，不执行 HTML 或加载远程图片。PDF 本地按需绘制，文字层可查词；扫描 PDF 仅阅读，不做 OCR。PDF 按打开时的宽度排版，旋转后重新打开可适配新宽度。
- 释义窗右下角有“AI翻译”和“加入笔记”。AI翻译主动点击后调用用户配置的 HTTPS Chat Completions 服务，仅发送当前词语及翻译提示，不携带全文、历史或笔记；密钥仅经 Android Keystore 加密保存在原生端。网络权限用于这项可选功能。浏览器预览不使用真实 API 凭据。
- “加入笔记”保存当前词语、本地释义和已经显示的 AI 翻译，并记录文章来源。顶部“笔记”统一查看和删除；删除文章不删除已保存的阅读笔记。未点击加入笔记不会自动保存释义。
- 自动保存阅读位置/进度、每篇文章字号/行距和浅色/夜间/跟随系统设置，重启恢复上次文章。字号/行距仅调整 TXT / Markdown，不改变原文件或 PDF。

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


## 定向验证

在仓库根目录运行（Node 和 Chrome，依赖沿用 source/）：

```powershell
node android/scripts/sync-assets.mjs
node android/scripts/preview.mjs
# 保持预览服务运行，在另一个终端执行
node --test android/tests/core.test.mjs
node android/tests/english-reader.mjs
```

`english-reader.mjs` 使用临时合成阅读包和隔离 IndexedDB，验证阅读/选词、进度、笔记、PDF 和桌面释义按钮。AI 服务响应被替换为测试数据，不产生联网调用。可用 `STUDY_CHROME` 指定 Chrome 路径，截图位于忽略的 `build/verification/`。导入期间保存的定向脚本 `tests/import-lifecycle.mjs` 仍保留；不需要每次运行全部脚本。详细结果见 VERIFICATION.md。

## 数据与兼容

沿用 Android 内部 `files/study/`：`state.json` 索引、`imports/` 原文副本、`notes/doc-*.json` 阅读设置，以及 `notes/english-notes.json` 独立阅读笔记。索引与笔记使用 AtomicFile；导入暂存成功后原子提交。

旧课程、手写笔记及历史配置保留在原数据中，不迁入英语首页，也不因本次精简主动删除。旧文章位置兼容原 `canvas.scroll`，新的位置保存在 `reader` 字段而不覆盖原笔迹。明确删除文件夹时，确认提示覆盖该文件夹的全部材料，包含旧材料。卸载/清除应用数据会移除内部文件；本轮没有同步/导出恢复。

没有连接安卓设备，SAF 提供者、系统选区手柄、后台回收及 Keystore/API 真机联网仍待设备确认。APK 原开发签名密钥必须保留，后续覆盖安装需用同一签名。

## 源码与许可证

原生宿主、SAF 事务、原子存储与可选翻译服务在 `app/src/main/java/local/studydesk/android/`；阅读界面/离线词库在 `app/src/main/assets/`。没有独立 npm 工程，资源复用由 `scripts/sync-assets.mjs` 生成。本项目 GPL-3.0-only；ECDICT / KaTeX 为 MIT，PDF.js / Gradle Wrapper 为 Apache-2.0，完整许可随资源保留。本版完整对应源码位于 [v0.2.3 标签](https://github.com/ltebsxy/AIstudy/tree/v0.2.3)，同时包含 `android/` 和生成资源所需的 `source/`。

## 共用外观

`ui-tokens.css` 复用桌面版的浅色/夜间颜色与圆角，由 sync-assets.mjs 同步；`reader-ui.css` 对齐阅读界面、释义窗与笔记。安卓状态栏/导航栏同步当前头部背景。仍然是英语阅读专用，不因外观统一恢复聊天/课程功能。

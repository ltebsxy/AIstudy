# 工程说明

项目采用 **GPL-3.0-only**，见 [LICENSE](../LICENSE) 和 [第三方许可说明](../THIRD_PARTY_NOTICES.md)。安装包配置会把这两份文件复制到程序旁；发布页应提供与安装包对应的源码及构建说明。第三方文件保留其原许可，不能统一替换成 GPL 声明。

## 目录

- `main.js` / `preload.js`：Electron 主进程和受限 IPC 桥接。
- `renderer/`：课程、练习、截图、设置与聊天界面。
- `lib/`：数据模型、AI 连接、聊天历史、批改和数学资源。
- `assets/`：应用图标。
- `tests/`：单元与界面集成测试，使用临时目录和合成测试数据。
- `scripts/`：数学资源同步和图标生成工具。

应用不包含预装课程，不会自动下载课程；用户数据从 Electron `userData` 目录加载。`STUDY_DATA_DIR` 用于测试时切换到隔离的数据目录。

## 命令

在本目录运行：

```powershell
npm ci
npm run vendor:math
npm run vendor:reader
npm start
npm test
npm run smoke:course
npm run smoke:math
npm run smoke:settings
npm run smoke:modes
npm run smoke:library
npm run smoke:reader
npm run smoke:writer
npm run smoke:writer-layout
npm run smoke:loading
```

日常开发可在本目录使用 `npm start` 运行源码，不必封装；仅用户明确要求打包或上传 GitHub 时运行 `npm run dist`。发布给用户的安装版从 `AI-StudyDesk.exe` 启动，安装时可选择是否创建桌面快捷方式。

界面测试需要 Windows 桌面会话。`npm run dist` 自动同步 KaTeX 与 PDF.js 资源，将便携目录和安装包输出到 `../app/`。KaTeX 本地文件与许可证由 `vendor:math` 从已安装依赖复制；不需要数学渲染 CDN。

可用 `STUDY_TEST_EXE` 指向打包后的程序运行界面测试。测试会在系统临时目录创建独立的数据，不读取日常使用的数据目录。

## AI 连接

面向使用者的完整操作及“将本段复制给 Codex”指令见 [接入说明](../README.md#接入-codex-等-harness)。当前仅测试 Codex（GPT 模型）；其他 Harness 的 HTTP 桥接尚未验证。

API 使用兼容 Chat Completions 的 `POST /chat/completions`，Key 在主进程解密。聊天与批改的用户材料只在触发对应操作时发送。连接设置保存在本机，不随构建打包。

HTTP Harness 接收 `POST` JSON：`{ sessionId, message, attachments, history }`，返回 `{ "reply": "回复文本" }`。可配置独立的 Bearer 令牌。附件包含文件名与 data URL；桥接服务负责适配目标代理。

Codex 支持本机 App Server 与桌面随附工具连接；桌面自动转发依赖从 Codex 启动时继承的环境，不应把连接环境或任务 ID 写入启动脚本。桌面集成依赖已安装组件，不能保证所有版本都兼容。

## 数据与发布

### 题型与笔迹

题目 `type` 可为 `written`（默认）、`choice`、`blank`。选择题使用 `options: ["选项一", "选项二"]`，`multiple: true` 表示多选；填空题使用 `blanks: ["第一空", "第二空"]`。批改参考仍只放在 `grading`，不会交给练习界面。

`workTarget: { "type": "default" }`（新建/导入默认）使用 preferences 中的 `defaultWorkTarget`，未配置时使用内置写字板。`builtin` 为单课程明确选择内置工具，课程的其他明确配置同样优先。笔迹位于用户数据的 `writing/`，按课程与模式隔离，以题目 ID 对齐页面。读写模式聊天使用独立 `reading` 范围，独立 PDF 的记录按本机文件路径对应。选择、填空和截图作答保存在当前练习会话中，批改时统一按题号导出。

`smoke:modes` 使用隔离数据、合成截图和本地 HTTP 模拟服务，验证题型编辑/作答、纯文字批改、手写提交与重启恢复、题目重新排序、PDF 读写和聊天隔离。

### 发布排除

`lib/library.js` 管理普通文件夹、内容归属及导入文件副本。 `lib/reading-pack.js` 支持异步文件夹导入与 version 1 阅读包清单，见 [reading-pack-format.md](docs/reading-pack-format.md)。先验证内容再复制，全部成功后一次更新索引；失败回收副本。保留非空文件夹层级；英语模式只作为尚无阅读批注的文件的默认设置。索引 v2 的文件夹使用 `mode` 与 `parentId` 隔离两个目录；`views.study` / `views.reading` 各自保存位置和卡片／列表偏好。v1 首次读取时先备份再迁移，保留 PDF ID 与课程归属；禁止跨模式移动及目录循环。

开发版和便携工程用 `../app/data/`；安装版用可执行文件旁的 `data/`。`STUDY_DATA_DIR` 指定时改用测试目录下的 `library/`，避免写入真实分区。构建请使用暂存输出，再复制 `win-unpacked/` 与安装包，保留用户的 `data/`。分区索引不含 API 凭据，原有课程与 AI 设置仍沿用用户数据目录。

- 不提交 `%APPDATA%\study-desk` 中的任何文件。
- 不提交课程备份、个人截图、聊天记录、模型凭据、教材或本机调查记录。
- `.tmp/`、`output/`、`release/`、`tmp/` 仅为本地输出，已被忽略。
- 修改源码后重新构建，不直接修改 `app/` 中的产物。
- 测试用的简短虚构题目与假密钥只用于本地验证，不是预装课程或有效凭据。

## 内置阅读与连续画布

PDF.js 6.3.289 及其 Worker、字体、CMap、WASM/ICC 资源均随安装包提供；无需网络。`reader:source` 只读取当前会话的文件，前端不可任意读取路径。PDF 脚本求值关闭，文本按纯文本绘制，不执行 HTML。支持 PDF、PNG/JPEG/WebP/GIF/BMP、TXT/Markdown，大小分别限 100/30/5 MB。Markdown 暂按原始文本阅读，GIF 使用首帧。

`data/annotations/<会话哈希>.json` 保留旧 `pages` / `notes`，新画布写入 `workspace`。做题仍按题目 ID 隔离，页面使用 `board` 存储连续笔迹。`renderer/board-model.js` 在前后端共同验证数据；旧文件批注迁移为页锚点，旧空白笔记排列到文件右侧。再次打开优先加载新画布，不重复迁移。

画布使用视口大小的两个 Canvas，文件与笔迹分层；画布范围保存在 `extent`，新空白画布初始仅一个视口；画笔／荧光笔进入底部约 20% 区域时增加约一屏下方空间；扩展不移动视口，点击和抬笔均不自动滚动。拖动／滚动仅在已有范围内移动，不触发扩展；上方和左右不新增空白，已有旧笔迹仍可访问；超大范围才启用 DOM 滚动坐标换算。支持负坐标，不创建超长位图。`ink.js` 使用中点二次曲线、压感低通平滑及连续笔迹轮廓，静止笔尖不会因自动滚动生成多余笔迹。没有翻页、画布缩放或手动扩展。工具栏包括普通画笔、半透明荧光笔、橡皮、撤销/重做，文件页连续显示且按需渲染，缓存最多 12 页。

文件宽度、左留白和页间距在右上角设置中修改、随文档保存；页锚点批注与文件同步变换，自由笔记保持世界坐标。内置做题的题干、公式、图片和选择／填空控件放在画布上，题号菜单可切题。内置做题与读写的 AI 复用 `overlay.html?embedded=1`，通过同源 iframe 使用父窗口预加载接口；聊天焦点始终留在写字窗口，不切换原生窗口。外部写字软件启动后显示可拖动悬浮球，点击展开独立置顶题目与 AI 窗口，可收起；截图作答保留原有按题号保存的流程。右下角“AI 问答”仅开关窗口内浮窗，不截屏、不发送消息，保留草稿。内置做题与读写初始关闭问答，窗口内也可用 × 关闭，截图提问仍在问答窗口操作。做题底部提供上一题、下一题、截图答案，截图由用户框选当前屏幕；末题下一题或确认截图后进入提交。聊天模型选择放在底部截图提问左侧。`smoke:writer` 检查全窗口覆盖、工具切换、仅书写向下延伸及滚动边界、滚动坐标换算、文件调整、重启、聊天附件与题号提交；`smoke:reader` 检查各类文件与损坏恢复；`smoke:writer-layout` 检查全屏焦点、问答拖动与草稿、截图附件、画布题目及选择填空提交。

## 设置

Harness 存在诸多问题，建议不使用，目前暂不维护。设置中保留现有配置，并显示此提示。

设置提供 AI 设置、外观、默认写字程序和练习工作区栏目，栏目切换保留顶部导航。API/独立 Harness 配置集中在 AI 设置，`api.systemPrompt` 可编辑并恢复默认；缺少此字段的旧配置使用内置提示。每次请求只有一条开头 system 消息，不写入历史，不改变 Harness。默认写字程序保存在 preferences，保存时合并已有字段；选择程序不启动它，做题时才使用。

外观支持 `light`、`dark` 与 `system`，保存在 preferences 的 `theme` 字段。主进程通过 Electron nativeTheme 处理系统外观更新并同步各窗口；预加载在首帧前提供主题状态，同源内嵌聊天继承父窗口主题。夜间画布仅调整 PDF／文本及深色笔迹的绘制颜色，不修改原件、笔迹或阅读位置。`node tests/theme-smoke.js` 使用隔离数据验证切换、内嵌聊天同步与重启保存，也支持 `STUDY_TEST_EXE` 检查安装包内的程序。

课程与读写导入目录分别保存在 preferences 的 `importDirectories` 中，仅成功选择／导入后更新；源码版默认 `output/courses/`，安装版默认系统下载目录，失效记录回退默认目录。

## 英语阅读词库

英语阅读使用 `lib/vendor/ecdict/` 内的 `dictionary.json.gz`（常用词和词形）、`extended.json.gz`（扩展词）与 `phrases.json.gz`（短语），分别在首次需要时加载，最多缓存 256 次查询；原词库来源、固定提交、SHA256 和筛选统计记录在同目录 `SOURCE.json`，MIT 许可在 `LICENSE`。转换脚本为 `scripts/build-english-dictionary.js`，从来源提交对应的 `ecdict.csv` 生成压缩词库，构建安装包时直接使用已入库的压缩文件，不下载完整词库或调用用户 API。文字型 PDF、TXT 和 Markdown 支持左键点词与拖选短语（最多 12 个词），拖选高亮不保存为批注；扫描件与图片不进行 OCR。未收录的完整短语仅展示分段释义，不拼接为整句翻译。

## 加载性能

启动时优先加载主页，再加载隐藏的题目窗口；主进程的数学导出模块在导出时才加载。主页从 HTML 首帧提供加载提示。同一个数据目录只运行一个实例，重复打开会恢复现有窗口；测试的 `STUDY_DATA_DIR` 仍可独立运行。先独立启动、随后从 Codex 启动时，只在内存接收必要的连接环境，保留已有有效连接，不写入启动文件或磁盘。

所有窗口使用应用图标。源码版任务栏标识为 `local.studydesk.source`，安装版保留 `local.studydesk.app`，避免本地开发版与旧安装版的任务栏图标混用。源码图标位于 `assets/icon.ico`，构建时复制到 `resources/icon.ico`；启动时按图标内容生成独立缓存路径供 Windows 窗口与任务栏读取，避免旧图标缓存。

应用品牌为 **AI-StudyDesk**。安装版内部应用标识和 `%APPDATA%\study-desk` 数据目录继续沿用，以保留已有课程、设置、聊天记录和侧边栏状态。`assets/icon.svg` 是图标原稿；在 `source/` 运行 `npm run icon` 可生成透明原稿 PNG、界面 PNG 和多尺寸 Windows ICO，无需封装。`scripts/create-shortcut.js` 可刷新本地源码版桌面快捷方式。设计说明见 [assets/README.md](assets/README.md)。

课程列表使用 `courses:sync` 按文件版本复用前端数据；文件夹切换直接使用操作返回的索引，未变化时不重传题目和图片。外部修改课程文件后，下次刷新会重新载入。首次读取课程与读写原文件使用异步文件读取，避免阻塞主进程。

PDF.js 仅在实际打开 PDF 时动态加载；文本分页分批让出执行时间，图片／文字及普通写字不加载 PDF 引擎。PDF 渲染队列在执行前检查页是否仍可见，快速滚动后跳过尚未开始的过期页；已有页缓存仍有上限。主页提供加载失败重试，打开文件期间禁用重复进入操作。

`smoke:loading` 使用合成课程比较首次／未变化时传输量，验证外部课程更新、PDF 按需加载和过期页跳过；不读取用户的个人课程。

`smoke:startup` 记录到主页可用的耗时，验证重复启动恢复窗口、主进程延迟加载数学模块，以及 Windows 原生窗口图标与应用资源一致。启动时间受系统缓存和磁盘负载影响，不以单次耗时作为性能保证。

## 官方 ChatGPT 订阅接入

`lib/chatgpt-connection.js` 在主进程实现 OpenAI 的本地开源 OAuth + PKCE 流程，使用动态注册的 issued client ID、稳定 host ID、JWKS 身份验证和权限检查。账号隔离，加密凭据保存到用户数据目录，主进程串行刷新轮换凭据；应用的 single-instance lock 防止同一用户数据目录多进程并发。渲染器仅获得账号标签及模型目录。公开 Responses 接口使用 store:false / stream:true，只有 response.completed 成功，错误无自动付费降级。配置 `mode:chatgpt` 和 chatgpt 下的账号、模型、提示词与 API/Harness 独立，历史按账号／模型隔离。见 [操作与接入范围](docs/chatgpt-subscription.md)。

针对授权校验、凭据隔离、撤销、刷新与流式完成的少量测试：`node --test tests/chatgpt-connection.test.js tests/ai-settings.test.js tests/context-compaction.test.js`。模拟服务不使用真实令牌或订阅额度。

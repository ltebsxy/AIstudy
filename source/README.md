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

仅保留 API 与独立 ChatGPT 订阅。旧 Harness 配置读取为 `unconfigured`，不会自动迁移到另一服务；明确选择后才启用。旧字段与加密凭据留在磁盘，但公共配置不返回这些字段，运行时不再读取或执行。旧聊天文件保留，不迁入其他连接的上下文。


API 使用兼容 Chat Completions 的 `POST /chat/completions`，Key 在主进程解密。聊天与批改的用户材料只在触发对应操作时发送。连接设置保存在本机，不随构建打包。



## 数据与发布

### 题型与笔迹

题目 `type` 可为 `written`（默认）、`choice`、`blank`。选择题使用 `options: ["选项一", "选项二"]`，`multiple: true` 表示多选；填空题使用 `blanks: ["第一空", "第二空"]`。批改参考仍只放在 `grading`，不会交给练习界面。

`workTarget: { "type": "default" }`（新建/导入默认）使用 preferences 中的 `defaultWorkTarget`，未配置时使用内置写字板。`builtin` 为单课程明确选择内置工具，课程的其他明确配置同样优先。笔迹位于用户数据的 `writing/`，按课程与模式隔离，以题目 ID 对齐页面。读写模式聊天使用独立 `reading` 范围，独立 PDF 的记录按本机文件路径对应。选择、填空和截图作答保存在当前练习会话中，批改时统一按题号导出。

`smoke:modes` 使用隔离数据、合成截图和本地 HTTP 模拟服务，验证题型编辑/作答、纯文字批改、手写提交与重启恢复、题目重新排序、PDF 读写和聊天隔离。

### 发布排除

列表顶部通过“新建”和“导入”按钮右侧的菜单选择操作。课程模式可新建文件夹/课程，导入课程文件/课程文件夹；读写模式可导入文件/文件夹，知识点可新建文件夹/笔记。课程文件夹内沿用现有的单课程 JSON 格式，递归保留非空目录层级，重复导入建立新的副本。非课程 JSON、非 JSON 文件、隐藏目录和符号链接跳过；损坏的 JSON 或不合规范的课程会终止整批导入并指出文件。每批最多 500 个课程、课程 JSON 总大小 128 MB、单文件 24 MB。`lib/course-import.js` 先校验，再保存课程和文件夹归属；普通写入失败恢复索引。导入不执行课程内容或沿用包内外部编辑器配置。定向检查：`node --test tests/course-import.test.js`、`node tests/library-actions-check.js`。

`lib/library.js` 管理普通文件夹、内容归属及导入文件副本。 `lib/reading-pack.js` 支持异步文件夹导入与 version 1 阅读包清单，见 [reading-pack-format.md](docs/reading-pack-format.md)。先验证内容再复制，全部成功后一次更新索引；失败回收副本。保留非空文件夹层级；英语模式只作为尚无阅读批注的文件的默认设置。索引 v2 的文件夹使用 `mode` 与 `parentId` 隔离两个目录；`views.study` / `views.reading` 各自保存位置和卡片／列表偏好。v1 首次读取时先备份再迁移，保留 PDF ID 与课程归属；禁止跨模式移动及目录循环。

开发版和便携工程用 `../app/data/`；安装版用可执行文件旁的 `data/`。`STUDY_DATA_DIR` 指定时改用测试目录下的 `library/`，避免写入真实分区。构建请使用暂存输出，再复制 `win-unpacked/` 与安装包，保留用户的 `data/`。分区索引不含 API 凭据，原有课程与 AI 设置仍沿用用户数据目录。

- 不提交 `%APPDATA%\study-desk` 中的任何文件。
- 不提交课程备份、个人截图、聊天记录、模型凭据、教材或本机调查记录。
- `.tmp/`、`output/`、`release/`、`tmp/` 仅为本地输出，已被忽略。

2026-10-05 整理后，当前 Windows 0.2.2 安装包、便携目录和校验文件集中在根目录 `app/`，Android APK 保留在 `../android/build/outputs/`。旧构建与诊断缓存已清除；`app/data/`、`output/` 中的课程材料、`.tmp/` 中的原始词库与私人课程归档，以及 `tmp/pdfs/` 的教材页图均保留，不能按缓存整体删除。清理明细位于根目录 `outputs/cleanup-report-2026-10-05.json`。
- 修改源码后重新构建，不直接修改 `app/` 中的产物。
- 测试用的简短虚构题目与假密钥只用于本地验证，不是预装课程或有效凭据。

## 内置阅读与连续画布

PDF.js 6.3.289 及其 Worker、字体、CMap、WASM/ICC 资源均随安装包提供；无需网络。`reader:source` 只读取当前会话的文件，前端不可任意读取路径。PDF 脚本求值关闭，文本按纯文本绘制，不执行 HTML。支持 PDF、PNG/JPEG/WebP/GIF/BMP、TXT/Markdown，大小分别限 100/30/5 MB。Markdown 暂按原始文本阅读，GIF 使用首帧。

`data/annotations/<会话哈希>.json` 保留旧 `pages` / `notes`，新画布写入 `workspace`。做题仍按题目 ID 隔离，页面使用 `board` 存储连续笔迹。`renderer/board-model.js` 在前后端共同验证数据；旧文件批注迁移为页锚点，旧空白笔记排列到文件右侧。再次打开优先加载新画布，不重复迁移。

画布使用视口大小的两个 Canvas，文件与笔迹分层；画布范围保存在 `extent`，新空白画布初始仅一个视口；画笔／荧光笔进入底部约 20% 区域时增加约一屏下方空间；扩展不移动视口，点击和抬笔均不自动滚动。拖动／滚动仅在已有范围内移动，不触发扩展；上方和左右不新增空白，已有旧笔迹仍可访问；超大范围才启用 DOM 滚动坐标换算。支持负坐标，不创建超长位图。`ink.js` 使用中点二次曲线、压感低通平滑及连续笔迹轮廓，静止笔尖不会因自动滚动生成多余笔迹。没有翻页、画布缩放或手动扩展。工具栏包括普通画笔、半透明荧光笔、橡皮、撤销/重做，文件页连续显示且按需渲染，缓存最多 12 页。

文件宽度、左留白和页间距在右上角设置中修改、随文档保存；页锚点批注与文件同步变换，自由笔记保持世界坐标。内置做题的题干、公式、图片和选择／填空控件放在画布上，题号菜单可切题。内置做题与读写的 AI 复用 `overlay.html?embedded=1`，通过同源 iframe 使用父窗口预加载接口；聊天焦点始终留在写字窗口，不切换原生窗口。外部写字软件启动后显示可拖动悬浮球，点击展开独立置顶题目与 AI 窗口，可收起；截图作答保留原有按题号保存的流程。右下角“AI 问答”仅开关窗口内浮窗，不截屏、不发送消息，保留草稿。内置做题与读写初始关闭问答，窗口内也可用 × 关闭，截图提问仍在问答窗口操作。做题底部提供上一题、下一题、截图答案，截图由用户框选当前屏幕；末题下一题或确认截图后进入提交。聊天模型选择放在底部截图提问左侧。`smoke:writer` 检查全窗口覆盖、工具切换、仅书写向下延伸及滚动边界、滚动坐标换算、文件调整、重启、聊天附件与题号提交；`smoke:reader` 检查各类文件与损坏恢复；`smoke:writer-layout` 检查全屏焦点、问答拖动与草稿、截图附件、画布题目及选择填空提交。

## 设置


设置提供 AI 设置、外观、默认写字程序和练习工作区栏目，栏目切换保留顶部导航。API/ChatGPT 订阅配置集中在 AI 设置，`api.systemPrompt` 可编辑并恢复默认；缺少此字段的旧配置使用内置提示。每次请求只有一条开头 system 消息，不写入历史，ChatGPT 提示词独立设置。默认写字程序保存在 preferences，保存时合并已有字段；选择程序不启动它，做题时才使用。

外观支持 `light`、`dark` 与 `system`，保存在 preferences 的 `theme` 字段。主进程通过 Electron nativeTheme 处理系统外观更新并同步各窗口；预加载在首帧前提供主题状态，同源内嵌聊天继承父窗口主题。夜间画布仅调整 PDF／文本及深色笔迹的绘制颜色，不修改原件、笔迹或阅读位置。`node tests/theme-smoke.js` 使用隔离数据验证切换、内嵌聊天同步与重启保存，也支持 `STUDY_TEST_EXE` 检查安装包内的程序。

课程与读写导入目录分别保存在 preferences 的 `importDirectories` 中，仅成功选择／导入后更新；源码版默认 `output/courses/`，安装版默认系统下载目录，失效记录回退默认目录。

## 英语阅读词库

英语阅读使用 `lib/vendor/ecdict/` 内的 `dictionary.json.gz`（常用词和词形）、`extended.json.gz`（扩展词）与 `phrases.json.gz`（短语），分别在首次需要时加载，最多缓存 256 次查询；原词库来源、固定提交、SHA256 和筛选统计记录在同目录 `SOURCE.json`，MIT 许可在 `LICENSE`。转换脚本为 `scripts/build-english-dictionary.js`，从来源提交对应的 `ecdict.csv` 生成压缩词库，构建安装包时直接使用已入库的压缩文件，不下载完整词库或调用用户 API。文字型 PDF、TXT 和 Markdown 支持左键点词与拖选短语（最多 12 个词），拖选高亮不保存为批注；扫描件与图片不进行 OCR。未收录的完整短语仅展示分段释义，不拼接为整句翻译。

## 加载性能

启动时优先加载主页，再加载隐藏的题目窗口；主进程的数学导出模块在导出时才加载。主页从 HTML 首帧提供加载提示。同一个数据目录只运行一个实例，重复打开会恢复现有窗口；测试的 `STUDY_DATA_DIR` 仍可独立运行。启动不采用外部编码代理上下文，重复启动仅唤回窗口。

所有窗口使用应用图标。源码版任务栏标识为 `local.studydesk.source`，安装版保留 `local.studydesk.app`，避免本地开发版与旧安装版的任务栏图标混用。源码图标位于 `assets/icon.ico`，构建时复制到 `resources/icon.ico`；启动时按图标内容生成独立缓存路径供 Windows 窗口与任务栏读取，避免旧图标缓存。

应用品牌为 **AI-StudyDesk**。安装版内部应用标识和 `%APPDATA%\study-desk` 数据目录继续沿用，以保留已有课程、设置、聊天记录和侧边栏状态。`assets/icon.svg` 是图标原稿；在 `source/` 运行 `npm run icon` 可生成透明原稿 PNG、界面 PNG 和多尺寸 Windows ICO，无需封装。`scripts/create-shortcut.js` 可刷新本地源码版桌面快捷方式。设计说明见 [assets/README.md](assets/README.md)。

课程列表使用 `courses:sync` 按文件版本复用前端数据；文件夹切换直接使用操作返回的索引，未变化时不重传题目和图片。外部修改课程文件后，下次刷新会重新载入。首次读取课程与读写原文件使用异步文件读取，避免阻塞主进程。

PDF.js 仅在实际打开 PDF 时动态加载；文本分页分批让出执行时间，图片／文字及普通写字不加载 PDF 引擎。PDF 渲染队列在执行前检查页是否仍可见，快速滚动后跳过尚未开始的过期页；已有页缓存仍有上限。主页提供加载失败重试，打开文件期间禁用重复进入操作。

`smoke:loading` 使用合成课程比较首次／未变化时传输量，验证外部课程更新、PDF 按需加载和过期页跳过；不读取用户的个人课程。

`smoke:startup` 记录到主页可用的耗时，验证重复启动恢复窗口、主进程延迟加载数学模块，以及 Windows 原生窗口图标与应用资源一致。启动时间受系统缓存和磁盘负载影响，不以单次耗时作为性能保证。

## 知识点笔记

`lib/library.js` 的索引 version 3 增加独立 `knowledge` 文件夹树、`notes` 元数据和 `noteDestinations` 课程位置；version 1/2 读取时先备份，保留原课程、读写文件及视图。`lib/notes.js` 在 `data/notes/` 保存文字段落和图片，原子替换内容，索引提交失败时恢复原正文。正文不随课程删除，位置是本机目录索引，不进入可分享的课程 JSON。

学习页和内置题干的选区保留公式 LaTeX，明确点击“加入笔记”才追加。截图使用单独的 `note` 用途，可从课程页、内置画布及外部工具浮窗进入，不改变题号、作答或 AI 输入。图片在笔记编辑页按可见区域加载，文字自动保存；夜间模式保留截图原色。

定向验证：`node --test tests/notes.test.js tests/library.test.js tests/reading-pack.test.js`；一次隔离界面流程：`node tests/knowledge-notes-smoke.js`（截图使用合成输入，不读取真实桌面或个人数据）。

## 官方 ChatGPT 订阅接入

`lib/chatgpt-connection.js` 在主进程实现 OpenAI 的本地开源 OAuth + PKCE 流程，使用动态注册的 issued client ID、稳定 host ID、JWKS 身份验证和权限检查。账号隔离，加密凭据保存到用户数据目录，主进程串行刷新轮换凭据；应用的 single-instance lock 防止同一用户数据目录多进程并发。渲染器仅获得账号标签及模型目录。公开 Responses 接口使用 store:false / stream:true，只有 response.completed 成功，错误无自动付费降级。配置 `mode:chatgpt` 和 chatgpt 下的账号、模型、提示词与 API 独立，历史按账号／模型隔离。见 [操作与接入范围](docs/chatgpt-subscription.md)。

针对授权校验、凭据隔离、撤销、刷新与流式完成的少量测试：`node --test tests/chatgpt-connection.test.js tests/ai-settings.test.js tests/context-compaction.test.js`。模拟服务不使用真实令牌或订阅额度。

## 英语释义窗操作

`reader:translate` 验证阅读 sessionId 与 500 字词语上限，调用现有 AIService.direct（API / ChatGPT），不附带文章或聊天历史。旧会话的迟到响应不会覆盖新选词。`reader:note` 按阅读文件标识关联独立笔记，文本包含选词、词库释义和当前已显示的 AI 译文；`readingId` 与课程笔记 `courseId` 分开，阅读笔记仍由知识点文件夹管理。两项按钮都必须主动点击，离线查词流程不自动调用 AI 或写入笔记。

## 共用界面与 AI 悬浮窗

`renderer/ui-tokens.css` 统一浅色/夜间的颜色、字体和圆角，Android 的同名资源由 sync-assets.mjs 同步；`ui.css` 对齐主界面卡片、表单和按钮。`chat-layout.css` 提供所有 AI 模式共用的标题栏、上下文操作、消息、状态、输入与连接栏。知识点、内置写字/阅读、外部做题与编程采用同一组 chat-* 类，模式专属操作在底部额外一行。`chat-ui.js` 统一发送/停止图标、输入法 Enter 处理和短暂淡入动画；用户已有窗口尺寸和拖动位置保留。

定向验证 `node tests/chat-layout-check.js`：真实渲染器配模拟 IPC，不读取个人数据或调用真实 AI。检查四种布局、浅/夜配色、窄窗口、草稿及发送/停止；截图位于忽略的 `.tmp/ui-layout/`。不需要为布局修改重跑完整冒烟套件。

## 读写编辑与笔记画布

读写卡片/列表的“编辑”以及读写画布右上角设置中的“编辑文件”，可修改名称、简介、阅读模式、TXT/Markdown 正文和默认笔记；PDF/图片通过“更换文件”更新。原始导入文件不被修改，应用内旧副本保留用于恢复。更换正文仍保留批注，内容变化后可自行检查批注位置。

默认笔记可选择已有笔记，或在知识点文件夹自动创建本文件的阅读笔记。普通读写使用手形工具拖选文字后点击“加入笔记”，英语释义窗、截图笔记使用相同目标。修改目标只影响之后的收录，删除读写文件保留笔记。目标保存在 library.json 的 noteDestinations，以 document: 文件编号与课程区分。

知识点列表和课程“查看笔记”默认打开连续画布，文字与图片排列在左侧，可手写、添加文字和截图，支持夜间模式。使用“编辑内容”管理原有文字/图片；旧笔记沿用 entries 格式，画布笔迹及视口另存在 data/annotations/，不覆盖文字/图片。

本次定向验证：`node --test tests/notes.test.js` 与 `node tests/reading-notes-check.js`，使用临时数据和合成截图，覆盖文件编辑、指定目标、原文件保留、保存失败回滚、笔记画布和笔迹重开；不打包、不调用真实 AI。

## 画布文字与形状整理

双击已有笔记文字、TXT/Markdown 正文或新增文字即可直接修改，无需先选择 T。编辑时点击空白处自动保存并退出，不会留下笔迹或新建文字。选择工具栏 T 或按 T 后可在空白处添加文字；编辑时按住 Alt 拖动可移动新增文字。修改直接显示在原文位置，无编辑外框、标题或按钮；点击其他位置或 Ctrl+Enter 自动保存并结束编辑。文字自动保存在当前笔记/文件，独立文字框随画布保存。PDF 和图片可添加文字批注，原件不被改写。

新画布的文件区域默认水平居中，宽度约为窗口 80%，正文和文字框字号增大。已有布局可在右上角“恢复文件显示”改用新布局。

自动整理形状默认开启：画笔完成后停留约 2 秒，本机尝试识别直线、圆、椭圆；继续书写会取消等待。画笔设置可关闭。撤销先恢复原始笔迹，重做恢复整理后的形状。定向检查 `node --test tests/shape-fit.test.js tests/board-model.test.js` 和 `node tests/writer-edit-check.js` 覆盖识别/拒绝、内联修改、文字持久化、默认居中和撤销，不运行完整冒烟套件。

## 保存与核心回归

`lib/writer-lifecycle.js` 统一主进程的离开操作：返回、原生关闭、会话切换及正常退出都先请求写字窗口完成保存，再隐藏或替换窗口。保存 IPC 不进入离开队列，避免相互等待。请求按渲染进程、会话和令牌匹配；保存失败或超过 15 秒未确认时阻止离开，保留编辑内容并显示重试入口。强制结束进程、断电等无法等待保存的情况不在此保证内。

读写正文保存采用不可变内容文件加原子索引提交。保留原始副本、当前版本，以及最近最多 5 份、合计不超过 20 MiB 的历史版本；原始副本和当前版本不计入历史限额。编辑页可恢复历史或原始版本。索引提交失败保留原索引并撤回新文件；提交成功后仅清理版本管理明确登记的过期副本，清理失败下次保存重试。未登记的旧文件、个人数据和导入原件不会被扫描删除。

在 `source/` 执行 `npm run test:core`：依次运行存储/画布单元检查、AI 连接单元检查、设置与请求路由、真实 Electron 保存生命周期、阅读分页与内容完整性、完整文字编辑与图形整理、读写与笔记集成七组检查。每组上限 90 秒，任一失败或超时返回非零并停止；Electron 使用临时数据，截图使用合成输入，不调用真实 AI。`writer-edit-check.js --text-only` 仅供文字交互的局部检查，核心入口始终运行包含图形整理的完整版本。日常局部样式调整无需执行该入口。


### 指针与形状整理回归

画布按发起手势的 pointerId 接收移动、抬起与取消事件，包括合并采样；其他鼠标/触笔的事件不能污染或截断当前笔画。`writer-edit-check.js` 使用真实鼠标画近似直线，并在中途注入另一触笔的移动/抬起/取消事件：检查原始轨迹仍可拟合、终点完整、1.8 秒延迟整理以及撤销恢复。完整事件与定时器时间线保存在忽略的 `.tmp/shape-investigation/<时间戳>-writer-edit/trace.json`，在成功或失败时都会写出；旧 `.tmp/writer-edit/shape-trace.json` 保留为历史合成证据。输入失真会在等待定时器之前单独报错，不能只将拟合等待超时视为算法失败。未放宽拟合阈值或等待断言。

`ai-connections-check.js` 使用隔离旧配置、真实设置/聊天界面、本地 HTTP 服务及订阅适配器模拟，验证旧连接不发送请求、显式选连接、API/订阅路由、草稿与私人文件保留；真实授权及 Responses 协议另由 `chatgpt-connection.test.js` 的本地模拟校验，不代表线上登录已验证。产品已移除桌面代理任务、自动转发及 HTTP 代理桥接；独立订阅授权、API 兼容接口、导出批改材料继续保留。没有 Harness 专用 npm 依赖；Electron 构建工具的通用代理依赖仍有用途。


### 图形整理超时诊断（2026-10-11）

新增 `npm run test:shape`，仅运行隔离数据的定向调查：真实鼠标路径夹入同 pointerId 的未按下事件及未按下合并样本，验证延迟整理、撤销/重做和保存；另用明确标记的定时器故障注入区分 15 个分支，并验证一次 2.1 秒事件循环阻塞。测试不增加原有等待限额，不放宽识别阈值，不循环重跑直到通过。正常线、圆、椭圆和不确定轨迹由 `node --test tests/shape-fit.test.js tests/ink.test.js tests/board-model.test.js` 检查。

确定修复：以前绘制期间同一 pointerId 的 `buttons=0` 移动仍会进入当前笔画，包括合并采样。定时器正常运行，但污染后的轨迹不满足拟合条件。现在原始事件及合并样本均只接收按下状态的绘图输入。未改动拟合的点数、长度、误差或闭合阈值。

历史超时不能唯一归因：当时只记录点数大于 2、最终界面状态正常和拟合结果为空，没有原始样本及定时器时间线。4 个点（最低需要 5 个）、轨迹污染、视口中途变化或最后一笔被替换都能产生类似观察。单独取消、忙碌/隐藏/未就绪/generation 门禁会阻止整理，但在本轮控制实验中原笔画仍可拟合；仅绘制/保存、失焦或 2.1 秒调度延迟没有破坏原笔画。控制注入不等同于证明历史事件发生过。

本轮还出现一次独立的撤销断言失败：`.tmp/shape-investigation/1791689127372-final/hover-event.json` 证明此前已成功将 31 点整理为直线，随后撤销检查仍读到 2 点；当时没有撤销点击及处理器记录，无法判断原因。增加控制事件和失败快照后，`1791689220401-control-events` 定向检查通过；`1791689291737-writer-edit/trace.json` 记录了撤销恢复同一条 31 点原笔迹。后续通过不代表此前撤销失败已解释，也不将其归为拟合超时的原因。保留该未决现象，下次失败用 `control-click`、`undo-request`、`undo-applied` 和失败快照区分事件未到达、处理被阻止或状态变化。

诊断默认关闭、仅驻留内存，不记录正文、密钥或课程路径，也不自动上传。开发者可在写字窗口控制台运行 `StudyShapeDiagnostics.start()`，用 `StudyShapeDiagnostics.snapshot()` 获取时间线，`StudyShapeDiagnostics.stop()` 清除。时间线包含原始/合并 pointer 样本及按钮、坐标、压力、时间戳，视口/文件区域/画布尺寸，笔画和 board 对象 ID，generation、ready/busy/hidden/focus，以及定时器安排/取消/执行/跳过、拟合指标与具体拒绝原因。默认最多 20000 条事件（可指定至 50000），超额计入 `dropped`；单次定时器执行的笔画快照最多 10000 点并注明 `rawTruncated`，完整小型复现应保证未截断。正常使用不需要开启。

# AIstudy · 知序学习

一个简单的 AI 学习与做题桌面软件，面向 Windows，无需登录软件账号。

## 功能

- 自行创建或导入课程，支持文字、图片和 LaTeX 数学公式。
- 阅读知识点后开始练习，可打开 OneNote、指定程序或本地文件。
- 置顶题目窗口；截图按题号保存，最后一题完成后进入提交页。
- 导出老师批改材料，或使用自己配置的 AI 批改。
- 可移动、可调整大小的 AI 聊天窗口；划选知识点添加片段。
- API 与 Harness 分开配置；支持兼容 Chat Completions 的服务及自定义 HTTP 桥接。
- 聊天记录本地分页加载，支持压缩上下文；API 支持清除上下文。

## 下载安装

[下载 Windows 64 位安装包（1.0.1）](https://github.com/ltebsxy/AIstudy/releases/download/v1.0.1/StudyDesk-Setup-1.0.1.exe) · [版本说明](https://github.com/ltebsxy/AIstudy/releases/tag/v1.0.1)

下载后运行安装包即可，无需安装 Node.js。私有仓库需要登录有访问权限的 GitHub 账号才能下载。

## 启动与构建

代码仓库提供源码；安装包通过 Releases 单独发布。源码和安装包均不包含个人课程、API Key 或聊天记录。新安装时课程列表为空，请自行创建或导入。

Windows 上安装 Node.js 22 或更高版本后，在仓库根目录打开终端：

```powershell
cd source
npm ci
npm run vendor:math
npm start
```

构建 Windows 安装包（在 source 目录运行）：

```powershell
npm run dist
```

构建后双击根目录 **Start.cmd**，或运行 `app/win-unpacked/StudyDesk.exe`。安装包位于 `app/StudyDesk-Setup-1.0.1.exe`。

## AI 设置

左下角打开“设置”：

- **API**：填写服务地址、模型和自己的 Key；可用 DeepSeek 模板快速填写地址与模型。模型是否支持截图或 PDF 取决于对应服务。
- **Harness**：单独选择 Codex 或 HTTP 桥接。Codex 需要本机已安装并登录，桌面自动转发需要从 Codex 启动本软件并继承当前连接环境。该桌面集成为实验功能，可能受版本与任务占用影响。

AI 调用会将本次问题、选取片段、相关历史及所附图片/文件发送到你配置的服务。AI 批改会发送本次批改材料；普通离线阅读和做题无需 AI。

### 接入 Codex 等 Harness

**目前仅测试过 Codex（GPT 模型）。** 其他 Harness 可使用 HTTP 桥接，兼容性尚未验证。本节指本机 Codex 桌面版；普通 ChatGPT 网页聊天无法替你启动本机软件。

#### 将本段复制给 Codex

先安装并登录 Codex 桌面版。在一个用于启动软件的 Codex 任务中，完整复制并发送下面这段文字，无需填写 API Key 或连接参数：

```text
请帮我启动 Windows 上的“知序学习”（StudyDesk），接入本机 Codex，完成以下步骤：

1. 自动定位程序：优先检查当前项目根目录的 Start.cmd 和 app/win-unpacked/StudyDesk.exe；安装版可通过“知序学习”的快捷方式、正在运行的 StudyDesk.exe 路径或 Windows 安装信息定位。如果仍找不到，请让我选择程序文件。
2. 检查你当前执行环境中的 CODEX_APP_TOOLS_PIPE_PATH、CODEX_THREAD_ID，以及桌面随附的 codex-app-tools 是否可用。只报告可用状态，连接信息仅用于本次进程继承。
3. 如果知序学习已打开，提醒我保存未发送的草稿和进行中的练习，再正常退出旧进程。随后直接从你当前执行环境启动 Start.cmd 或 StudyDesk.exe，继承当前环境，避免重复启动多个实例。
4. 验证桌面连接能够读取已有 Codex 任务。已有学习任务沿用原选择；尚未选择时，指导我在知序学习左下角“设置”中选择 Harness → Codex → 刷新任务 → 选择学习任务 → 保存设置。学习任务应与当前负责启动软件的任务分开。
5. 请让我从知序学习发送一条测试问题，并确认能收到回复。若连接不可用，说明具体原因和下一步；不要把手动复制发送的结果当成自动连接成功。

请保留现有课程、密钥和聊天记录；连接环境仅在运行时继承，不保存到启动文件或配置中。若需要新建学习任务，请先让我决定。
```

设置保存后，在聊天窗口选择 **Codex** 即可提问。Codex 桌面版更新或重启后，如果自动连接失效，再复制上面这段文字，让它重新启动知序学习。普通双击启动知序学习可能缺少自动转发所需的环境，进入“在 Codex 中继续”的手动模式。

#### 其他 Harness（未验证）

在“设置 → Harness”选择 **自定义 Harness（HTTP 桥接）**，填写代理名称、桥接地址、会话 ID，以及桥接服务需要的独立访问令牌。桥接服务需接收 `{ sessionId, message, attachments, history }`，返回 `{ "reply": "回复文本" }`。具体地址和令牌由你使用的桥接服务提供；仅填写名称不能建立连接。

## 本地数据

课程、连接设置、截图和聊天记录保存在 `%APPDATA%\study-desk`。密钥使用系统加密保存在本机，不写入源码或回传界面。仓库 `.gitignore` 排除个人数据和构建输出；请勿手动强制提交这些文件。

“清除上下文”让之后的 API 请求不再包含旧历史和摘要，**保留本地聊天记录**。

## 开发

应用源码和测试位于 `source/`，所有 npm 命令都在该目录执行。开发说明见 [source/README.md](source/README.md)。

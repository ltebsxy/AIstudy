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

## 启动与构建

仓库提供源码，不包含个人课程、API Key、聊天记录、依赖目录或安装包。新安装时课程列表为空，请自行创建或导入。

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

构建后双击根目录 **Start.cmd**，或运行 `app/win-unpacked/StudyDesk.exe`。安装包位于 `app/StudyDesk-Setup-0.7.0.exe`。

## AI 设置

左下角打开“设置”：

- **API**：填写服务地址、模型和自己的 Key；可用 DeepSeek 模板快速填写地址与模型。模型是否支持截图或 PDF 取决于对应服务。
- **Harness**：单独选择 Codex 或 HTTP 桥接。Codex 需要本机已安装并登录，桌面自动转发需要从 Codex 启动本软件并继承当前连接环境。该桌面集成为实验功能，可能受版本与任务占用影响。

AI 调用会将本次问题、选取片段、相关历史及所附图片/文件发送到你配置的服务。AI 批改会发送本次批改材料；普通离线阅读和做题无需 AI。

## 本地数据

课程、连接设置、截图和聊天记录保存在 `%APPDATA%\study-desk`。密钥使用系统加密保存在本机，不写入源码或回传界面。仓库 `.gitignore` 排除个人数据和构建输出；请勿手动强制提交这些文件。

“清除上下文”让之后的 API 请求不再包含旧历史和摘要，**保留本地聊天记录**。

## 开发

应用源码和测试位于 `source/`，所有 npm 命令都在该目录执行。开发说明见 [source/README.md](source/README.md)。

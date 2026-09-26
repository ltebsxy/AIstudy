# 工程说明

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
npm start
npm test
npm run smoke:course
npm run smoke:math
npm run smoke:settings
npm run dist
```

界面测试需要 Windows 桌面会话。`npm run dist` 自动同步 KaTeX 资源，将便携目录和安装包输出到 `../app/`。KaTeX 本地文件与许可证由 `vendor:math` 从已安装依赖复制；不需要数学渲染 CDN。

可用 `STUDY_TEST_EXE` 指向打包后的程序运行界面测试。测试会在系统临时目录创建独立的数据，不读取日常使用的数据目录。

## AI 连接

API 使用兼容 Chat Completions 的 `POST /chat/completions`，Key 在主进程解密。聊天与批改的用户材料只在触发对应操作时发送。连接设置保存在本机，不随构建打包。

HTTP Harness 接收 `POST` JSON：`{ sessionId, message, attachments, history }`，返回 `{ "reply": "回复文本" }`。可配置独立的 Bearer 令牌。附件包含文件名与 data URL；桥接服务负责适配目标代理。

Codex 支持本机 App Server 与桌面随附工具连接；桌面自动转发依赖从 Codex 启动时继承的环境，不应把连接环境或任务 ID 写入启动脚本。桌面集成依赖已安装组件，不能保证所有版本都兼容。

## 数据与发布

- 不提交 `%APPDATA%\study-desk` 中的任何文件。
- 不提交课程备份、个人截图、聊天记录、模型凭据、教材或本机调查记录。
- `.tmp/`、`output/`、`release/`、`tmp/` 仅为本地输出，已被忽略。
- 修改源码后重新构建，不直接修改 `app/` 中的产物。
- 测试用的简短虚构题目与假密钥只用于本地验证，不是预装课程或有效凭据。

# 项目目录

- 应用源码、依赖、测试及完整开发说明位于 `source/`；修改工程前阅读 `source/AGENTS.md`。
- 在 `source/` 内运行 npm 命令，不要在根目录重建另一套工程。
- `app/` 是构建输出；应修改源码后执行 `npm run dist`，不要只修改封装文件。
- 用户双击根目录 `Start.cmd` 启动 `app/win-unpacked/StudyDesk.exe`。从 Codex 启动时正常继承上下文，不保存连接环境变量到启动文件。
- 个人数据位于 `%APPDATA%\study-desk`，不属于可清理的构建输出。
- 原有构建与临时文件已保留在 `source/release/`、`source/.tmp/` 等目录。

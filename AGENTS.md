# 项目目录

- 应用源码、依赖、测试及完整开发说明位于 `source/`；修改工程前阅读 `source/AGENTS.md`。
- 在 `source/` 内运行 npm 命令，不要在根目录重建另一套工程。
- `app/` 是构建输出；日常修改只更新源码并验证，除非用户要求上传 GitHub，否则不要封装或运行 `npm run dist`。不要只修改封装文件。
- 用户双击根目录 `Start.cmd` 通过 `source/node_modules/electron/dist/electron.exe` 直接运行最新 `source/`。正常继承进程环境即可；应用不读取或传递编码代理连接上下文。
- 个人数据位于 `%APPDATA%\study-desk`，不属于可清理的构建输出。
- 当前 Windows 成品位于 `app/`，Android APK 位于 `android/build/outputs/`；保留 `app/data/`。2026-10-05 已清理被当前成品取代的历史构建和缓存，明细位于 `outputs/cleanup-report-2026-10-05.json`。
- `source/.tmp/` 中的原始词库、私人课程归档及必要工具，`source/output/` 中的课程和材料不属于可清理缓存。

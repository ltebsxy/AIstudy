# Third-party software / 第三方许可说明

AI-StudyDesk 的原创内容采用 GPL-3.0-only。第三方组件、字体和运行时保留各自的版权、许可证及免责声明；本项目的许可证不替换这些声明。

以下为主要随应用分发的组件及许可位置。依赖更新时应同步核查实际文件，完整条款以随组件保留的许可证为准。

| 组件 | 主要许可证 | 项目与许可位置 |
| --- | --- | --- |
| Electron | MIT，另含第三方组件许可 | https://www.electronjs.org/；安装目录中的 `LICENSE.electron.txt`、`LICENSES.chromium.html` |
| KaTeX | MIT | https://katex.org/；应用归档内 `renderer/vendor/katex/LICENSE`，依赖包内 `node_modules/katex/LICENSE` |
| PDF.js | Apache-2.0 | https://mozilla.github.io/pdf.js/；应用归档内 `renderer/vendor/pdfjs/LICENSE` |
| PDF.js 的 CMap、字体、WASM、ICC 资源 | 按各资源随附的许可证 | 应用归档内 `renderer/vendor/pdfjs/cmaps/`、`standard_fonts/`、`wasm/`、`iccs/` 中的 `LICENSE*` 文件 |
| ECDICT 精简英汉词库 | MIT | https://github.com/skywind3000/ECDICT；应用归档内 `lib/vendor/ecdict/LICENSE`，来源与转换信息见 `lib/vendor/ecdict/SOURCE.json` |
| 其他随应用分发的依赖 | 按各依赖随附的许可证 | 应用归档 `node_modules/` 内对应包中的 `LICENSE`、`COPYING` 或 `NOTICE` 文件（如有） |

应用归档为安装目录的 `resources/app.asar`。源码中的 `source/scripts/sync-math-assets.js` 和 `source/scripts/sync-reader-assets.js` 在构建时复制前端资源及其随附许可文件。Electron 的运行时许可由构建工具保留在程序旁。

重新分发时，请一并保留相关许可证、版权声明和适用的 NOTICE。第三方依赖的源码、版本和构建信息可通过 `source/package-lock.json` 及其中的来源信息获取。原样使用的通用开发工具由其自身许可证约束。

用户自行导入的教材、课程和文件不包含在本项目的软件授权范围内。

内置英汉词库由 ECDICT 的固定版本 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b` 提取单词、音标、中文释义和词性；保留 BNC/COCA 排名不超过 30000、考试词汇、Oxford 标记、Collins 星级及常见缩略形式的词条，并收录对应词形映射。转换脚本为 `source/scripts/build-english-dictionary.js`，不改变原词条释义。词库按需加载，查词无需联网。

# AI-StudyDesk Android

本项目：GPL-3.0-only。0.2.2 对应完整源码：https://github.com/ltebsxy/AIstudy/tree/v0.2.2 ，包含本仓库 android/ 及 source/ 中用于生成安卓资源的词库、数学与 PDF 资源。分发 APK 时必须同时提供此版本完整对应源码（包括本地改动）和许可证。本次 APK 为开发签名的公开测试版，不包含课程素材或个人数据。

- ECDICT：skywind3000，MIT。固定修订 bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b；来源 https://github.com/skywind3000/ECDICT 。词库元数据 SOURCE.json 和完整 MIT 条款一并内置。桌面 EnglishDictionary 查询算法保留 GPL-3.0-only 声明，安卓仅适配加载方式。
- KaTeX：MIT，完整条款 vendor/katex/LICENSE；来源 https://github.com/KaTeX/KaTeX 。
- PDF.js：Apache-2.0，完整条款 vendor/pdfjs/LICENSE；来源 https://github.com/mozilla/pdf.js 。
- Android SDK 和 Gradle：开发构建工具，按各自许可使用，不作为应用业务库复制进 APK。工程未增加远程运行时依赖。

英语阅读材料包是独立用户素材，未内置 APK；其第三方 gk 标记口径不等于严格官方 3500 词表。

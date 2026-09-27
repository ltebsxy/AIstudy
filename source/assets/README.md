# AI-StudyDesk 图标

图标初稿使用内置 `image_gen` 工具生成、编辑。经用户授权，现用 SVG 重建轮廓，消除生成图里的杂色、噪点与灰色光晕；保留打开的书本、屏幕轮廓、代码符号和上方星星。背景透明，无阴影。屏幕、代码符号和书本主体为浅薄荷绿 `#ACE3C8`，书本下缘为较深的淡绿色 `#79C6A3`；星星保持浅薄荷绿 `#ACE3C8`；在原构图基础上等比放大 10%，减少留白，改善小尺寸辨识度。描边统一为最新边缘截图中的背景色 `#1B1B1B`（RGB 27, 27, 27），原始路径描边宽度 0.5 像素（等比放大后为 0.55 像素）。边缘仅有正常透明抗锯齿，不额外叠加阴影或背景色。

- `icon.svg`：当前可编辑的矢量原稿，统一填色与描边。
- `icon-source.png`：由矢量原稿生成的 1254 × 1254 透明 PNG。
- `icon.png`：用于界面展示的 256 × 256 PNG。
- `icon.ico`：用于 Windows 窗口、任务栏和后续安装包，包含 16、20、24、32、40、48、64、128、256 像素尺寸。

在 `source/` 运行 `npm run icon`，通过 Electron Canvas 从 SVG 直接生成各尺寸 PNG 和 ICO；此操作不会封装应用。各尺寸独立栅格化，避免反复缩放产生边缘杂色。描边直接保存在图标文件中，界面不再添加 CSS 阴影。

Windows 启动时通过 `lib/app-icon.js` 将当前 ICO 写入用户数据下的 `icon-cache/ai-studydesk-<内容哈希>.ico`，窗口图标和任务栏重启图标使用此路径，避免同名文件的旧缓存。图标更新后，可执行 `node_modules\electron\dist\electron.exe scripts/create-shortcut.js` 同步本地源码版桌面快捷方式；旧安装版仍需发布新版安装包才会更新。

## 历史图像编辑提示词（已由上述矢量清理替代）

Precisely edit this transparent application icon, preserving the existing artwork and composition. Replace the current visible grey outlines on ALL main shapes with much thinner near-black outlines in exactly #141414 (RGB 20,20,20), matching a dark-mode app background. Reduce outline thickness to about one third of the current thickness: fine 2–3 pixel contour at this roughly 1254px source resolution, clean antialiased edges. Apply consistently to the mint star, both inner and outer edges of the white screen frame, both white angle brackets, white open book and mint bottom strokes. Keep white and mint fills, shape proportions, position and size unchanged. Remove the old thick grey border completely; there must be no remaining light-grey halo. No shadows, glow, blur, new shapes or letters. Keep genuine transparent alpha background everywhere between and outside the shapes, no black backdrop or rectangular tile. Ignore and remove negligible-alpha debris rather than outlining it. The result should blend naturally on a #141414 background while retaining a delicate thin outline on white. Transparent PNG, flat crisp logo.

## 上一版描边提示词

精确编辑这个透明背景的 AI-StudyDesk 应用图标：给所有实际图形的轮廓加一圈细、均匀、清楚但不抢眼的浅黑色描边（中性灰黑 #777777，约原图宽度的 0.8%，缩到 32–48px 时仍清晰）。包含星星、白色屏幕外框的内外边缘、两个 < > 符号、白色书本、书本下缘两条薄荷绿色线。保持原来白色和薄荷绿填色、构图、比例和形状；保留真实透明 alpha 背景，所有空隙透明。删除所有阴影、发光、模糊，不能增加底板、圆角背景或背景颜色，不加任何文字，不改变标志设计。忽略透明区域中的近乎透明杂点，不给杂点描边，只为主要的实心几何图形加平滑细描边。Flat vector-like outlined logo, thin neutral grey-black stroke, no drop shadow, transparent PNG.

## 透明底稿提示词

只做抠图，保留这个图标中央的白色打开书本、白色屏幕轮廓和中间白色 < > 代码符号、上方薄荷绿色四角星以及书本下缘的薄荷绿色线条。把所有深绿色圆角方块底板、纹理、光晕、阴影、残留背景完全删除，包括白色屏幕轮廓内部的绿色区域也全部删除。最终只留下中央符号本身，符号之间和周围都是真正的完全透明 alpha，不要用白色、黑色或棋盘格模拟透明，不要新背景、不加底板、不加阴影、不加字、不改白色和薄荷绿符号的颜色及形状。PNG transparent background, background extraction, clean antialiased edges, standalone centered symbol on square transparent canvas.

### 最后一次清理提示词

Clean up this transparent app icon into pristine flat vector-style artwork. There are unwanted white grungy flecks, debris, noisy semitransparent pixels and distressed artifacts BETWEEN the actual shapes, especially inside the screen and around the book. Remove every single speck and stray pixel, leaving perfectly EMPTY TRANSPARENT space between the retained shapes. Reconstruct the shapes as smooth solid fills if necessary; no photographic texture. Retain ONLY: a solid mint four-point star; a bold smooth white inverted-U screen outline; two smooth solid white angle brackets < >; a clean solid white open book with two smooth mint bottom strokes. No other pixels or objects. True transparent alpha background everywhere outside these precise solid shapes. Preserve composition and colors. Very clean professional geometric logo, crisp smooth antialiased edges. No background rectangle, no noise, no glow, no shadow, no text.

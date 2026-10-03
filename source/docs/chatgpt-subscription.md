# 使用 ChatGPT 订阅

AI-StudyDesk 的本地开源版提供 **Sign in with ChatGPT**。本应用不收取订阅费用；能否共享额度、可用模型和限制由 OpenAI 及账号／工作区政策决定。不要将此接入作为无限额度、API Key 或付费 API 余额出售。

## 操作

1. 打开「设置 → AI 设置 → ChatGPT 订阅」。点击 **Continue with ChatGPT**，在系统浏览器内登录并确认授权。
2. 选择已保存的账号／工作区及 OpenAI 返回的可用模型。选择「ChatGPT 订阅」，点击「保存设置」。系统提示词可在同一区域修改。
3. 聊天、上下文压缩、AI 批改和编程修改建议使用当前连接。修改建议仍需在应用内确认后才写入练习文件。
4. 「管理额度」打开 [ChatGPT 用量设置](https://chatgpt.com/settings/usage)。ChatGPT 订阅额度可能与其他应用共享；如果你在 ChatGPT 中允许使用点数，相关请求也受该选项控制。AI-StudyDesk 不自动改用付费 API。

可以添加多个账号／工作区，并分别保存注册和凭据。相同邮箱不代表相同工作区。未授权订阅权限时保留登录状态，但不发起推理；可手动点击「重新授权订阅」。额度不足或工作区不允许时，按提示在 ChatGPT 检查设置，不循环登录。

模型选择从当前账号的官方目录实时读取，刷新时不使用网络缓存，并显示可用数量。只有目录标为可展示的模型进入列表；若 GPT-6 Sol、GPT-6.1 Sol 尚未出现在此账号目录中，界面会明确提示，不能通过修改本地列表开通权限。API 区域提供 GPT-6.1 Sol、GPT-6 Sol、GPT-6 Astra、GPT-6 Luna 快速配置；它们需要用户自己的 API Key 和 API 访问权限，使用独立的 API 计费，不会自动把订阅连接切换过去。

## 数据与退出

- 本地聊天记录保存在应用数据目录。仅在发送、压缩、批改或提出修改建议时，发送当前请求所需的内容、历史上下文和附件；不会获取已有 ChatGPT 对话。
- 凭据由 Electron `safeStorage` 使用系统加密，保存为 `%APPDATA%\study-desk\chatgpt-accounts.json`。访问令牌、刷新令牌及 ID 令牌不进入渲染进程、浏览器存储、源码、启动文件或日志。不要分享此私人数据目录。应用不提供粘贴 Cookie 或导入其他程序登录凭据的入口。
- 「清除上下文」停止发送旧对话和摘要，保留本机记录；切换账号／模型使用不同上下文。
- 「退出此账号」尝试向官方撤销端点结束可续期会话，然后清除本机凭据，保留注册信息供再次登录。远程撤销未确认时会明确提示，请在 ChatGPT 设置中断开应用。

## 接入范围与维护

当前实现按官方本地开源客户端规范：Authorization Code + PKCE、随机 state／nonce、仅监听 `127.0.0.1`、验证官方 JWKS 签名和身份、检查实际授予的权限、分别管理账号和轮换凭据。使用公开 `/v1/models` 和 `/v1/responses`，每次推理设置 `store:false`、`stream:true`，收到完成事件才保存成功结果；不使用 ChatGPT `backend-api`、网页 Cookie、额度规避或共享凭据代理。

主机标识 `ext_agent_host_id` 使用官方支持的 `urn:uuid:<UUIDv4>` 格式，同一安装持续复用。早期源码保存的普通 UUID 会自动补上 `urn:uuid:` 前缀，保留原 UUID、注册与加密凭据。若浏览器提示 `invalid_authorize_request` 且 `param` 为 `ext_agent_host_id`，请运行最新源码并重新点击登录，不要继续刷新旧授权页面。

网络请求使用 Electron 原生网络栈及系统网络配置，显式排除浏览器 Cookie，并禁止重定向携带凭据。无法访问时不会尝试绕过 OpenAI 的访问限制。HTTP 拒绝和非 JSON 页面会显示对应提示。

登录界面显示当前阶段：获取登录配置、打开授权浏览器、等待授权返回、交换授权凭据、验证账号身份、保存登录。失败时会标出阶段，请提供该报错以区分网络、浏览器回调和账号授权问题。应用数据目录的 `chatgpt-login-status.json` 仅记录最近一次尝试的固定阶段、时间、状态及错误码；不记录授权网址、授权码、令牌、邮箱或响应正文。

支持文字，以及所选模型接受的图片／PDF 输入。不提供此预览不支持的音视频、Files 上传接口、图像生成或托管工具。`store:false` 表示不使用 Responses 对话存储，并不意味着 OpenAI 完全不处理或不保留服务所需的数据；OpenAI 的数据规则和用户授权仍适用。

此模式仅用于本地开源版。目前官方要求付费或远程托管应用另行申请接入；未来商业化或托管前须重新核对接入资格和条款，不能直接沿用本地开源资格。官方预览可能调整，应用应随规范更新。测试使用本地模拟服务，不代表 OpenAI 对本应用做过审核或保证任何账号可以使用；真实登录和额度须由用户授权后验证。

学习功能用于自主练习和反馈；AI 评分需要复核，不用于自动决定正式成绩、升学或其他教育权益。用户须拥有上传材料的必要权限，并遵守 OpenAI 使用政策；不得分享账号凭据、绕过访问限制／安全措施或用于学术作弊。年龄及监护人许可要求沿用 OpenAI 账号条款。软件不声称获得 OpenAI 背书。

官方参考（2026-10-02 核对）：

- [接入资格与快速开始](https://developers.openai.com/siwc/quickstart)
- [注册、授权及身份验证](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [账号管理、凭据安全与退出](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [模型与推理接口](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [界面与额度提示要求](https://developers.openai.com/siwc/ui-ux-guidelines)
- [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [OpenAI 官方条款和政策入口](https://openai.com/policies/)
- [使用条款](https://openai.com/policies/terms-of-use/)
- [使用政策](https://openai.com/policies/usage-policies/)

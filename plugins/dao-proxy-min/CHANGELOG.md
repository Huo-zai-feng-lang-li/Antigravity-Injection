# Changelog · dao-proxy-min

> 完整版本历史。详情页（README）保持精简，本文件单列于扩展的 Changelog 标签页。

v9.9.81 · 同步 Pro v9.9.342 的 Antigravity 标题修复：识别内部 Gemini REST 的 `request.contents[]` 包装结构，仅把标题第一行约束改为简体中文，保留第二行目标摘要协议；新增与 Pro 共用的真实包装请求回归。

v9.9.80 · 自定义状态 Badge 样式优化：同步 Pro v9.9.337。将“自定义 xx字 · xxs前”Badge 的大小与边框/背景样式调整为与前面的“官”、“编”按钮完全一致，并彻底移除时戳秒数的下划线。

v9.9.79 · Antigravity UI 同步与版本号演进。

v9.9.78 · Antigravity UI 文案收束：同步 Pro v9.9.334。侧栏改用短标题/短状态，不再在前端显示内部字段或旧“本源体/帛书头/默认道德经路径”长文案；提示词反代协议不变。

v9.9.77 · 纯系统提示词策略：同步 Pro v9.9.333。道/自定义模式不再拼接任何官方工具/MCP/实时上下文块，系统提示词只保留当前经藏默认文本或用户自定义文本；同步关闭 `keep_blocks` 状态位，减少英文模块残留与额外 token 开销。

v9.9.76 · Antigravity 内部 Gemini REST 结构保持替换：同步 Pro v9.9.332。内部私有 REST 不再完全透传，而是在不污染根对象 schema 的前提下，只替换已有嵌套 Gemini 字段或已有官方系统提示词长文本，避免 `contents/systemInstruction/system_instruction` 400，同时恢复提示词反代。

v9.9.75 · Antigravity 内部 Gemini REST 私有请求透传修复：同步 Pro v9.9.331。内部 `/v1internal:streamGenerateContent` 属于 Antigravity 私有 Cloud Code payload，不再改造成公开 Gemini 顶层字段或 `contents` 承载；公开 `/vN:*GenerateContent` 注入逻辑保持不变。

v9.9.74 · Antigravity 内部 Gemini REST 承载修复：同步 Pro v9.9.330。实机最新 400 已证明 `/v1internal:streamGenerateContent` 同时拒绝顶层 `systemInstruction` 与 `system_instruction`。本版只把二者作为输入兼容读取，出站删除顶层字段，并把反转后或默认系统提示词前置到 `contents[].parts[].text`，避免继续触发私有 Cloud Code REST 字段校验。

v9.9.73 · Antigravity Cloud Code REST 字段名修复：同步 Pro v9.9.329。道模型实机返回 HTTP 400 `Unknown name "systemInstruction": Cannot find field`，说明 Gemini REST/SSE 注入已进入代理但字段名被 Antigravity 内部 Cloud Code REST 拒绝。本版统一输出 `system_instruction.parts[].text`，兼容读取旧 `systemInstruction`，但出站删除 camelCase，避免 400；检查脚本同步禁止再次输出被拒字段。

v9.9.72 · Antigravity Gemini REST/SSE 主请求注入修复：同步 Pro v9.9.328。Antigravity 真聊天请求为 `POST /v1internal:streamGenerateContent?alt=sse`，旧版只官方透传这类 REST 路径，未改写 JSON `systemInstruction`，因此提示词保存后仍可能不进入模型。本版新增 `GEMINI_REST_CHAT` 分类，支持改写 `systemInstruction.parts[].text`，缺失时注入当前自定义/默认提示词，并让 `/origin/tape` 能捕获该 REST/SSE 链路；响应 SSE 仍原样透传。

v9.9.71 · Antigravity server 崩溃修复：同步 Pro v9.9.327。Antigravity 的 language server 由官方 server 管理，插件在延迟文件锚定后不应主动 `forceRestartLS()`；本版在 `TARGET_IDE=Antigravity` 下跳过自动 LS 重启，只保留 spawn hook 端点改写与本地反代。

v9.9.70 · Antigravity `/v1internal:*` 初始化路由修复：同步 Pro v9.9.324。Antigravity 的 `POST /v1internal:fetchUserInfo` 等初始化端点是 REST 风格路径，不带传统 Twirp 服务前缀，旧路由会误落 Windsurf 管理上游并返回 404。本版在 `TARGET_IDE=Antigravity` 下将 `/vN:*` 与 `/vNinternal:*` 直接送往 `daily-cloudcode-pa.googleapis.com`，并补充官方请求日志，便于继续核对真实聊天请求。

v9.9.68 · Antigravity 无响应初始化链路修复：同步 Pro v9.9.322 的上游归宿修正。Antigravity 原生 Cloud Code 端点为 `daily-cloudcode-pa.googleapis.com`，Min 版默认 chat/API 归宿不能继续写死 Windsurf/Codeium 的 `server.codeium.com`。本版按 `TARGET_IDE=Antigravity` 将 `UPSTREAM_API` 默认设为 `daily-cloudcode-pa.googleapis.com`，`UPSTREAM_CHAT` 默认跟随 `UPSTREAM_API`，并让 `ApiServerService` / `LanguageServerService` 初始化类 RPC 先走 API 上游，避免 `loadCodeAssist` / `fetchUserInfo` 404 后模型目录退化。

v9.9.67 · Antigravity 提示词反代安装态修复：v9.9.66 同版本安装目录可能仍保留旧 extension.js，缺少 `--cloud_code_endpoint` 改写，导致 language_server 继续直连 `daily-cloudcode-pa.googleapis.com`，自定义 IDE 模型提示词虽已写入 `~/.codeium/dao/ide_prompt.json` 但请求未进入本地代理。本版提升补丁版本，强制 Antigravity 生成新扩展目录，并将发布检查加入版本防缓存断言；代理核心逻辑不变，继续统一改写 `--api_server_url`、`--inference_api_server_url`、`--cloud_code_endpoint`。

v9.9.66 · Antigravity 首装反代启动修复：补齐 bundled-origin/source.js 的 os 依赖，修复点击「道Agent 启」/「官方Agent」时报 `os is not defined` 导致代理未启动的问题。此修复只影响自定义 IDE 提示词落盘路径解析，不改变反代协议与端口逻辑。

v9.9.65 · 根治「装插件后官方免费模型报错·官方聊天回传主机错配」(用户旨意): 与 dao-proxy-pro v9.9.317 同根同源的修复。不装插件时语言服务器(LS)原生直连 server.codeium.com 一切正常；装插件(invert 拦截)后, 官方聊天 GetChatMessage/GetChatMessageV2/RawGetChatMessage 的回传主机未被钉到 api_server——v9.3.2 曾据 v9.2.1 捕获的 67 reqs「默认分流(chat→inference)通」而回归默认分流, 且 v9.9.64 又把 ApiServerService 移出 INFERENCE_SERVICES, 使官方聊天默认落到 inference/MGMT, 对本账号确定性返回「third-party model provider unavailable」→ Model provider unreachable。实证(直连 replay·同一请求同字节)推翻旧判断: GetChatMessage → server.codeium.com 得 HTTP 200 真实聊天流; → inference.codeium.com 得错误 JSON。修复: `UPSTREAM_CHAT` 默认值由 `""` 改为 `"server.codeium.com"`, 使既有的「方法名级 chat 分流」块默认生效, 官方聊天钉到 api_server(与 LS 原生 --api_server_url 一致); 非聊天的 inference RPC 仍按 INFERENCE_SERVICES 走 inference, 不受影响。`CHAT_UPSTREAM` env 仍可显式覆盖。

v9.9.64 · 道法自然 · 从 Pro 版吸取底层修复 · DevService/ApiServerService 退出 INFERENCE_SERVICES · 管理 RPC 归位 MGMT · 繁体经文(帛书老子 + 道藏阴符经)· 适配 Windsurf + Devin Desktop 双环境。

# Changelog · zk-proxy-pro

> 完整版本历史。详情页（README）保持精简，本文件单列于扩展的 Changelog 标签页。

## v9.9.526 · 修复流式空闲超时误杀长时间终端任务

**问题**：v9.9.523 的流式结束保险中，30 秒空闲超时对所有响应生效。当大模型执行长时间终端任务（编译、npm install、运行测试等）时，官方服务器可能 30 秒内不发送任何数据，空闲超时会强制 `res.end()` 并取消上游，导致正在进行的任务被错误中断。

**修复**：
1. 空闲超时仅对 `text/event-stream`（SSE 流式聊天响应）启用，非流式响应（JSON/proto）不设空闲超时
2. 空闲超时阈值从 30 秒延长到 120 秒，给终端任务足够时间
3. end/close 双保险对所有响应保留（只有上游真正结束才触发，不会误杀）

## v9.9.525 · 插件名统一为 zk-proxy-pro · 移除 dao 命名

**命名统一**：插件 name 从 `dao-proxy-pro` 改为 `zk-proxy-pro`，完整扩展 ID 从 `zk-agent.dao-proxy-pro` 变为 `zk-agent.zk-proxy-pro`。两个项目命名完全统一为 ZK 系列，移除历史遗留的 dao 命名。同步修改：extension.js/source.js 中的扩展 ID 引用和日志、handoff 文件名、old-compat-manager 的 Bridge AGENT_PRO_ID 和 PSM1 $prefix。

## v9.9.524 · 模型改写合并进插件 · 动态映射支持未来新模型

**架构变更**：将模型改写（gemini-2.5-pro 占位符 → 实际模型名）从 old-compat-manager 移入插件源码。`_ag-gemini37-compat.cjs` 现在随 VSIX 打包，source.js 内置 require 和 hook。**更新插件后不再需要运行 old-compat-manager 重新注入模型改写**。

**动态映射**：改写逻辑从硬编码 `gemini-2.5-pro → gemini-3.8-flash-high` 改为**从请求 URL 提取实际模型名**。GEMINI_REST_CHAT 的 URL 格式为 `/v1beta/models/{model}:generateContent`，代理从中提取用户实际选择的模型名，改写请求体里的 LS 占位符。这样官方发布任何新模型（3.9/4.0/4.1），只要模型解锁让它显示在 UI，用户选择后就能自动正确代理，**不需要改映射代码**。URL 提取失败时回退到默认 `gemini-3.8-flash-high`。

**职责重新划分**：
- 插件（注入层）：提示词注入、标题汉化、文件上下文、摘要剔除、模型解锁、流式结束保险、**模型改写/动态映射**
- old-compat-manager（兼容层）：Bridge 部署、版本伪装、模型列表过滤（移除了模型改写职责）

## v9.9.523 · 修复流式响应结束信号丢失 · 防 Generating 卡死

**🔥 致命修复**：模型回答完毕后 IDE 一直显示 "Generating……" 不结束，最终卡死。根因是 `proxyToCloud` 中 `upStream.pipe(res)` 依赖上游 H2 stream 的 `end` 事件触发 `res.end()`，但官方服务器偶发不发送 END_STREAM 帧（或 stream 以 `close` 而非 `end` 结束），导致 `res.end()` 永不调用，IDE 一直等待。修复：在 pipe 后添加三重保险——①`upStream.on("end")` 显式调 `res.end()`；②`upStream.on("close")` 显式调 `res.end()`；③30 秒空闲超时（无数据则强制 `res.end()` + 取消上游）。确保响应必结束。

## v9.9.522 · 修复 autoModelUnlock 初始调用丢失 · 模型解锁自动生效

**🔥 致命修复**：v9.9.519 删除模型解锁命令时，连带删除了 `autoModelUnlock(_cachedPort)` 的初始调用（原在 setTimeout 中与 refreshStatusBar 一起被删）。函数定义仍在但永不执行，导致 `_model_unlock_enabled` 文件不创建，模型解锁实际禁用，UI 无完整模型元数据，发送请求时模型为 unknown，LS 拒绝请求（`neither PlanModel nor RequestedModel specified`）。已在 `proxyStart` 成功后（`_publishPort` 之后）恢复 `autoModelUnlock(_cachedPort)` 调用，代理启动后自动解锁，无需手动操作。

**根因链**：删除状态栏 → 误删 `setTimeout(() => { autoModelUnlock(_cachedPort); refreshStatusBar(); }, 8000)` → autoModelUnlock 永不执行 → 模型解锁禁用 → 模型元数据缺失 → 请求模型为 unknown → Failed to send。

## v9.9.521 · 恢复 MODEL_UNLOCK 分类 · 基线功能

**恢复**：source.js `classifyRPC` 中 GetUserSettings/GetCascadeModelConfigs → `return "MODEL_UNLOCK"`（v9.9.518 被错误注释，写"交 old-compat-manager 负责"，但 GetUserSettings 是 IDE→LS 的 gRPC 请求不经过 HTTP 代理，old-compat-manager 无法处理，必须由插件在 source.js 中注入）。模型解锁是插件基线功能，禁止注释或删除。

## v9.9.520 · 修复摘要剔除位置致命 bug · 统一显示名 ZKAgent Pro

**🔥 致命修复**：v9.9.518/519 中摘要剔除代码被错误地插入在 `let _eaBody = body;` 定义之前，触发 JavaScript 暂时性死区（ReferenceError: Cannot access '_eaBody' before initialization），导致每次聊天请求时代理直接崩溃。已将摘要剔除代码移到 `_eaBody` 定义和 SP 修改之后。

**显示名统一**：package.json 中所有 "DAOAgent Pro"（activity bar 标题、命令分类等 28 处）统一改为 "ZKAgent Pro"。publisher 保持 `zk-agent`。

## v9.9.519 · publisher 改 zk-agent · 删除底部状态栏和中央面板 · 删除模型解锁命令

**publisher 改为 zk-agent**：与 old-compat-manager 统一（已同步修改 StableMode.Core.psm1 前缀和 OneLSAgentProxyBridge.cjs 的 AGENT_PRO_ID）。显示名称 ZKAgent Pro。

**删除底部状态栏**：移除右下角状态栏入口（_statusBarItem）和点击打开的中央面板（zk.eaConfig / cmdEaConfig）。提示词查看和编辑只在侧边栏。

**删除模型解锁命令**：移除 zk.modelUnlock.toggle/status 命令和 cmdModelUnlockToggle/Status 函数。模型可见性/过滤全交 old-compat-manager。source.js 中 classifyRPC 入口已禁用 MODEL_UNLOCK。

**保留**：侧边栏 webview（提示词查看/编辑）、提示词注入、标题简体中文、文件上下文元信息、历史摘要剔除、性能优化。

## v9.9.518 · 加回历史摘要剔除 · 禁用模型解锁

**加回**：`<conversation_summaries>` 历史摘要剔除（v9.9.510 功能，回退到 9.9.506 后丢失，现加回）。所有聊天请求（CHAT_PROTO/CHAT_RAW/GEMINI_REST_CHAT）无条件剔除该标签块，消除注意力稀释、认知漂移和跨任务污染。

**禁用**：模型目录解锁（GetUserSettings 注入全量模型）。在 classifyRPC 入口禁用，GetUserSettings/GetCascadeModelConfigs 直透官方。模型可见性/过滤交 old-compat-manager 负责。

## v9.9.517 · 最终方案·dao-agi 统一发布·注入层专用

回退到 v9.9.506 干净代码基线，发布者统一为 `dao-agi.zk-proxy-pro`，与 antigravity-old-compat-manager 完全匹配。

**插件只做注入层**：提示词注入、会话标题简体中文、文件上下文元信息、性能优化（keepAlive false）。

**移除所有与 old-compat-manager 重叠的功能**：模型改写/别名映射、Bridge 修补部署、模型列表过滤/白名单、版本伪装、官方模型检测、历史摘要剔除、面板重构。

**项目分工（零重叠）**：
- 插件（zk-proxy-pro）：注入层
- old-compat-manager：兼容层（模型改写/Bridge/过滤/伪装/认证/备份）

## v9.9.506 · 基线版本

HEAD `b48a27e`。keepAlive true。后续 v9.9.507~516 为实验性迭代，最终因功能重叠和 extension.js 结构持续损坏，回退到本基线。

---

**教训**：v9.9.510~516 面板重构连续破坏 extension.js 结构（activate/deactivate 被删、EaRouterProvider 重复声明）。根因是功能重叠——插件做了 old-compat-manager 的事，导致双重注入冲突。最终方案：插件只做注入层，兼容层全交 old-compat-manager。

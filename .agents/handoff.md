# 最新接续状态 (2026-09-05 12:53)

## 核心进展
- 当前稳定版本 **zk-agent.zk-proxy-pro@9.9.528**，已安装、已构建 VSIX(518.58KB)、已 push 并发布 GitHub Release `zk-proxy-pro-v9.9.528`，代理实测正常、可正常发送请求。
- 核心文件：`plugins/zk-proxy-pro/vendor/bundled-origin/source.js`（代理主体）、`plugins/zk-proxy-pro/extension.js`（扩展入口）、`plugins/zk-proxy-pro/vendor/bundled-origin/_ag-gemini37-compat.cjs`（模型改写/动态映射）。

## 核心动机与背景 (Motivation & Background)
- 用户目标：插件稳定可用 + 性能优秀；只保留「提示词注入 / 会话标题简体中文 / IDE 文件上下文元信息 / 历史摘要剔除」，模型相关兼容交给 old-compat-manager。
- 两项目职责零重叠：
  - **本插件（注入层）**：提示词注入、标题汉化、文件上下文、摘要剔除、模型改写/动态映射、流式结束保险。
  - **old-compat-manager（兼容层）**：Bridge 部署、版本伪装(product.json ideVersion=2.5.5)、模型列表过滤(workbench.js)、认证时序、备份恢复。
- 关键事实（用户确认）：账号登录后无论免费还是 VIP，官方本身就返回全量模型列表；模型过滤在另一项目做，故本插件不需要模型解锁。

## 关键设计与实现 (Implementation & Decisions)
- **v9.9.528 模型解锁默认禁用**：`_isModelUnlockEnabled()` 标记文件缺失时由默认 true 改为 false；仅显式写 "1"/"true"/"enabled" 才启用。移除 proxyStart 后的 autoModelUnlock 自动调用并删除该死代码函数。GetUserSettings/GetUserStatus 从「缓冲-解析-重写」变回流式直透。保留 `/origin/model_unlock` 手动端点，账号权限受限时 POST `{enabled:true}` 可恢复。
- **历史澄清**：v9.9.519 的 Failed to send 真因是模型改写被冲掉（当时在 old-compat-manager，覆盖已安装 source.js 冲掉注入），与模型解锁无关——默认值本就是启用，删 autoModelUnlock 不改变解锁状态。
- **v9.9.527 流式结束保险修正**：空闲超时仅对 `text/event-stream`(SSE) 生效，阈值 30s→120s，避免大模型执行长时间终端任务(编译/npm install/测试)时被误杀；非流式响应只靠 end/close 双保险（上游真正结束才触发，不会误杀）。
- **v9.9.524 模型改写合并进插件 + 动态映射**：`_ag-gemini37-compat.cjs` 随 VSIX 打包；从 URL `/v1beta/models/{model}:generateContent` 提取实际模型名，改写 LS 占位符 `gemini-2.5-pro`，支持未来 3.9/4.0/4.1 自动适配；URL 提取失败回退 `gemini-3.8-flash-high`。source.js 在 `const net=require("net")` 前 require，在 GEMINI_REST_CHAT 分支 modifyGeminiRestSP 后 hook。
- **v9.9.525 命名统一**：name `dao-proxy-pro`→`zk-proxy-pro`，publisher=`zk-agent`，完整 ID `zk-agent.zk-proxy-pro`；old-compat-manager 的 Bridge AGENT_PRO_ID、PSM1 $prefix 同步。
- **摘要剔除**：`_stripConvSummaries`/`_stripConvSummariesProto` 对 CHAT_PROTO/CHAT_RAW/GEMINI_REST_CHAT 无条件剔除 `<conversation_summaries>` 块，解析失败安全透传。
- **性能结论（已向用户说明，勿再做无意义代理侧优化）**：代理侧每请求总开销 <10ms（内存操作 + 2 个小配置文件同步读约 0.1-1ms）；上游 H2 session 已通过 `_h2Sessions` 复用，不重复 TCP/TLS 握手；keepAlive:false 仅作用于外网 HTTP 代理 CONNECT 隧道(_OriginTunnelAgent)，直连不影响。首字延迟 200-2000ms 的瓶颈在官方服务器推理与网络，代理无法压缩。

## 待办事项 (Next Steps)
- [ ] 当前版本功能已闭环，无必须修改项。用户在 IDE 模型选择器确认所有模型正常显示/可选/可对话即可（已确认能正常发送）。
- [ ] 可选（用户未确认，勿擅自动手）：在代理里加「收到请求→转发上游→首字节→结束」分阶段耗时埋点，用真实数据定位首字延迟发生在哪一段。
- [ ] 若未来发现模型变灰/消失（账号权限受限场景），POST `http://127.0.0.1:8937/origin/model_unlock` body `{"enabled":true}` 手动恢复模型解锁。

## 关键上下文
- 目录: D:\Desktop\Super-File\AI-IDE\AI\反重力\Antigravity-Injection
- 姊妹项目: D:\Desktop\Super-File\AI-IDE\AI\反重力\antigravity-old-compat-manager
- IDE 安装根: D:\Antigravity（启动 `D:\Antigravity\Antigravity.exe --remote-debugging-port=9000`）
- 扩展目录: C:\Users\Administrator\.antigravity\extensions\zk-agent.zk-proxy-pro-9.9.528\
- 代理端口 8937；健康检查 http://127.0.0.1:8937/origin/ping（看 self_file 指向版本目录）；解锁状态 http://127.0.0.1:8937/origin/model_unlock（当前 enabled:false）
- Bridge: D:\Antigravity\resources\app\dao-one-ls-agent-pro.cjs（AGENT_PRO_ID=zk-agent.zk-proxy-pro，由 old-compat-manager 部署）
- GitHub: https://github.com/Huo-zai-feng-lang-li/Antigravity-Injection ；外网用代理 http://127.0.0.1:51081；gh CLI 需 `Remove-Item Env:GITHUB_TOKEN` 切到 keyring token（带 repo scope）才能建 release
- 构建: `npm run build`（node scripts/build-vsix.mjs）；安装需手动解压 VSIX 到扩展目录并更新 extensions.json(数组结构) + 清空 .obsolete，命令行 --install-extension 不可靠
- 写含中文文件用 Node fs.writeFileSync / Write 工具，禁止 PowerShell Set-Content(加 BOM)；PowerShell 内联 Node 含正则必须写临时文件执行
- 完全关闭 IDE：任务管理器确认无 Antigravity.exe 与 language_server 进程；代理运行在扩展主机进程内，非独立 node 进程

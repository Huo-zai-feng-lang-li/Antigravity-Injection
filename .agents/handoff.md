# Handoff · zk-proxy-pro v9.9.527

## 当前状态
- 版本：`zk-agent.zk-proxy-pro v9.9.527`
- 发布者：`zk-agent`（必须与 old-compat-manager 一致）
- 已安装：`C:\Users\Administrator\.antigravity\extensions\zk-agent.zk-proxy-pro-9.9.527\`（唯一版本，旧版本已删除）
- 最新 VSIX：`dist/zk-proxy-pro-9.9.527.vsix`
- 代理端口：8937

## v9.9.526 ~ v9.9.527 变更
- 流式空闲超时仅对 SSE (text/event-stream) 生效，由 30s 延长至 120s，防止误杀大型/思考型长任务请求
- 插件完整扩展 ID：`zk-agent.zk-proxy-pro`
- bridge-patch 模板 AGENT_PRO_IDS 维持三版本兼容
- 清理旧版本缓存与目录，本地与 Git 均已同步至 v9.9.527

## 项目分工（零重叠）

### 本插件（注入层 + 模型改写）
- 提示词注入
- 会话标题简体中文
- 文件上下文元信息（ide-context.js）
- 历史摘要剔除（`<conversation_summaries>`）
- 模型解锁（GetUserSettings 注入全量模型目录，autoModelUnlock 自动执行）
- 流式响应结束保险（end/close/30s空闲超时三重保险，防 Generating 卡死）
- **模型改写 / 动态映射**（v9.9.524+ 从 old-compat-manager 移入）
  - `_ag-gemini37-compat.cjs` 随 VSIX 打包
  - 从 URL `/v1beta/models/{model}:generateContent` 提取实际模型名
  - 改写 LS 占位符 `gemini-2.5-pro` → 用户实际选择的模型
  - 支持未来新模型（3.9/4.0/4.1）自动适配，无需改代码
  - URL 提取失败时回退到默认 `gemini-3.8-flash-high`
- 性能优化（keepAlive false、TTL 缓存、短路预筛）

### old-compat-manager（兼容层）
- Bridge 修补部署（dao-one-ls-agent-pro.cjs）
- 模型列表过滤/白名单（修改 workbench.js，防 IDE 卡死）
- 版本伪装（product.json ideVersion=2.5.5）
- 认证时序修复
- 备份/恢复/自愈
- **不再负责模型改写**（已移入插件 v9.9.524+）

## 关键约束
- 发布者必须是 `zk-agent`，不得改名（old-compat-manager 的 Bridge AGENT_PRO_ID 硬编码匹配）
- 插件不得实现 Bridge、模型过滤、版本伪装（改 app 目录的功能）
- 大文件（extension.js/source.js）禁止模糊锚点大范围替换
- 模型解锁是基线功能，禁止注释或删除（v9.9.518 误注释导致 Failed to send）
- autoModelUnlock 必须在 proxyStart 成功后调用（v9.9.519 误删导致模型解锁永不执行）
- 模型改写已在插件内（v9.9.524+），更新插件后**不需要**重新运行 old-compat-manager 注入

## 血的教训
1. **目录搞错**：修改 9.9.520 目录但代理加载 9.9.522，改了白改。必须先检查代理的 self_file 确认加载目录。
2. **覆盖冲掉模型改写**：v9.9.524 之前，每次用项目源码覆盖已安装 source.js，都会冲掉 old-compat-manager 注入的模型改写。v9.9.524 后模型改写已在插件源码内，不再有此问题。
3. **删除状态栏连带删除 autoModelUnlock**：v9.9.519 删除状态栏时把 `setTimeout(() => { autoModelUnlock(_cachedPort); refreshStatusBar(); }, 8000)` 整块删了，导致模型解锁永不执行。
4. **注释 MODEL_UNLOCK**：v9.9.518 注释掉 classifyRPC 中的 MODEL_UNLOCK 分类，写"交 old-compat-manager 负责"，但 GetUserSettings 是 gRPC 请求不经过 HTTP 代理，old-compat-manager 无法处理。

## 使用流程
- 日常使用：什么都不用管，直接打开 IDE
- 重装 IDE 后：安装插件 VSIX → 运行 old-compat-manager「应用并启动」（Bridge/版本伪装/模型过滤）→ 启动 IDE
- 更新插件后：安装新 VSIX → 重启 IDE（模型改写自动生效，不需要 old-compat-manager）

## 待办
- 无。当前版本功能完整，全套测试 20/20 全部通过，VSIX 打包完成，上下文误伤已彻底修复。


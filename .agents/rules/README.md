# Antigravity-Injection 项目规则

> 修改任何代码前必读。本文档定义项目边界、编码规范和验证流程。

---

## 1. 项目定位与分工边界（最高优先级）

本项目是 **Antigravity IDE 提示词注入插件**，发布者 `zk-agent.zk-proxy-pro`。

### 1.1 本插件做（注入层 + 模型改写）

| 功能 | 代码位置 | 说明 |
|---|---|---|
| 提示词注入 | `source.js` + `sp_invert.js` | 拦截推理请求，替换/注入系统提示词 |
| 会话标题简体中文 | `source.js` + `title-classifier.js` | 检测标题生成请求，改写为简体中文约束 |
| 文件上下文元信息 | `ide-context.js` | 注入活跃文件上下文到提示词 |
| 历史摘要剔除 | `source.js` `_stripConvSummaries` | 剔除 `<conversation_summaries>` 标签块，消除认知漂移 |
| 模型解锁（全量模型目录） | `source.js` MODEL_UNLOCK + `extension.js` autoModelUnlock | 拦截 GetUserSettings 响应注入全量模型目录，代理启动后自动执行 |
| 流式响应结束保险 | `source.js` stream-idle | end/close/30s空闲超时三重保险，防 Generating 卡死 |
| 模型改写 / 动态映射 | `_ag-gemini37-compat.cjs` + `source.js` hook | v9.9.524+ 从 old-compat-manager 移入。从 URL 提取实际模型名，改写 LS 占位符 gemini-2.5-pro。支持未来新模型自动适配 |
| 性能优化 | `source.js` | keepAlive false、TTL 缓存、短路预筛 |

### 1.2 本插件绝对不做（兼容层 → old-compat-manager）

以下功能由 **antigravity-old-compat-manager** 独立负责，本插件不得实现：

- ❌ Bridge 修补部署（OneLSAgentProxyBridge.cjs）
- ❌ 模型列表过滤/白名单（修改 workbench.js）
- ❌ 版本伪装（product.json ideVersion=2.5.5）
- ❌ 认证时序修复（main.js 正则替换）
- ❌ 修改 app 目录下任何文件

> 注：模型改写/动态映射已于 v9.9.524 从 old-compat-manager 移入插件，不再属于兼容层职责。

### 1.3 红线检查清单

提交前必须确认插件代码中**不存在**以下标识符：

```
_ensureAgentProBridge
_applyModelWhitelist
_ensureProductVersion
/origin/model_whitelist
/origin/official_models
```

> 注：`_stripConvSummaries`（历史摘要剔除）、`_agGemini37Compat`（模型改写/动态映射，v9.9.524+）、`/origin/model_catalog`（模型目录查看）和模型解锁（GetUserSettings 注入全量模型）都是插件自身功能，不在红线内。模型解锁让所有模型可见，old-compat-manager 再做白名单过滤。保留。

### 1.3.1 模型解锁基线红线（v9.9.522 血的教训）

模型解锁是插件**必须保留**的基线功能，禁止注释、删除或"交 old-compat-manager 负责"：

1. **source.js `classifyRPC`**：`GetUserSettings` / `GetCascadeModelConfigs` 必须 `return "MODEL_UNLOCK"`。GetUserSettings 是 IDE→LS 的 gRPC 请求，不经过 HTTP 代理，old-compat-manager 无法处理，必须由插件在 source.js 响应注入中处理。
2. **extension.js `autoModelUnlock`**：函数定义后必须在 `proxyStart` 成功后调用 `autoModelUnlock(_cachedPort)`。删除状态栏/面板时不得连带删除此调用（v9.9.519 误删导致模型解锁永不执行，`_model_unlock_enabled` 文件不创建，UI 无模型元数据，请求模型为 unknown → Failed to send）。
3. **验证**：发版前必须确认 `_model_unlock_enabled` 文件在代理启动后自动创建，`http://127.0.0.1:<port>/origin/model_unlock` 返回 `enabled: true`。

出现任何一个即为架构越界，必须回退。

### 1.4 为什么必须分离

v9.9.510~516 的教训：插件做了 old-compat-manager 的事，导致：
1. 双重模型改写冲突
2. Bridge 修补互相覆盖
3. 模型列表双重过滤 → IDE 前端死循环卡死
4. extension.js 持续被面板重构破坏（activate/deactivate 被删）

分离后两个项目功能零重叠，互不影响。

---

## 2. 发布者与版本

- **发布者**：`zk-agent`（必须与 old-compat-manager 的 Bridge/模型改写目标一致）
- **插件 ID**：`zk-proxy-pro`
- **完整扩展 ID**：`zk-agent.zk-proxy-pro`
- **显示名称**：ZKAgent Pro
- **版本信源**：`plugins/zk-proxy-pro/package.json` 的 `version` 字段
- **版本递增**：任何代码变更发版时递增 patch 版本
- **目录名**：仓库目录仍为 `plugins/zk-proxy-pro/`（历史遗留，不影响发布）

> ⚠️ **注意**：发布者不得改为其他值。old-compat-manager 的 Bridge cjs（AGENT_PRO_ID）和模型改写注入（扩展目录前缀）都硬编码匹配 `zk-agent.zk-proxy-pro`，改名后兼容层全部失效。改发布者必须同步修改 old-compat-manager 的两处：`scripts/StableMode.Core.psm1` 的 `$prefix` 和 `runtime/OneLSAgentProxyBridge.cjs` 的 `AGENT_PRO_ID`。

> ⚠️ **UI 边界**：插件只有侧边栏 webview（提示词查看/编辑），没有底部状态栏、没有中央面板、没有模型别名映射 UI、没有模型解锁命令。这些功能全部删除或交 old-compat-manager。

---

## 3. 编码规范

### 3.1 大文件修改禁忌（v9.9.507~516 血的教训）

- extension.js 是 20 万行级大文件，**禁止**用模糊锚点做大范围替换
- 插入函数时：锚点必须包含完整上下文（函数签名+闭合+后续注释），插入后必须确认函数在模块级
- 替换 HTML/JS 块时：必须验证 startIdx 和 endIdx 都在目标函数范围内，绝不能让 endIdx 越界
- `node --check` 只能查语法错误，**查不出**运行时未定义函数引用。大改后必须人工确认 activate/deactivate 完整

### 3.2 Windows / PowerShell 禁忌

- 禁止在 `pwsh -Command` 中拼接复杂多行 JS/JSON
- 写含中文的文件必须用 Node.js 脚本，禁止 PowerShell `Set-Content`（会加 BOM 搞乱编码）
- 路径含中文时用 `pwsh -NoProfile -File` 执行临时脚本
- `git show > file` 会加 BOM，必须用 Node.js 的 `execSync` + `fs.writeFileSync`

### 3.3 性能约束

- 热路径（请求拦截）必须用 `Buffer.indexOf` 预筛做零解析短路，无命中不做 JSON.parse
- 读盘操作（mode/canon/配置文件）必须有 TTL 缓存（默认 500ms）
- keepAlive 必须为 false（true 会导致连接复用问题和 Gemini 503）

---

## 4. 提示词注入规则

### 4.1 标题改写规则

- 只在检测到标题生成请求时触发（`generate a short conversation title` / `title classifier` / `title_only_zh_sp`）
- 只替换第一行为简体中文约束，必须完整保留第二行及以后的格式协议行
- 严禁修改正常 Agent 对话、代码补全或工具调用的 Payload

### 4.2 settings.json JSONC 保留

- 注入 `settings.json` 时必须保留 JSONC 注释，严禁 `JSON.stringify(JSON.parse(...))` 直接覆盖

### 4.3 卸载 Fail-Safe

- deactivate 或切回官方模式时必须清锚（清理环境变量与代理端口），确保零残留退回官方直连

---

## 5. 验证与交付清单

每次发版前必须完成：

```bash
# 1. 语法检查
node --check plugins/zk-proxy-pro/extension.js
node --check plugins/zk-proxy-pro/vendor/bundled-origin/source.js

# 2. 红线检查（确认无越界功能）
rg "_GEMINI_MODEL_COMPAT|_rewriteGeminiCompatBody|_ensureAgentProBridge|_applyModelWhitelist|_ensureProductVersion|_stripConvSummaries" plugins/zk-proxy-pro/

# 3. 单元测试
npm test

# 4. 打包
node scripts/build-vsix.mjs zk-proxy-pro

# 5. 验证 VSIX 内含 activate
# 解压 VSIX 检查 extension.js 含 "function activate(ctx)" 和 "async function deactivate"
```

安装验证：
1. 完全关闭 Antigravity（任务管理器确认无残留进程）
2. 安装 VSIX
3. 重启 Antigravity
4. 确认扩展加载为 `zk-agent.zk-proxy-pro`
5. 确认 `_model_unlock_enabled` 文件自动创建，模型解锁端点返回 enabled: true
6. 确认 source.js 包含 `_agGemini37Compat` require 和 hook（模型改写自带）
7. 发消息确认代理正常（模型改写自动生效，不需要 old-compat-manager）

---

## 6. 使用流程（用户视角）

### 6.1 日常使用
什么都不用管，直接打开 IDE 用。代理启动后 autoModelUnlock 自动解锁模型目录，提示词注入、摘要剔除、标题汉化全部自动生效。

### 6.2 重新安装 IDE 后（必须执行 old-compat-manager）

old-compat-manager 改的是 **IDE 安装目录**里的文件（Bridge、版本伪装、模型过滤），重装 IDE 后全部丢失：

| 步骤 | 操作 |
|---|---|
| 1 | 安装本插件 VSIX（`dist/zk-proxy-pro-<version>.vsix`） |
| 2 | 运行 old-compat-manager「应用并启动」（一键完成：Bridge部署 + 版本伪装 + 模型过滤） |
| 3 | 启动 IDE |

> 注：模型改写/动态映射已在插件内（v9.9.524+），不需要 old-compat-manager 注入。

### 6.3 更新本插件版本后（不需要重新运行 old-compat-manager）

插件更新后，模型改写/动态映射随 VSIX 打包，**自动生效**，不需要重新运行 old-compat-manager：

1. 安装新插件 VSIX
2. 重启 IDE
3. 模型改写、提示词注入、摘要剔除、模型解锁全部自动生效

> ⚠️ 只有当你**手动用项目源码覆盖已安装的 source.js** 时，才需要确认覆盖没有破坏 `_agGemini37Compat` 的 require 和 hook。正常安装 VSIX 不需要任何额外操作。

### 6.4 功能清单

| 功能 | 归属 | 自动/手动 |
|---|---|---|
| 提示词注入 | 本插件 | 自动 |
| 会话标题简体中文 | 本插件 | 自动 |
| 文件上下文元信息 | 本插件 | 自动 |
| 历史摘要剔除 | 本插件 | 自动 |
| 模型解锁（全量模型目录） | 本插件 | 自动（autoModelUnlock） |
| 流式响应结束保险（防 Generating 卡死） | 本插件 | 自动（end/close/30s空闲超时三重保险） |
| 模型改写 / 动态映射（gemini-2.5-pro→实际模型） | 本插件 | 自动（从 URL 提取实际模型名，支持未来新模型） |
| Bridge 部署（LS 走本地代理） | old-compat-manager | 手动执行一次 |
| 版本伪装（ideVersion=2.5.5） | old-compat-manager | 手动执行一次 |
| 模型列表过滤（防 IDE 卡死） | old-compat-manager | 手动执行一次 |

---

## 7. 相关项目

| 项目 | 路径 | 职责 |
|---|---|---|
| 本项目 | `Antigravity-Injection` | 注入层 + 模型改写动态映射 |
| 兼容管理器 | `antigravity-old-compat-manager` | 兼容层（Bridge部署/版本伪装/模型列表过滤） |

两个项目必须同时运行才能获得完整功能：插件负责注入提示词和模型改写，old-compat-manager 负责让 LS 走本地代理（Bridge）和低版本 IDE 兼容。

# Antigravity-Injection 项目规则

> 修改任何代码前必读。本文档定义项目边界、编码规范和验证流程。

---


## 0. extension.js 换行符硬性规则（最高优先级 · 血泪教训）

> **2026-09-10 事故复盘**：`E:\Antigravity\resources\app\extensions\antigravity\dist\extension.js` 被文本编辑器打开并保存后，换行符从 LF（`\n`）被自动转换成 CRLF（`\r\n`），全文仅 24 个换行符全部被转换，文件体积正好多 24 字节。该文件是 webpack 单文件打包，内部锚点匹配、source map 偏移、模块 ID 映射均依赖精确字节位置，CRLF 化后导致 `agentSessions` 服务注册失败，IDE 对话框点发送闪一下回弹、无法发送消息给模型。

### 0.1 绝对禁止

- ❌ **禁止用任何文本编辑器（VS Code / Notepad++ / 记事本 / Sublime 等）打开 `extension.js` 并按 Ctrl+S 保存**。查看可以，保存绝对不行。
- ❌ 禁止用 `Set-Content` / `Out-File` / `Add-Content` 等 PowerShell cmdlet 写入 `extension.js`（这些 cmdlet 会自动转换换行符）。
- ❌ 禁止在未归一化换行符的情况下对 `extension.js` 做字符串替换。

### 0.2 必须遵守

- ✅ 写入 `extension.js` **必须**使用 `[IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))`，且写入前必须调用 `ConvertTo-LfLineEndings` 归一化为 LF。
- ✅ 本项目 `Write-Utf8Atomic` 函数已提供 `-ForceLF` 开关，写入 `extension.js` 时**必须**传 `-ForceLF`。
- ✅ `Test-RestartSafeExtensionContent` 和 `ConvertTo-RestartSafeExtensionContent` 函数入口已自动归一化 LF，新增同类函数必须遵循同样模式。
- ✅ 读取 `extension.js` 用 `Get-Content -Raw` 或 `[IO.File]::ReadAllText`，禁止用逐行读取后拼接（会改变换行符）。

### 0.3 验证

修改 `extension.js` 相关代码后，必须验证：
1. 产出的 `extension.js` 文件不包含 `\r\n`（可用 `Select-String` 或字节检查）。
2. 产出的 `extension.js` SHA256 与 `profiles\local-generated.json` 中对应模式的 `targetExtensionSha256` 一致。
3. IDE 启动后日志中无 `xoe depends on UNKNOWN service agentSessions` 错误。

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
| 模型解锁（全量模型目录） | `source.js` MODEL_UNLOCK | 具备拦截 GetUserSettings 注入全量目录能力；**v9.9.528+ 默认禁用走纯透传**（账号登录后免费/VIP 官方本身返回全量模型，模型过滤在 old-compat-manager），仅账号权限受限时手动 POST /origin/model_unlock 开启 |
| 流式响应结束保险 | `source.js` stream-idle | end/close 双保险（所有响应）+ 120s 空闲超时（**仅 text/event-stream**），防 Generating 卡死且不误杀长时间终端任务（v9.9.527） |
| 模型改写 / 动态映射 | `_ag-gemini37-compat.cjs` + `source.js` hook | v9.9.524+ 从 old-compat-manager 移入。从 URL 提取实际模型名，改写 LS 占位符 gemini-2.5-pro。支持未来新模型自动适配。**v9.9.529+ 同时提升主对话推理强度**：`_agLiftThinking()` 将 Fast 版被压低的 `thinkingConfig.thinkingBudget` 从 1024(Low) 改为 -1(High/动态)，仅作用于主对话请求，不动 lite/标题摘要附属请求 |
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

> 注：`_stripConvSummaries`（历史摘要剔除）、`_agGemini37Compat`（模型改写/动态映射，v9.9.524+）、`/origin/model_catalog`（模型目录查看）都是插件自身功能，不在红线内。模型解锁代码保留但 v9.9.528+ 默认禁用（账号本身返回全量模型，白名单过滤由 old-compat-manager 负责）。

### 1.3.1 模型解锁策略（v9.9.528 起默认禁用）

1. **默认禁用**：`_isModelUnlockEnabled()` 在标记文件缺失时返回 **false**，GetUserSettings/GetUserStatus 纯流式透传，不缓冲、不解析、不合并，降低模型列表请求延迟。
2. **依据**：账号登录后无论免费还是 VIP，官方本身返回全量模型列表；模型列表过滤由 old-compat-manager 改 workbench.js 负责，本插件不需要解锁。
3. **手动恢复**：仅当账号权限受限、模型变灰/缺失时，POST `http://127.0.0.1:<port>/origin/model_unlock` body `{"enabled":true}` 启用（写标记文件），POST `{"enabled":false}` 再关闭。
4. **禁止重新加回 autoModelUnlock 自动调用**：该函数已删除。历史上 v9.9.519 的 Failed to send 真因是模型改写被源码覆盖冲掉（当时在 old-compat-manager），**与模型解锁无关**，不得据此重新默认启用解锁。
5. `classifyRPC` 中 `GetUserSettings`/`GetCascadeModelConfigs` 仍 `return "MODEL_UNLOCK"`（保留分类与解锁代码路径，禁用时函数内部自动退化为透传），不要删除分类。

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
- mode/canon 等小配置文件允许每请求同步读（文件极小 + OS page cache，单次 0.1-1ms 可忽略）；禁止在热路径读大文件或做昂贵计算
- keepAlive 必须为 false（true 会导致外网代理隧道连接复用问题和 Gemini 503）；上游官方 H2 session 通过 `_h2Sessions` 复用，不受此项影响
- 代理侧每请求总开销应控制在 10ms 内；首字延迟瓶颈在官方服务器与网络，不在代理，不要为"体感提速"做无意义改动（v9.9.528 性能结论）

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
5. 确认模型解锁端点返回 `enabled: false`（v9.9.528+ 默认禁用，模型列表纯透传）
6. 确认 source.js 包含 `_agGemini37Compat` require 和 hook（模型改写自带）
7. 确认 `_ag-gemini37-compat.cjs` 包含 `_agLiftThinking`（v9.9.529+ 推理强度 High 提升：主对话 thinkingBudget 1024→-1）
8. 运行 `node --test test/gemini-compat.test.js`，确认 11 个用例全部通过（含 4 个 _agLiftThinking 边界用例）
7. 发消息确认代理正常（模型改写自动生效，不需要 old-compat-manager）

---

## 6. 使用流程（用户视角）

### 6.1 日常使用
什么都不用管，直接打开 IDE 用。提示词注入、摘要剔除、标题汉化、模型改写/动态映射全部自动生效；模型解锁默认禁用（账号本身返回全量模型），模型列表纯透传。

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
3. 模型改写、提示词注入、摘要剔除全部自动生效；模型解锁默认禁用（无需操作）

> ⚠️ 只有当你**手动用项目源码覆盖已安装的 source.js** 时，才需要确认覆盖没有破坏 `_agGemini37Compat` 的 require 和 hook。正常安装 VSIX 不需要任何额外操作。

### 6.4 功能清单

| 功能 | 归属 | 自动/手动 |
|---|---|---|
| 提示词注入 | 本插件 | 自动 |
| 会话标题简体中文 | 本插件 | 自动 |
| 文件上下文元信息 | 本插件 | 自动 |
| 历史摘要剔除 | 本插件 | 自动 |
| 模型解锁（全量模型目录） | 本插件 | 默认禁用（账号本身返回全量）；权限受限时手动 POST 开启 |
| 流式响应结束保险（防 Generating 卡死） | 本插件 | 自动（end/close 双保险 + 仅 SSE 的 120s 空闲超时，不误杀长任务） |
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

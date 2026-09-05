# Antigravity-Injection · 反重力 IDE 提示词注入插件

面向 **Antigravity IDE** 的系统提示词注入与中文标题转换插件。通过本地代理拦截推理请求，注入自定义系统提示词，并自动将对话标题转换为简体中文。

---

## 核心功能

1. **系统提示词注入**
   - 拦截本地代理请求，替换/注入全局系统提示词 (System Prompt)
   - 支持自定义提示词，按请求类型区分主对话、摘要、标题请求

2. **会话标题简体中文转换**
   - 检测标题生成请求，改写为简体中文约束
   - 只替换首行规范，保留后续格式协议行

3. **文件上下文元信息注入**
   - 注入活跃文件上下文到提示词

4. **历史摘要剔除**
   - 剔除 `<conversation_summaries>` 标签块，消除注意力稀释、认知漂移和跨任务污染

5. **模型解锁（全量模型目录）**
   - 具备拦截 GetUserSettings 注入全量模型目录能力；v9.9.528+ 默认禁用并走纯透传以降低首字延迟，支持按需手动开启
   - 突破未完全授权账号权限限制，按需展示所有模型

6. **流式响应结束保险**
   - end/close/120s SSE 空闲超时三重保险，防止官方 H2 stream 不发 END_STREAM 导致 IDE 卡在 Generating，同时避免误杀长任务请求

7. **模型改写 / 动态映射**
   - 将 LS 内部占位符 `gemini-2.5-pro` 改写为用户实际选择的模型
   - 从请求 URL `/v1beta/models/{model}:generateContent` 动态提取实际模型名
   - 官方发布任何新模型（3.9/4.0/4.1）自动适配，无需改映射代码
   - URL 提取失败时回退到默认 `gemini-3.8-flash-high`

8. **性能优化**
   - keepAlive false，避免连接复用问题
   - TTL 缓存 + 短路预筛，热路径开销可忽略

---

## 项目分工

本插件只做**注入层**。模型兼容层由独立项目负责：

| 功能 | 本插件 | antigravity-old-compat-manager |
|---|---|---|
| 提示词注入 | ✅ | — |
| 标题简体中文 | ✅ | — |
| 文件上下文 | ✅ | — |
| 历史摘要剔除 | ✅ | — |
| 模型解锁（全量目录） | ✅ | — |
| 流式响应结束保险 | ✅ | — |
| 模型改写 / 动态映射 | ✅ | — |
| 性能优化 | ✅ | — |
| Bridge 修补部署 | — | ✅ |
| 模型列表过滤 | — | ✅ |
| 版本伪装 2.5.5 | — | ✅ |
| 认证时序修复 | — | ✅ |
| 备份/恢复/自愈 | — | ✅ |

两个项目必须同时运行才能获得完整功能。

> ⚠️ 发布者固定为 `zk-agent.zk-proxy-pro`，与 old-compat-manager 的 Bridge 目标一致。不得改名。改名必须同步修改 old-compat-manager 的 `runtime/OneLSAgentProxyBridge.cjs`（AGENT_PRO_ID）和 `scripts/StableMode.Core.psm1`（$prefix）。
>
> ✅ 模型改写已合并进插件（v9.9.524+），更新插件后**不再需要**运行 old-compat-manager 重新注入模型改写。old-compat-manager 只负责 Bridge 部署、版本伪装、模型列表过滤（这些是改 IDE 目录的，跟插件无关）。

---

## 安装与使用

### 1. 安装插件
- `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选择 `dist/zk-proxy-pro-*.vsix`
- 插件自带模型改写/动态映射，安装后**不需要**重新注入

### 2. 运行兼容管理器（仅首次或重装 IDE 后）
- 打开 `antigravity-old-compat-manager`
- 点「检测状态」→「应用并启动」（部署 Bridge、版本伪装、模型列表过滤）
- **更新插件后不需要重新运行**（模型改写已在插件内）

### 3. 重启 Antigravity
- 完全关闭后重新启动，加载插件和兼容补丁

---

## 构建

```bash
# 打包 VSIX (Node.js ≥ 18)
node scripts/build-vsix.mjs zk-proxy-pro

# 语法检查
node --check plugins/zk-proxy-pro/extension.js
node --check plugins/zk-proxy-pro/vendor/bundled-origin/source.js

# 单元测试
npm test
```

---

## 关键代码路径

| 文件 | 职责 |
|---|---|
| `plugins/zk-proxy-pro/extension.js` | 扩展入口，IDE 进程感知与配置 Hook |
| `plugins/zk-proxy-pro/vendor/bundled-origin/source.js` | 本地代理，请求拦截与提示词注入 |
| `plugins/zk-proxy-pro/vendor/外接api/core/sp_invert.js` | 提示词判定与中文标题规范注入 |
| `plugins/zk-proxy-pro/ide-context.js` | 文件上下文元信息注入 |

---

## 相关项目

- [antigravity-old-compat-manager](https://github.com/Huo-zai-feng-lang-li/antigravity-old-compat-manager) — 模型兼容层（必须配合使用）

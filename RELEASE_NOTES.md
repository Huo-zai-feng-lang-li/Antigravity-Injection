# Antigravity-Injection · Bug 更新与版本发布迭代文档

> 本文档用于记录 **Antigravity-Injection** 核心插件 `zk-proxy-pro` 的版本递增、Bug 修复点及发布迭代历史。
>
> ⚠️ **维护规范**：后续进行版本递增与 Release 发布时，必须同步维护更新本文档；若仅仅是日常代码重构或未递增版本号的小改动，则无需更新提交。

---

## 📌 当前最新版本概览

| 模块名称 | 当前版本 | 架构状态 |
|---|---|---|
| **`zk-proxy-pro`** | `v9.9.525` | 提示词注入层 + 标题汉化 + 文件上下文 + 摘要剔除 + 模型解锁 + 流式结束保险 + 模型改写动态映射 + 命名统一 zk-proxy-pro |

---

## 📜 版本发布与 Bug 修复迭代日志

### 🚀 v9.9.525 (2026-09-04)
- **架构变更**：插件 name 从 `dao-proxy-pro` 改为 `zk-proxy-pro`，publisher 统一为 `zk-agent`，完整扩展 ID `zk-agent.zk-proxy-pro`
- **Bridge 兼容**：bridge-patch 模板 AGENT_PRO_IDS 更新为三版本兼容（zk-agent 当前 / zk-agi 历史 / dao-agi 历史）
- **修复类型**：命名统一 + 文档同步 + 垃圾清理
- **问题描述**：插件名从 dao-proxy-pro 改为 zk-proxy-pro 后，old-compat-manager 的 Bridge 和 PSM1 仍引用旧扩展 ID，导致 Bridge 找不到插件、代理不响应
- **根因分析**：两个项目的扩展 ID 引用分散在多处（Bridge AGENT_PRO_ID、PSM1 $prefix、测试文件、文档），改名时未同步更新所有引用
- **修复方案**：
  1. 插件 package.json name=publisher=zk-agent
  2. source.js/extension.js 所有扩展 ID 引用同步更新
  3. old-compat-manager Bridge AGENT_PRO_ID → zk-agent.zk-proxy-pro
  4. old-compat-manager PSM1 $prefix → zk-agent.zk-proxy-pro-
  5. 两个项目 README/rules/handoff/CHANGELOG 全部同步更新
  6. 清理旧计划文档、.serena 目录、backups(2GB)、logs、旧 VSIX
- **与 old-compat-manager 配合**：插件负责注入层 + 模型改写；old-compat-manager 负责 Bridge部署、版本伪装、模型列表过滤；功能零重叠

---

### 🚀 v9.9.524 (2026-09-04)
- **架构变更**：模型改写从 old-compat-manager 移入插件源码，更新插件后不再需要重新注入
- **动态映射**：从请求 URL 提取实际模型名，支持未来新模型（3.9/4.0/4.1）自动适配，无需改代码
- **修复类型**：架构优化 (模型改写合并 + 动态映射)
- **问题描述**：模型映射硬编码为 gemini-2.5-pro → gemini-3.8-flash-high，官方发布新模型后需要手动改映射；且每次更新插件后需要重新运行 old-compat-manager 注入模型改写
- **根因分析**：模型改写代码不在插件源码里（属于 old-compat-manager），更新插件会覆盖已注入的改写；且改写目标硬编码，无法自动适配新模型
- **修复方案**：
  1. 将 `_ag-gemini37-compat.cjs` 移入插件源码，随 VSIX 打包
  2. source.js 内置 require 和 hook，更新插件后模型改写自动生效
  3. 改写逻辑改为从 URL `/v1beta/models/{model}:generateContent` 提取实际模型名，动态改写请求体里的占位符
  4. URL 提取失败时回退到默认 gemini-3.8-flash-high

---

### 🚀 v9.9.523 (2026-09-04)
- **修复类型**：Bug 修复 (流式响应结束信号丢失)
- **问题描述**：模型回答完毕后 IDE 一直显示 "Generating……" 不结束，最终卡死。
- **根因分析**：`proxyToCloud` 中 `upStream.pipe(res)` 依赖上游 H2 stream 的 `end` 事件触发 `res.end()`，但官方服务器偶发不发送 END_STREAM 帧（或 stream 以 `close` 而非 `end` 结束），导致 `res.end()` 永不调用。
- **修复方案**：在 pipe 后添加三重保险——①`upStream.on("end")` 显式调 `res.end()`；②`upStream.on("close")` 显式调 `res.end()`；③30 秒空闲超时（无数据则强制 `res.end()` + 取消上游）。

---

### 🚀 v9.9.522 (2026-09-04)
- **修复类型**：Bug 修复 (autoModelUnlock 初始调用丢失)
- **问题描述**：Gemini 模型发送请求后 LS 报错 `neither PlanModel nor RequestedModel specified`，提示 "Failed to send"。
- **根因分析**：v9.9.519 删除底部状态栏时，连带删除了 `setTimeout(() => { autoModelUnlock(_cachedPort); refreshStatusBar(); }, 8000)` 整块代码。`autoModelUnlock` 函数定义仍在但永不执行，导致 `_model_unlock_enabled` 文件不创建，模型解锁实际禁用，UI 无完整模型元数据，请求模型为 unknown。
- **修复方案**：在 `proxyStart` 成功后（`_publishPort` 之后）恢复 `autoModelUnlock(_cachedPort)` 调用，代理启动后自动解锁。

---

### 🚀 v9.9.521 (2026-09-04)
- **修复类型**：Bug 修复 (MODEL_UNLOCK 分类被错误注释)
- **问题描述**：v9.9.518 注释掉 classifyRPC 中的 MODEL_UNLOCK 分类，写"交 old-compat-manager 负责"，但 GetUserSettings 是 IDE→LS 的 gRPC 请求，不经过 HTTP 代理，old-compat-manager 无法处理。
- **修复方案**：恢复 `classifyRPC` 中 `GetUserSettings`/`GetCascadeModelConfigs` → `return "MODEL_UNLOCK"`。模型解锁是插件基线功能，禁止注释或删除。

---

### 🚀 v9.9.520 (2026-09-04)
- **修复类型**：Bug 修复 (摘要剔除位置致命 bug) + 显示名统一
- **问题描述**：v9.9.518/519 中摘要剔除代码被错误地插入在 `let _eaBody = body;` 定义之前，触发 JavaScript 暂时性死区（ReferenceError: Cannot access '_eaBody' before initialization），导致每次聊天请求时代理直接崩溃。
- **修复方案**：将摘要剔除代码移到 `_eaBody` 定义和 SP 修改之后。同时将 package.json 中所有 "DAOAgent Pro"（28 处）统一改为 "ZKAgent Pro"。

---

### 🚀 v9.9.343 (2026-08-06)
- **重构类型**：核心架构重构与品牌统一 (ZK 命名全维度对齐)
- **更新描述**：全维度将 `dao / 道` 替换为 `ZK` 命名标识，插件完全升级为 `zk-proxy-pro`。
- **改动范围**：
  1. 插件标识全盘升级为 `zk-agi.zk-proxy-pro`，全量测试用例及离线断言自检 100% 绿灯。
  2. 精简架构，物理剔除废弃的 min 和 rt-flow 模块，打包体积更小、更轻量。
  3. 说明文档全盘清理与对齐，彻底修复 Releases 与 VSIX 下载 404 问题。

---

### 🚀 v9.9.342 (2026-08-06)
- **修复类型**：Bug 修复 (Gemini REST 结构兼容性)
- **问题描述**：Antigravity 1.107.0 原生 Agent 产生的新建会话历史标题仍然为英文。
- **根因分析**：Antigravity 内部 Gemini REST 将生成参数包装在 `request.contents[]`，旧逻辑只扫描了公开根级的 `contents[]`，导致标题匹配规则失效并被漏过。
- **修复方案**：
  1. 兼容读取公开根级 `contents[]` 与 Antigravity 私有 `request.contents[]`。
  2. 精确覆盖 `Generate a short conversation title`，保留第二行摘要协议的前提下将第一行改写为简体中文约束。

---

### 🚀 v9.9.341 (2026-08-05)
- **修复类型**：Bug 修复 (Gemini REST 出站指令替换)
- **问题描述**：标题分类命中后，请求体文本未成功替换。
- **修复方案**：新增 Gemini REST 出站边界 `_replaceGeminiTitleInstruction()`，将标题约束控制在 4-10 个简体中文字符，保持主聊天与工具调用不受影响。

---

### 🚀 v9.9.340 (2026-08-05)
- **修复类型**：Bug 修复 (标题 SP 模式识别)
- **问题描述**：Antigravity 原生标题生成指令未被旧 marker 捕获。
- **修复方案**：在 Pro 两条分类路径引入大小写无关的强特征匹配，成功命中 `Generate a short conversation title`。

---

### 🚀 v9.9.339 (2026-08-05)
- **修复类型**：功能演进 (对话历史标题中文化)
- **问题描述**：Antigravity 默认对话历史标题全为英文。
- **修复方案**：将 `conversation title` / `title generator` 从副路拆出为 `title` 专用分类，强制要求输出简体中文标题。

---

### 🚀 v9.9.338 (2026-08-04)
- **修复类型**：功能增强 (IDE 实时上下文注入)
- **修复内容**：支持向最后一个用户文本 part 注入活动文件路径、UTF-16 光标 Offset 与选区内容，幂等去重。

---

### 🚀 v9.9.332 - v9.9.337 (2026-08-01 ~ 2026-08-03)
- **修复类型**：纯系统提示词策略与 REST 私有契约修复
- **修复内容**：
  1. 彻底解决 `/v1internal:streamGenerateContent` 内部契约 400 报错。
  2. 收束 Antigravity UI 面板文案与样式。
  3. 系统提示词纯净化，不再强制拼接冗余模块，工具能力走原生通道。

---

### 🚀 v9.9.314 - v9.9.327 (2026-07-25 ~ 2026-07-30)
- **修复类型**：卸载归零、卡死自救与 LS 自愈
- **修复内容**：
  1. 提供智能保锚与 `deactivate` 真卸载侦测，防止卸载残留死端口导致 IDE 报错。
  2. 提供 `scripts/zk-reset.ps1` 与 `scripts/zk-reset.sh` 独立归零工具。

---

## 🛠 今后递增版本号发布指引

当你需要进行新一轮 **Bug 修复 / 功能更新 / 版本发布** 时，请严格按照以下步骤操作：

1. **版本号递增**：
   - 在目标插件的 `package.json` 中递增 `version` 字段。
   - 在 `extension.js` 中同步更新 `const VERSION = "x.y.z"`。
2. **更新发布迭代文档**：
   - 本文档 (`RELEASE_NOTES.md`) 添加最新的版本记录点、Bug 修复细节与提交日期。
   - 对应的插件目录 `CHANGELOG.md` 同步增加条目。
3. **刷新 README 索引与测试**：
   ```bash
   node tools/gen-readme-index.js
   node scripts/build-vsix.mjs
   ```
4. **Git 提交推送**：
   ```bash
   git add .
   git commit -m "release: vX.Y.Z - <简要更新说明>"
   git push origin main
   ```

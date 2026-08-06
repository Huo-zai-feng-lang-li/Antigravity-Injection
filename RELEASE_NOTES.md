# Antigravity-Injection · Bug 更新与版本发布迭代文档

> 本文档用于记录 **Antigravity-Injection** 套件（包含 `zk-proxy-pro`、`zk-proxy-min`、`rt-flow`）的版本递增、Bug 修复点及发布迭代历史。
>
> ⚠️ **维护规范**：后续进行版本递增与 Release 发布时，必须同步维护更新本文档；若仅仅是日常代码重构或未递增版本号的小改动，则无需更新提交。

---

## 📌 当前最新版本概览

| 模块名称 | 当前版本 | 架构状态 |
|---|---|---|
| **`zk-proxy-pro`** | `v9.9.342` | 核心全功能提示词反代 + 外接 API + 109 模型目录解锁 + ACP stdio 代理 |
| **`zk-proxy-min`** | `v9.9.81` | 同构精简镜像（纯系统提示词路径） |
| **`rt-flow`** | `v3.16.0` | WAM 账号管理与自适应切号器 |

---

## 📜 版本发布与 Bug 修复迭代日志

### 🚀 v9.9.342 (2026-08-06)
- **修复类型**：Bug 修复 (Gemini REST 结构兼容性)
- **问题描述**：Antigravity 1.107.0 原生 Agent 产生的新建会话历史标题仍然为英文。
- **根因分析**：Antigravity 内部 Gemini REST 将生成参数包装在 `request.contents[]`，旧逻辑只扫描了公开根级的 `contents[]`，导致标题匹配规则失效并被漏过。
- **修复方案**：
  1. 兼容读取公开根级 `contents[]` 与 Antigravity 私有 `request.contents[]`。
  2. 精确覆盖 `Generate a short conversation title`，保留第二行摘要协议的前提下将第一行改写为简体中文约束。
  3. 同样逻辑同步至 `zk-proxy-min` (v9.9.81)，保证 Pro/Min 无缝镜像同构。

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
  3. 系统提示词纯净化，不再强制拼接冗余模块，工具能力走原生通ZK。

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
   node scripts/build-vsix.mjs <module_name>
   ```
4. **Git 提交推送**：
   ```bash
   git add .
   git commit -m "release: vX.Y.Z - <简要更新说明>"
   git push origin main
   ```

# Antigravity-Injection 项目规则与协作规范 (Project Rules)

> 本文档旨在为后续 AI 助手及开发者提供一站式架构认知、编码规范、修改边界及调试验证指南。修改任何代码前请务必阅读本规范。

---

## 目录
1. [项目架构与核心职责](#1-项目架构与核心职责)
2. [版本控制与同步规范](#2-版本控制与同步规范)
3. [提示词注入与 LSP/REST 拦截规则](#3-提示词注入与-lsprest-拦截规则)
4. [Windows / PWSH / 节点兼容性禁忌](#4-windows--pwsh--节点兼容性禁忌)
5. [测试、打包与交付自检清单](#5-测试打包与交付自检清单)

---

## 1. 项目架构与核心职责

本仓库为 **Antigravity IDE 提示词注入与增强套件**，包含三个核心插件模块及配套发版工具：

| 模块路径 | 名称 / ID | 核心职责 |
|---|---|---|
| `plugins/dao-proxy-pro/` | `dao-agi.dao-proxy-pro` | **核心全功能反代**：接管 System Prompt、支持外接 API 路由、109 模型目录解锁、ACP stdio 代理及卸载还原。 |
| `plugins/dao-proxy-min/` | `dao-agi.dao-proxy-min` | **精简示范反代**：同构剥离版，只保留提示词反转与代理，与 Pro 同构同版本镜像。 |
| `plugins/rt-flow/` | `devaid.rt-flow` | **WAM 账号调度管理器**：账号池、自动切号、额度检测、对话追踪与 `.pb` 对话备份。 |
| `tools/` | 发版与校验工具集 | `gen-readme-index.js`（自动维护 README 索引）、`bundle-notes.js`、`release-notes.js`、`checks/antigravity-target-check.js`。 |
| `scripts/` | 构建脚本 | `build-vsix.mjs`（使用 Node.js 一键打包插件到 `dist/`）。 |

---

## 2. 版本控制与同步规范

### 2.1 版本单一信源 (Single Source of Truth)
- **`dao-proxy-pro`**：版本单一信源位于 `plugins/dao-proxy-pro/package.json` 中的 `version` 字段，且与 `extension.js` 中的 `const VERSION` 必须完全一致。
- **`dao-proxy-min`**：为 Pro 的轻量同构镜像，每次更新 Pro 修复时，必须同步检查 Min 中相对应位置的代码，保证逻辑不产生逻辑漂移。
- **`rt-flow`**：版本单一信源位于 `plugins/rt-flow/package.json` 和 `plugins/rt-flow/extension.js`。

### 2.2 仓库与 Remote 地址规范
- 默认 GitHub 仓库：`https://github.com/Huo-zai-feng-lang-li/Antigravity-Injection.git`
- 脚本中关于 GitHub Repo 默认统一使用 `process.env.GITHUB_REPOSITORY || "Huo-zai-feng-lang-li/Antigravity-Injection"`，严禁硬编码老旧或他人仓库。
- 每次修改 `package.json` 或发版版本后，必须运行：
  ```bash
  node tools/gen-readme-index.js
  ```
  以自动更新主 `README.md` 中的 `DAO-MODULE-INDEX` 区块。

---

## 3. 提示词注入与 LSP/REST 拦截规则

### 3.1 标题提取与改写规则 (Title Inversion Rules)
1. **分类识别必须忽略大小写与文本结构差异**：
   - 匹配特征词包含 `generate a short conversation title` / `title classifier` / `title_only_zh_sp`。
   - 标题指令可能位于公开根级的 `request.contents[]`，也可能位于 Antigravity 私有的 `request.contents[].parts[].text`。
2. **严禁破坏第二行摘要协议**：
   - Gemini REST SSE 中的标题生成请求第二行往往包含格式协议（如 `Then, in a new line...`），改写标题指令时**只能替换第一行为简体中文约束**，必须完整保留后续第二行及以后的协议行。
3. **区分普通 Agent 对话与标题请求**：
   - 改写逻辑必须精准判定为标题请求才触发，严禁修改正常的 Agent 上下文、代码补全或工具调用 Payload。

### 3.2 settings.json JSONC 保留规则
- 代理注入 `settings.json`（如 `codeium.apiServerUrl` / `externalLanguageServerAddress`）时，必须使用结构化正则或注释保留解析器，**严禁直接使用普通的 `JSON.stringify(JSON.parse(...))` 覆盖保存**，否则会导致用户配置中的 JSONC 注释全部丢失。

### 3.3 卸载与 Fail-Safe 规则
- 扩展卸载 (`deactivate`) 或用户切回官方模式时，必须触发清锚逻辑（`dao.restoreOfficial` / `dao-reset.ps1`），彻底清理环变与代理端口，确保 IDE 可以零残留退回官方直连模式。

---

## 4. Windows / PWSH / 节点兼容性禁忌

1. **Powershell 一行流禁忌**：
   - 严禁在 `pwsh -Command` 中拼接复杂的多行 JS/JSON 或带双引号的脚本字符串。复杂文本处理必须通过 Python/Node.js 临时文件或脚本进行。
2. **路径分隔符与编码**：
   - 绝不使用 Bash 特有语法（如 `cat <<EOF`）。Windows pwsh 下文件写入需确保 UTF-8 / UTF-8 BOM 正确。
3. **依赖与 Node.js 环境**：
   - 插件核心构建脚本 `scripts/build-vsix.mjs` 要求 Node.js ≥ 18。

---

## 5. 测试、打包与交付自检清单

每次修改代码并交付前，必须按照以下 4 步完成自查与验证：

- [ ] **1. 逻辑校验与 Check**：
  在命令行执行语法检查与自动化自检：
  ```bash
  node --check plugins/dao-proxy-pro/extension.js
  node --check plugins/dao-proxy-pro/vendor/外接api/core/sp_invert.js
  node tools/checks/antigravity-target-check.js
  ```
- [ ] **2. 单元与回归测试**：
  ```bash
  npm --prefix plugins/dao-proxy-pro run test:quick
  ```
- [ ] **3. VSIX 打包测试**：
  ```bash
  node scripts/build-vsix.mjs dao-proxy-pro
  ```
  确认打包退出码为 `0` 且在 `dist/` 目录下成功生成 `.vsix` 文件。
- [ ] **4. README 索引同步**：
  ```bash
  node tools/gen-readme-index.js
  ```
  检查 `git status` 确保主 `README.md` 索引一致且全项目没有未预期的修改遗留。

# Antigravity-Injection · 反重力 IDE 提示词注入与增强套件

这是一个专为 **Antigravity IDE**（完美支持 `Antigravity-1.20.6.exe` 等版本）及生态打造的系统提示词注入与语言服务器中文化增强插件套件。

通过拦截本地代理与语言服务器 (LSP / ACP stdio proxy)，无需修改 IDE 二进制即可无损接管全局系统提示词 (System Prompt)，并支持自动将 AI 对话标题转换为简体中文。

---

## 💡 核心功能

1. **反重力 IDE 系统提示词注入 (System Prompt Inversion)**
   - **机制原理**：通过在本地代理层（`sp_invert.js` / `source.js`）实时拦截与重写客户端发起的推理请求（gRPC/HTTP），接管官方硬编码的全局系统提示词 (System Prompt)。
   - **功能特性**：剥离官方冗余约束与限制，支持自定义注入任意系统提示词；配合主路末锚 `TAO_TURN_ANCHOR` 与副路末锚 `TAO_SUB_ANCHOR` 保持长对话上下文不漂移。

2. **语言服务器 (LSP / ACP) 中文标题提示词注入 (Chinese Title Prompt Injection)**
   - **机制原理**：深度拦截语言服务器 (`language_server`) 通讯及 ACP `devin.exe` stdio 代理。
   - **功能特性**：将标题生成器 (Title Classifier) 提示词替换为简体中文规范（`TITLE_ONLY_ZH_SP`），向语言服务器注入中文标题规则，强制新建对话自动生成 **8~18 字的简体中文标题**。

3. **原生支持 Antigravity-1.20.6.exe**
   - 自动识别 Windows 平台的 `Antigravity-1.20.6.exe` 进程与配置路径。
   - 保留 `settings.json` 的 JSONC 注释格式，自动注入反代端口及语言服务器端点参数。
   - 内置 Fail-Safe 机制：若代理未就绪则自动无缝降级为官方直连，不影响 IDE 原生功能。

---

## ⚡ 极客暗黑架构图表 (Cyberpunk Dark Mode)

### 1. 提示词与语言服务器双轨能量流转图 (Sankey Flow Chart)
![双轨能量流转图](https://mdn.alipayobjects.com/one_clip/afts/img/G321QoxAusYAAAAAR6AAAAgAoEACAQFr/original)

### 2. zk-proxy-pro 六维全能能力对比雷达图 (Radar Matrix)
![六维能力对比雷达图](https://mdn.alipayobjects.com/one_clip/afts/img/_z3sTplN5t4AAAAAT4AAAAgAoEACAQFr/original)

### 3. 高阶 Mermaid 链路流转图
```mermaid
graph TD
    %% 节点样式定义
    classDef client fill:#1f2937,stroke:#58a6ff,stroke-width:2px,color:#fff;
    classDef proxy fill:#0d1117,stroke:#bc8cff,stroke-width:3px,color:#fff;
    classDef engine fill:#161b22,stroke:#3fb950,stroke-width:2px,color:#fff;
    classDef api fill:#21262d,stroke:#f0883e,stroke-width:2px,color:#fff;

    IDE[Antigravity-1.20.6.exe] ::: client
    PROXY[zk-proxy-pro 代理中枢] ::: proxy
    
    SUB_SP[System Prompt 逆转/注入引擎] ::: engine
    SUB_LS[Language Server 中文标题注入] ::: engine
    
    ANCHOR[TAO_TURN/SUB 记忆双锚点] ::: engine
    TITLE_ZH[8-18字 简体中文标题生成] ::: engine
    
    API_POOL[109 全量模型池 / BYOK] ::: api

    IDE -->|gRPC / HTTP 请求| PROXY
    PROXY -->|请求拆包 & 重写| SUB_SP
    PROXY -->|stdio ACP 拦截| SUB_LS
    
    SUB_SP -->|双锚点保护| ANCHOR
    SUB_LS -->|TITLE_ONLY_ZH_SP| TITLE_ZH
    
    ANCHOR -->|全量特征发往| API_POOL
    TITLE_ZH -->|自动更新历史| IDE
```

---

## 🔗 推荐🌟🌟🌟🌟🌟⭐反重力 IDE 生态配套工具

| 配套工具 / 资源 | GitHub 链接 | 功能说明 |
| --- | --- | --- |
| 🏛 **Antigravity 历史版本库** | [Antigravity-ide-history](https://github.com/Huo-zai-feng-lang-li/Antigravity-ide-history) | 收集 Antigravity IDE 历史版本（如 `Antigravity-1.20.6.exe`），方便版本回退与特定环境测试。 |
| ⚡ **Antigravity-Power-Pro** | [Antigravity-Power-Pro](https://github.com/Huo-zai-feng-lang-li/Antigravity-Power-Pro) | 支持自定义提示词增强、一键快速滚动、侧边栏自由调整大小等。 |
| 🤖 **Auto-Agent-AntiGravity** | [Auto-Agent-AntiGravity](https://github.com/Huo-zai-feng-lang-li/Auto-Agent-AntiGravity) | Agent 自动点击工具：支持自动点击接受（Auto-Accept）、自动点击重试（Auto-Retry），实现全自动协同。 |
| 🔌 **vscode-antigravity-cockpit** | [vscode-antigravity-cockpit](https://github.com/Huo-zai-feng-lang-li/vscode-antigravity-cockpit) | 插件版切号：配合桌面端实现无感换号。 |
| 🧰 **cockpit-tools** | [cockpit-tools](https://github.com/Huo-zai-feng-lang-li/cockpit-tools) | 桌面端切号工具：无感切号桌面端配套组件。 |

---

## 📦 最新核心插件

> 下表由 `tools/gen-readme-index.js` 据 `package.json` 版本自动维护。

<!-- ZK-MODULE-INDEX:START -->
| 插件 | 版本 | 扩展 id | 说明 | Release / 下载 |
|---|---|---|---|---|
| **zk-proxy-pro** | `9.9.343` | `zk-agi.zk-proxy-pro` | Antigravity 提示词反代 + 外接 API：自定义提示词、渠道、路由、用量。 | [Release](https://github.com/Huo-zai-feng-lang-li/Antigravity-Injection/releases/tag/zk-proxy-pro-v9.9.343) · [⬇ VSIX](https://github.com/Huo-zai-feng-lang-li/Antigravity-Injection/releases/download/zk-proxy-pro-v9.9.343/zk-proxy-pro-9.9.343.vsix) |
<!-- ZK-MODULE-INDEX:END -->

---

## 🛠 代码架构与关键路径

### 1. 架构说明
插件使用独立命名空间 `zk.*/wam.*` 与 per-user 端口 (`8937`)，提供底层代理、外接 API、模型路由及语言服务器 (LSP/ACP) 注入功能。

### 2. 关键代码文件
- `plugins/zk-proxy-pro/extension.js`: 扩展入口，负责 IDE 进程感知与配置 Hook。
- `plugins/zk-proxy-pro/zk-acp-stdio-proxy.js`: ACP (stdio) 代理拦截服务。
- `plugins/zk-proxy-pro/vendor/外接api/core/sp_invert.js`: 提示词判定与中文标题规范 (`TITLE_ONLY_ZH_SP`) 注入。
- `tools/checks/antigravity-target-check.js`: Antigravity 自动化目标断言测试集。

---

## 🚀 使用与构建

### 1. 安装插件
1. 在 IDE 中按下 `Ctrl+Shift+P`。
2. 选择 `Extensions: Install from VSIX...` 并选择打包好的 `.vsix` 文件。

对于 `Antigravity-1.20.6.exe`，建议以调试参数启动：
```cmd
Antigravity.exe --remote-debugging-port=9000
```

### 2. 打包与自检 (Node.js ≥ 18)
```bash
# 构建插件 package
node scripts/build-vsix.mjs zk-proxy-pro

# 运行自动化目标离线断言测试
node tools/checks/antigravity-target-check.js
```

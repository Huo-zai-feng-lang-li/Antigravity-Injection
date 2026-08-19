# 自定义提示词注入修复计划

## 目标

- 恢复 `D:\Antigravity\Antigravity.exe --remote-debugging-port=9000` 的注入链路。
- “官方”Tab 保持原始提示词透传。
- “编”Tab 使用 `custom` 模式，默认只注入 `plugins/zk-proxy-pro/vendor/bundled-origin/_antigravity_rules.txt`。
- 不修改或重启 `D:\Antigravity`。

## 根因证据

- `dao-proxy-pro-v9.9.342` 识别 `Antigravity.exe`；当前代码误改为 `Antigravity-1.20.6.exe`。
- 当前 `_antigravity_rules.txt` 没有任何代码引用。
- 当前“编”映射到 `invert`，且 `custom` 虽在允许列表中，却没有进入实际请求改写分支。
- 运行态二次取证：已安装源码和规则文件哈希与仓库完全一致，但 `ls-main.log` 显示真实对话仍直连 `https://daily-cloudcode-pa.googleapis.com`，代理观测始终 `after=0`。
- Antigravity 的前置桥接器只识别 `dao-agi.dao-proxy-pro` 和 `~/.dao/origin-port.json`；大改后的 `zk-agi.zk-proxy-pro`、`~/.zk/origin-port.json` 无法被主进程发现，因此在扩展宿主启动前桥接直接 fallback。
- 修复策略：恢复兼容扩展 ID `dao-agi.dao-proxy-pro`，同时发布 `.zk/.dao` 两份端口状态；不修改 `D:\Antigravity`。

## 阶段

- [x] 对比 v9.9.342 与当前代码，锁定可执行文件名回归。
- [x] 审计“官方/编”Tab、模式控制面和提示词替换链路。
- [x] 增加回归测试并确认旧实现失败。
- [x] 实施最小修复。
- [x] 运行语法检查、聚焦测试、目标检查和打包验证。
- [x] 复核 diff、影响范围和运行态验收边界。

## 验证证据

- `node --check`：`extension.js`、`source.js` 均通过。
- `npm --prefix plugins/zk-proxy-pro run test:quick`：303 项通过，0 项失败。
- `node tools/checks/antigravity-target-check.js`：退出码 0。
- `node scripts/build-vsix.mjs zk-proxy-pro`：退出码 0，生成 `dist/dao-proxy-pro-9.9.500.vsix`，产物身份为 `dao-agi.dao-proxy-pro`，并包含、校验 `_antigravity_rules.txt`。
- 使用 Antigravity 当前真实 `dao-one-ls-agent-pro.cjs` 做隔离桥接仿真：返回 `http://127.0.0.1:8937`，证明主进程可发现修复后的扩展身份和代理。
- 未修改或重启 `D:\Antigravity`；真实 IDE 注入由用户安装 VSIX 后验收。

## 完成标准

- 目标检查明确要求 `Antigravity.exe`，拒绝只支持版本化文件名。
- `custom` 模式的主对话改写结果严格等于有效自定义文本；无本地覆盖时取规则文件。
- `passthrough` 不改写。
- 经藏不进入 `custom` 默认路径。
- 运行时仅接受 `passthrough/custom`；旧 `invert` 状态自动失效并回落 `custom`。
- 所有验证命令退出码为 0。

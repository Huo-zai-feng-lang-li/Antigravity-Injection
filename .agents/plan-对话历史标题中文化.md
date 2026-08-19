# 对话历史标题中文化计划

## 目标
- 找到 Antigravity 对话历史标题生成类系统提示词的拦截调用处。
- 让标题生成子任务输出简体中文标题。
- 不影响主聊天、模型路由、工具调用、历史数据库读取和 IDE 实时上下文注入。

## 根因
- Antigravity 1.107.0 的 `language_server_windows_x64.exe` 内置 296 字符标题 SP：`Generate a short conversation title around 3-5 words... Should be title-cased, e.g 'Developing a Chess App'.`
- 会话选择器前端直接显示语言服务器返回的 `summary` 字段，不负责翻译。
- 9.9.339 的标题分类要求至少命中两个大小写敏感 marker；真实 SP 只命中 `conversation title`，`classifySPType()` 返回 `null`，中文标题专用 SP 未执行。
- 2026-08-06 实机复测进一步推翻 9.9.340 的完成假设：真实 Gemini REST 请求中，479 字符摘要 SP 位于 `systemInstruction`，而 532 字符标题+目标指令位于 `request.contents[4].parts[0].text`；9.9.340 只验证了孤立字符串分类，没有验证 `modifyGeminiRestSP()` 的真实请求体改写，因此运行时标题字段保持英文。
- 9.9.341 用户实测仍为英文后，运行态 tape 证明加载版本确为 9.9.341、请求也标记为 `transformed=true`，但变体实际是 `gemini_existing_system_instruction`；标题原文仍位于 `request.contents[...]`。直接原因是 `_replaceGeminiTitleInstruction()` 只扫描根级 `obj.contents`，而 9.9.341 回归测试错误地去掉了真实的 `request` 包装层。

## 改法
- 在 Pro 的两条代理路径增加真实强特征 `generate a short conversation title`。
- 标题 marker 使用小写归一化匹配，仍保持至少两个 marker 的误伤保护。
- `invertAnySP()` 继续复用 9.9.339 的短中文标题专用 SP。
- 仅发布 Pro 9.9.340，不修改 Min、主聊天、模型路由、工具调用或 IDE 上下文逻辑。
- 9.9.341 在共享的 Gemini REST 出站边界优先识别真实标题+目标指令，只把第一行标题约束改为简体中文，保留 `Then, in a new line...` 后的目标摘要协议；官方与 BYOK 继续共用该边界，不复制到路由分支。
- 9.9.342 让标题改写同时支持根级 Gemini 请求与 Antigravity 私有 `request` 包装，并将 tape 字段路径记录为 `request.contents[...]`；同构修复同步到 Min，避免镜像继续携带同一缺陷。

## 验证
- 先运行真实标题 SP 回归测试并确认 9.9.339 失败。
- 修复后验证 `source.js` / `sp_invert.js` 均分类为 `title` 并返回中文约束。
- 执行 `node --check`、`npm run test:title` 和 `npm run test:quick`。
- 打包并安装 Pro 9.9.340，通过 9000 新建会话发送“分析项目提示词”，回读会话列表标题。

## 验证结果
- 红灯验证：真实标题 SP 在 9.9.339 的两条路径均返回 `null`，`2 failed / 0 passed`。
- 修复后专项测试：`2 passed / 0 failed`。
- 3 个修改 JS 文件 `node --check` 退出 `0`。
- `npm run test:quick`：`303 passed / 0 failed`。
- 已生成 `dist/zk-proxy-pro-9.9.340.vsix`，包内版本和两条 marker 修复均已回读确认。
- VSIX SHA-256：`D5FCF23E896278D863689FD9D47959BCD1BEA914AB47BBF07E0500512E813E1B`。
- Antigravity 实际安装与 9000 新会话标题验证由用户手动验收，当前不宣称运行时已通过。
- 9.9.340 运行态复现：CDP 新建会话发送“分析项目提示词”，新标题仍为 `Analyzing Project Prompt Engineering`；8937 tape 记录 `rid=863`、`GEMINI_REST_CHAT`、`transformed=false`，标题指令位于 `request.contents[4].parts[0].text`。
- 9.9.341 TDD 红灯：真实请求体用例先报 `modifyGeminiRestSP is not a function`，补齐测试导出后按行为失败，英文 `Should be title-cased` 原样保留；实现后专项测试 `3 passed / 0 failed`，日志显示 `gemini_title_instruction before=532B → after=460B`。
- 9.9.342 TDD 红灯：将用例恢复为真实 `request.contents[]` 包装后，Pro 专项测试 `2 passed / 1 failed`，日志为 `gemini_internal_passthrough`；Min 镜像加入同一用例后先因缺少测试导出失败。修复包装层扫描并同步 Min 后，专项测试 `4 passed / 0 failed`，两条实现均记录 `gemini_title_instruction before=532B → after=460B`。
- 9.9.342 已构建并安装：VSIX `dist/zk-proxy-pro-9.9.342.vsix`，SHA-256 `DA8E3B427D35F8335BF59EBD41332C60219D6DDFC4B27C714E8518E3D01CEC0E`；安装目录回读版本 `9.9.342`，9000/8937 重启后 `/origin/ping.self_file` 指向该版本，`dao_loaded=true`、`req_total=162`。
- 运行态验收：用户在同一 `D:\Antigravity\Antigravity.exe --remote-debugging-port=9000` 链路确认新建会话历史标题已显示中文；CDP 页面发送中文标题测试请求成功得到回复，代理 tape 持续记录 `/v1internal:streamGenerateContent?alt=sse` 命中。未观察到本次修复引入的控制台错误；旧英文标题不回写。

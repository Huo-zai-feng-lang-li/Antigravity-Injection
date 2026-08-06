# Antigravity Injection · Git 提交规范指南 (Conventional Commits)

为了确保项目版本历史清晰、自动化 Release 日志生成准确，所有提交到本仓库的 Commit Message 必须遵循以下规范。

---

## 1. 提交格式 (Commit Message Format)

每个提交信息由 **Header**、**Body (可选)** 和 **Footer (可选)** 组成：

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

---

## 2. Type 规范 (推荐类型)

必须使用以下类型前缀之一：

- **`feat`**: 引入新功能 (Feature)
- **`fix`**: 修复 Bug
- **`docs`**: 仅仅修改了文档 (README, RELEASE_NOTES, docs/*)
- **`style`**: 不影响代码含义的修改 (格式化、空白、缺少分号等)
- **`refactor`**: 代码重构 (既不修复 bug 也不添加新功能的代码变更)
- **`perf`**: 提高性能的代码变更
- **`test`**: 添加缺失的测试或更正现有测试
- **`build`**: 影响构建系统或外部依赖项的更改 (如 `build-vsix.mjs`, `package.json` 等)
- **`ci`**: 针对 CI 配置文件和脚本的更改 (如 `.github/workflows/`)
- **`chore`**: 其他不修改 src 或 test 文件的更改

---

## 3. Scope 规范 (作用域)

可选，用于说明 Commit 影响的模块范围：

- `pro`: `plugins/zk-proxy-pro` 扩展核心
- `acp`: stdio ACP 代理模块
- `router`: 模型路由与外接 API 模块
- `docs`: 项目说明文档与主页
- `workflow`: CI/CD 发布流

---

## 4. 示例 (Examples)

- **功能新增**：`feat(pro): 新增 DeepSeek V3 格式自动转译`
- **Bug 修复**：`fix(router): 修复三模块面板弹窗被 Webview 拦截的问题`
- **重构**：`refactor(pro): 全量清理 Windsurf 字样，专一支持 Antigravity-1.20.6.exe`
- **版本发布**：`release: v9.9.343 - 彻底修正说明文档与 Releases 链接`

---

## 5. 自动化校验

GitHub Actions 建议在 Pull Request 或 Push 时对 Commit Message 进行语义化检查。保持良好的 Commit 习惯是项目持续演进与质量保证的基础。

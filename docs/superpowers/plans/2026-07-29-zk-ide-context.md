# ZK IDE Context Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject current single-window IDE file, cursor, and full selection metadata into official Gemini and BYOK user messages for installed ZK Proxy Pro 9.9.337.

**Architecture:** A VS Code-facing collector produces a versioned immutable snapshot on demand. A provider-neutral pure injector appends one delimited JSON block to the last user text part/message, while `extension.js` passes the getter into the in-process proxy and router. All unsupported shapes and exceptions fail open.

**Tech Stack:** Node.js CommonJS, VS Code Extension API, existing ZK proxy test harness, PowerShell SHA-256 tooling.

---

### Task 1: Preserve Baseline

**Files:**
- Create: external backup directory beside installed extension
- Create: `tools/checks/zk-ide-context-patch-check.ps1`

- [ ] Copy the complete 9.9.337 directory to a timestamped backup.
- [ ] Generate sorted SHA-256 manifests for original and working directories.
- [ ] Verify package version is exactly 9.9.337 before any installed-directory write.

### Task 2: RED Tests

**Files:**
- Create: `plugins/zk-proxy-pro/test/ide-context.test.js`
- Create: `plugins/zk-proxy-pro/ide-context.js`
- Create: `plugins/zk-proxy-pro/vendor/ide-context-injector.js`

- [ ] Add tests for no editor, empty/reversed selection, UTF-16 offsets, file-only tabs, case-insensitive dedupe, marker escaping, full long selection, Gemini and BYOK last-user injection, duplicate marker, and byte-identical fail-open.
- [ ] Run the focused test and confirm failure because implementations are absent.

### Task 3: Collector GREEN

**Files:**
- Modify: `plugins/zk-proxy-pro/ide-context.js`
- Modify: `plugins/zk-proxy-pro/extension.js`

- [ ] Implement a request-time collector using `activeTextEditor`, `tabGroups.all`, `TabInputText`, `Selection.active/start/end`, `getText(selection)`, and `offsetAt`.
- [ ] Register editor/selection/tab listeners as cache invalidators and pass `getSnapshot` into proxy `start`.
- [ ] Run focused collector tests and confirm pass.

### Task 4: Shared Injector GREEN

**Files:**
- Modify: `plugins/zk-proxy-pro/vendor/ide-context-injector.js`
- Modify: `plugins/zk-proxy-pro/vendor/bundled-origin/source.js`
- Modify: `plugins/zk-proxy-pro/vendor/外接api/core/zk_router.js`

- [ ] Implement exact `<ZK_IDE_CONTEXT_V1>` serialization without truncation.
- [ ] Append only to the last user message's existing text field/part and detect an existing marker.
- [ ] Bind getter through source/router initialization and keep safe diagnostics content-free.
- [ ] Run injector tests and confirm pass.

### Task 5: Regression Verification

**Files:**
- Modify: `plugins/zk-proxy-pro/vendor/外接api/core/zk-test.js` only if the existing harness needs a focused check hook.

- [ ] Run `node --check` for every changed JavaScript file.
- [ ] Run focused IDE context tests.
- [ ] Run `npm run test:quick` and require zero failures.
- [ ] Review diff and ensure no package version, system prompt, model, tools, or route behavior changed.

### Task 6: Install, Validate, and Rehearse Rollback

**Files:**
- Modify: installed 9.9.337 files corresponding to verified repository source
- Create: patched SHA-256 manifest

- [ ] Copy only verified patch files into the installed 9.9.337 directory.
- [ ] Run the patch checker for version, marker, file list, and hashes.
- [ ] Restore the entire original directory from backup and compare the full original manifest.
- [ ] Reapply the verified patch and rerun syntax/tests/checker.
- [ ] Stop any task-started processes; leave Antigravity itself untouched unless live UI verification is possible without disrupting user state.

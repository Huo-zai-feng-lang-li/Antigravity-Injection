#!/usr/bin/env node
// 单模块 Release 说明生成。用法: node tools/release-notes.js <key>
// 环境: GITHUB_REPOSITORY=owner/repo (默认 Huo-zai-feng-lang-li/Antigravity-Injection)
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "modules.json"), "utf8"));
const REPO = process.env.GITHUB_REPOSITORY || "Huo-zai-feng-lang-li/Antigravity-Injection";

const key = process.argv[2];
const m = reg.modules.find((x) => x.key === key);
if (!m) { console.error(`unknown module key: ${key}`); process.exit(1); }

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, m.dir, "package.json"), "utf8"));
const ver = pkg.version;
const tag = `${m.key}-v${ver}`;
const vsixName = `${m.name}-${ver}.vsix`;
const assetUrl = `https://github.com/${REPO}/releases/download/${tag}/${vsixName}`;

// 找到 changelog 文件（大小写兼容），抽取最新一段。
function topChangelog() {
  const cand = ["CHANGELOG.md", "changelog.md", "CHANGELOG.MD"];
  let file = null;
  for (const c of cand) {
    const p = path.join(repoRoot, m.dir, c);
    if (fs.existsSync(p)) { file = p; break; }
  }
  if (!file) return "";
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  // 版本条目起始行：markdown 标题 `## ...` 或纯版本行 `vX.Y.Z ...`
  const isEntry = (s) => /^##\s+/.test(s) || /^v\d+\.\d+(\.\d+)?\b/.test(s.trim());
  const seg = [];
  let started = false;
  for (const line of lines) {
    if (isEntry(line)) {
      if (!started) { started = true; }
      else break; // 第二个条目，停
    }
    if (started) seg.push(line);
  }
  return seg.join("\n").trim();
}

const out = [];
out.push(`# ${m.title} — v${ver}`);
out.push("");
out.push(m.desc);
out.push("");
out.push(`> 去心发布：本 Release 仅含 **${m.key}** 一个模块，独立于其它插件。只有该模块改动时才刷新此 Release，互不打扰。`);
out.push("");
out.push("## 安装");
out.push("");
out.push("```bash");
out.push(`# 下载 ${vsixName} 后`);
out.push(`code --install-extension ${vsixName} --force`);
out.push(`# 或在 Antigravity-1.20.6.exe 命令面板中：Extensions: Install from VSIX...`);
out.push("```");
out.push("");
out.push(`**下载**：[\`${vsixName}\`](${assetUrl}) · **扩展 id**：\`${m.extId}\``);
out.push("");

const cl = topChangelog();
if (cl) {
  out.push("---");
  out.push("");
  out.push("## 最新变更");
  out.push("");
  out.push(cl);
  out.push("");
}
process.stdout.write(out.join("\n") + "\n");

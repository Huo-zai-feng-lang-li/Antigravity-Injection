#!/usr/bin/env node
// 依 modules.json + 各模块当前版本，重新生成 README.md 里的「插件下载索引表」
// （位于 <!-- DAO-MODULE-INDEX:START --> 与 <!-- DAO-MODULE-INDEX:END --> 之间）。
// 每个 vsix 模块链接到各自的 Release tag <key>-v<version> 与对应资产 —— 去心、按模块版本。
// 环境: GITHUB_REPOSITORY=owner/repo (默认 Huo-zai-feng-lang-li/Antigravity-Injection)
// 退出码 0=已写入（无论有无变化）；打印 "changed" 或 "nochange"。
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "modules.json"), "utf8"));
const REPO = process.env.GITHUB_REPOSITORY || "Huo-zai-feng-lang-li/Antigravity-Injection";
const README = path.join(repoRoot, "README.md");
const START = "<!-- DAO-MODULE-INDEX:START -->";
const END = "<!-- DAO-MODULE-INDEX:END -->";

function moduleVersion(m) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, m.dir, "package.json"), "utf8")).version;
}

function row(m) {
  const ver = moduleVersion(m);
  const tag = `${m.key}-v${ver}`;
  const vsixName = `${m.name}-${ver}.vsix`;
  const rel = `https://github.com/${REPO}/releases/tag/${tag}`;
  const asset = `https://github.com/${REPO}/releases/download/${tag}/${vsixName}`;
  return `| **${m.key}** | \`${ver}\` | \`${m.extId}\` | ${m.desc} | [Release](${rel}) · [⬇ VSIX](${asset}) |`;
}

function build() {
  const lines = [];
  lines.push("| 插件 | 版本 | 扩展 id | 说明 | Release / 下载 |");
  lines.push("|---|---|---|---|---|");
  for (const m of reg.modules) {
    if (m.key === "dao-proxy-pro") lines.push(row(m));
  }
  return lines.join("\n");
}

function replaceBlock(txt, start, end, inner, label) {
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(txt)) {
    console.error(`README 缺少${label}标记 ${start} ... ${end}`);
    process.exit(2);
  }
  return txt.replace(re, `${start}\n${inner}\n${end}`);
}

function main() {
  let txt = fs.readFileSync(README, "utf8");
  const orig = txt;
  txt = replaceBlock(txt, START, END, build(), "下载索引");
  if (txt === orig) { console.log("nochange"); return; }
  fs.writeFileSync(README, txt);
  console.log("changed");
}

main();

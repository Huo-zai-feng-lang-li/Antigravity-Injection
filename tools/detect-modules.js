#!/usr/bin/env node
// 去心变更检测：改动文件列表 → 输出需要发版 vsix 的模块 key（JSON 数组）。
// 用法:
//   node tools/detect-modules.js --all                 # 强制全部 vsix 模块
//   node tools/detect-modules.js --files <path>        # 从文件读改动列表（每行一路径）
//   echo "plugins/rt-flow/x.js" | node tools/detect-modules.js --stdin
// 规则: 命中某模块 trigger 前缀 → 该模块发版；命中基础设施（release.yml / 构建脚本 / 本表）→ 全部 vsix 发版。
const fs = require("fs");
const path = require("path");

const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "modules.json"), "utf8"));
const vsix = reg.modules.filter((m) => m.kind === "vsix");

const INFRA = [
  ".github/workflows/release.yml",
  "scripts/build-vsix.mjs",
  "tools/modules.json",
  "tools/detect-modules.js",
  "tools/release-notes.js",
  "tools/gen-readme-index.js",
];

function parseArgs(argv) {
  const a = { mode: "files", src: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--all") a.mode = "all";
    else if (argv[i] === "--stdin") a.mode = "stdin";
    else if (argv[i] === "--files") { a.mode = "files"; a.src = argv[++i]; }
  }
  return a;
}

function readChanged(a) {
  if (a.mode === "all") return null;
  let raw = "";
  if (a.mode === "stdin") raw = fs.readFileSync(0, "utf8");
  else if (a.src) raw = fs.readFileSync(a.src, "utf8");
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function hit(file, prefix) {
  return file === prefix || file.startsWith(prefix.replace(/\/?$/, "/"));
}

function main() {
  const a = parseArgs(process.argv);
  const changed = readChanged(a);
  if (changed === null) { // --all
    console.log(JSON.stringify(vsix.map((m) => m.key)));
    return;
  }
  if (changed.some((f) => INFRA.includes(f))) {
    console.log(JSON.stringify(vsix.map((m) => m.key)));
    return;
  }
  const keys = [];
  for (const m of vsix) {
    const triggers = m.trigger && m.trigger.length ? m.trigger : [m.dir];
    if (changed.some((f) => triggers.some((t) => hit(f, t)))) keys.push(m.key);
  }
  console.log(JSON.stringify(keys));
}

main();

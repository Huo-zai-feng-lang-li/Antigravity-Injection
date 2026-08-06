#!/usr/bin/env node
// 三插件合一 Release 说明生成。用法: node tools/bundle-notes.js
// 产出单一聚合 Release（tag: all-in-one）的正文：三插件 VSIX + 源代码 + 视频，一处看全。
// 环境: GITHUB_REPOSITORY=owner/repo (默认 Huo-zai-feng-lang-li/Antigravity-Injection)
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const reg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "modules.json"), "utf8"),
);
const REPO =
  process.env.GITHUB_REPOSITORY || "Huo-zai-feng-lang-li/Antigravity-Injection";
const TAG = "all-in-one";

// 视频（与 README / docs 同源，单一事实）
const VIDEOS = [
  {
    bv: "BV1Cdjn6VEhF",
    title: "antigravity 完美外接第三方模型 · 满足一切暗黑需求（zk-proxy-pro）",
  },
  {
    bv: "BV1sY9sBLE5M",
    title: "antigravity 反代 + 替换官方底层提示词 · 彻底解锁 agent 所有能力",
  },
  { bv: "BV1cELA6QEBY", title: "阴符经 + AI · 根除 AI 一切道德感" },
];

function ver(m) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, m.dir, "package.json"), "utf8"),
  ).version;
}

function dl(m) {
  const v = ver(m);
  const vsix = `${m.name}-${v}.vsix`;
  return `https://github.com/${REPO}/releases/download/${TAG}/${vsix}`;
}

const out = [];
out.push("# Antigravity Injection · ZK法自然 — 插件 + 源代码");
out.push("");
out.push(
  "> **一处看全**：本 Release 包含 **zk-proxy-pro 插件 VSIX + 完整源代码**，单一入口、随主线刷新。下载即用、读码即见。",
);
out.push("");
out.push("## 🎬 视频介绍");
out.push("");
for (const v of VIDEOS)
  out.push(`- ▶ [${v.title}](https://www.bilibili.com/video/${v.bv})`);
out.push("");
out.push(
  "🌐 [自动播放主页（进入即播）](https://huo-zai-feng-lang-li.github.io/Antigravity-Injection/) · 👤 [我的 B 站主页](https://space.bilibili.com/2114868619)",
);
out.push("");
out.push("## 📦 插件（下载即用）");
out.push("");
out.push("| 插件 | 版本 | 扩展 id | 说明 | 下载 |");
out.push("|---|---|---|---|---|");
for (const m of reg.modules) {
  out.push(
    `| **${m.key}** | \`${ver(m)}\` | \`${m.extId}\` | ${m.desc} | [⬇ ${m.name}-${ver(m)}.vsix](${dl(m)}) |`,
  );
}
out.push("");
out.push("## 🧩 源代码（一处读全）");
out.push("");
out.push(
  "- **完整源代码**：见本 Release 底部 **Source code (zip / tar.gz)**，或附件 [`Antigravity-Injection-source.zip`](https://github.com/" +
    REPO +
    "/releases/download/" +
    TAG +
    "/Antigravity-Injection-source.zip)（与本版本一致的快照，含插件全部源码 + 构建/发版脚本）。",
);
out.push(
  "- 插件源码位于 `plugins/zk-proxy-pro`；构建脚本 `scripts/build-vsix.mjs` 可一键复现 VSIX。",
);
out.push("");
out.push("## 🚀 安装");
out.push("");
out.push("```bash");
out.push("# 下载对应 .vsix 后：");
out.push("code --install-extension zk-proxy-pro-*.vsix --force");
out.push("# 或在 Antigravity-1.20.6.exe 命令面板中：Extensions: Install from VSIX...");
out.push("```");
out.push("");
out.push(
  "> 插件的逐版本变更见独立 Release（tag `<key>-v<version>`）与目录内 `CHANGELOG.md`。",
);
out.push("");
out.push(
  "损之又损，以至于无为 · 无为而无不为 · 水善利万物而有静 · **ZK法自然**",
);
process.stdout.write(out.join("\n") + "\n");

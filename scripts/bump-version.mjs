#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "plugins", "zk-proxy-pro", "package.json");
const targetCheckPath = join(root, "tools", "checks", "antigravity-target-check.js");
const changelogPath = join(root, "plugins", "zk-proxy-pro", "CHANGELOG.md");
const readmePath = join(root, "README.md");
const distDir = join(root, "dist");

// 1. 读取当前版本
const pkgContent = readFileSync(pkgPath, "utf-8");
const pkg = JSON.parse(pkgContent);
const oldVersion = pkg.version;

// 解析命令行参数
let arg1 = process.argv[2] || "patch";
let customDesc = process.argv[3] || "";

function bumpVersionStr(ver, type) {
  const parts = ver.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`无法解析的版本号格式: ${ver}`);
  }
  if (type === "patch") {
    parts[2] += 1;
  } else if (type === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else if (type === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  }
  return parts.join(".");
}

let newVersion = oldVersion;
if (/^\d+\.\d+\.\d+$/.test(arg1)) {
  newVersion = arg1;
} else {
  newVersion = bumpVersionStr(oldVersion, arg1);
}

if (!customDesc) {
  customDesc = "zk-proxy-pro 标准化更新与全自动构建闭环。";
}

console.log(`\n🚀 开始全自动版本递增全流程: v${oldVersion} ➔ v${newVersion}`);

// 2. 更新 plugins/zk-proxy-pro/package.json
const updatedPkgContent = pkgContent.replace(
  `"version": "${oldVersion}"`,
  `"version": "${newVersion}"`
);
writeFileSync(pkgPath, updatedPkgContent, "utf-8");
console.log(`✅ [1/7] 已更新 plugins/zk-proxy-pro/package.json -> v${newVersion}`);

// 3. 更新 tools/checks/antigravity-target-check.js
let checkContent = readFileSync(targetCheckPath, "utf-8");
checkContent = checkContent.replace(
  `PKG_VERSION: "${oldVersion}"`,
  `PKG_VERSION: "${newVersion}"`
);
writeFileSync(targetCheckPath, checkContent, "utf-8");
console.log(`✅ [2/7] 已更新 tools/checks/antigravity-target-check.js -> v${newVersion}`);

// 4. 更新 plugins/zk-proxy-pro/CHANGELOG.md
let changelogContent = readFileSync(changelogPath, "utf-8");
const changelogHeader = "# Changelog · zk-proxy-pro\n\n> 完整版本历史。详情页（README）保持精简，本文件单列于扩展的 Changelog 标签页。\n\n";
const newChangelogEntry = `v${newVersion} · ${customDesc}\n\n`;
if (changelogContent.startsWith("# Changelog · zk-proxy-pro")) {
  const rest = changelogContent.replace(changelogHeader, "");
  writeFileSync(changelogPath, changelogHeader + newChangelogEntry + rest, "utf-8");
} else {
  writeFileSync(changelogPath, newChangelogEntry + changelogContent, "utf-8");
}
console.log(`✅ [3/7] 已追加 plugins/zk-proxy-pro/CHANGELOG.md 日志`);

// 5. 更新 README.md
let readmeContent = readFileSync(readmePath, "utf-8");
readmeContent = readmeContent
  .replaceAll(`zk-proxy-pro-v${oldVersion}`, `zk-proxy-pro-v${newVersion}`)
  .replaceAll(`zk-proxy-pro-${oldVersion}.vsix`, `zk-proxy-pro-${newVersion}.vsix`)
  .replaceAll(`\`${oldVersion}\``, `\`${newVersion}\``);
writeFileSync(readmePath, readmeContent, "utf-8");
console.log(`✅ [4/7] 已更新 README.md 版本号与下载链接`);

// 6. 清理旧 VSIX & 重新构建最新 VSIX
if (existsSync(distDir)) {
  const files = readdirSync(distDir);
  for (const f of files) {
    if (f.startsWith("zk-proxy-pro-") && f.endsWith(".vsix")) {
      unlinkSync(join(distDir, f));
    }
  }
}
console.log(`📦 [5/7] 正在构建最新 VSIX 产物...`);
execSync(`node scripts/build-vsix.mjs zk-proxy-pro`, { cwd: root, stdio: "inherit" });

// 7. 全量自动化测试与断言自检
console.log(`🧪 [6/7] 正在执行全量自动化测试与断言校验...`);
execSync(`node --test plugins/zk-proxy-pro/test/title-classifier.test.js plugins/zk-proxy-pro/test/ide-context.test.js`, { cwd: root, stdio: "inherit" });
execSync(`node tools/checks/antigravity-target-check.js`, { cwd: root, stdio: "inherit" });
console.log(`🎉 离线测试与断言自检 100% 验证通过！`);

// 8. 自动 Git Commit & Git Push
console.log(`🌐 [7/7] 正在自动 Git Commit 并 Push 至远程仓库...`);
execSync(`git add .`, { cwd: root, stdio: "inherit" });
execSync(`git commit -m "chore(release): bump zk-proxy-pro to v${newVersion}"`, { cwd: root, stdio: "inherit" });
execSync(`git push`, { cwd: root, stdio: "inherit" });

console.log(`\n✨ 全流程圆满完成！已成功发布并推送版本 v${newVersion}！🚀\n`);

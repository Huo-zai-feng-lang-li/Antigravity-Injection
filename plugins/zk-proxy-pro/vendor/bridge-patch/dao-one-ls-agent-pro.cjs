"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

// v9.9.525 · 兼容 zk-agent.zk-proxy-pro(当前) / zk-agi.zk-proxy-pro(历史) / dao-agi.dao-proxy-pro(历史)
//   优先当前维护版, 回退历史版; 任一存在且代理健康即 bridge ready
const AGENT_PRO_IDS = ["zk-agent.zk-proxy-pro", "zk-agi.zk-proxy-pro", "dao-agi.dao-proxy-pro"];
const DEFAULT_PORT = 8889;

function readObsolete(extensionsRoot) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(extensionsRoot, ".obsolete"), "utf8"),
    );
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function findLatestAgentPro(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const extensionsRoot =
    options.extensionsRoot || path.join(homeDir, ".antigravity", "extensions");
  // 支持单 ID 覆盖(向后兼容), 默认扫描双发布者
  const ids = options.extensionId
    ? [options.extensionId]
    : AGENT_PRO_IDS;

  let names;
  try {
    names = fs.readdirSync(extensionsRoot);
  } catch {
    return null;
  }

  const obsolete = readObsolete(extensionsRoot);
  const candidates = [];

  for (const extensionId of ids) {
    const escapedId = extensionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const versionPattern = new RegExp(
      `^${escapedId}-(\\d+)\\.(\\d+)\\.(\\d+)$`,
    );
    for (const name of names) {
      const match = name.match(versionPattern);
      if (!match || obsolete[name] === true) continue;
      const extensionDir = path.join(extensionsRoot, name);
      const sourceFile = path.join(
        extensionDir,
        "vendor",
        "bundled-origin",
        "source.js",
      );
      if (!fs.existsSync(sourceFile)) continue;
      candidates.push({
        extensionDir,
        extensionName: name,
        sourceFile,
        version: `${match[1]}.${match[2]}.${match[3]}`,
        versionParts: match.slice(1, 4).map(Number),
      });
    }
  }

  candidates.sort((left, right) =>
    compareVersions(left.versionParts, right.versionParts),
  );
  const latest = candidates[0];
  if (!latest) return null;
  const { versionParts, ...result } = latest;
  return result;
}

function fnvPort(username) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < username.length; index += 1) {
    hash ^= username.charCodeAt(index);
    hash = (hash * 0x01000193) >>> 0;
  }
  return 8889 + (hash % 100);
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function resolveUsername(explicitUsername) {
  if (typeof explicitUsername === "string") return explicitUsername;
  try {
    return os.userInfo().username;
  } catch {
    return null;
  }
}

function getCandidatePorts(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const ports = [];
  // v9.9.507 · 同时读 .zk / .dao 两个宣告目录 (zk-proxy-pro 两个都写)
  for (const dirName of [".zk", ".dao"]) {
    try {
      const published = JSON.parse(
        fs.readFileSync(path.join(homeDir, dirName, "origin-port.json"), "utf8"),
      );
      if (validPort(published && published.port) && !ports.includes(published.port)) {
        ports.push(published.port);
      }
    } catch {}
  }

  const username = resolveUsername(options.username);
  const fallback = username ? fnvPort(username) : DEFAULT_PORT;
  if (!ports.includes(fallback)) ports.push(fallback);
  return ports;
}

function requestPing(port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let activeResponse = null;
    let request;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      request.setTimeout(0);
      if (activeResponse && !activeResponse.complete) activeResponse.destroy();
      resolve(value);
    };
    request = http.get(
      {
        host: "127.0.0.1",
        path: "/origin/ping",
        port,
      },
      (response) => {
        activeResponse = response;
        if (response.statusCode !== 200) {
          finish(null);
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 65536) finish(null);
        });
        response.on("end", () => {
          try {
            finish(JSON.parse(body));
          } catch {
            finish(null);
          }
        });
        response.on("error", () => finish(null));
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on("error", () => finish(null));
  });
}

function sameFile(left, right) {
  if (typeof left !== "string") return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  if (process.platform === "win32") {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForAgentProxy(options = {}) {
  const agentPro = findLatestAgentPro(options);
  if (!agentPro) return null;

  const timeoutMs = Math.max(0, options.timeoutMs ?? 10000);
  const intervalMs = Math.max(1, options.intervalMs ?? 100);
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 500);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    for (const port of getCandidatePorts(options)) {
      const remaining = deadline - Date.now();
      if (remaining < 0) return null;
      const ping = await requestPing(
        port,
        Math.min(requestTimeoutMs, Math.max(1, remaining)),
      );
      if (
        ping &&
        ping.ok === true &&
        sameFile(ping.self_file, agentPro.sourceFile)
      ) {
        return `http://127.0.0.1:${port}`;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await delay(Math.min(intervalMs, remaining));
  }
}

module.exports = {
  findLatestAgentPro,
  getCandidatePorts,
  waitForAgentProxy,
};

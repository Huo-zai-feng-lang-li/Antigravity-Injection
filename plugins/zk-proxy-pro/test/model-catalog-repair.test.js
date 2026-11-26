"use strict";

// v9.9.536 · fetchAvailableModels 目录修复单测
// 背景: 旧 LS 主对话固定发占位符 gemini-2.5-pro; 官方 2026-11-26 目录删掉该项后,
//       SendUserCascadeMessage 直接报 "unknown model key MODEL_GOOGLE_GEMINI_2_5_PRO"。
// 覆盖: 缺失注入 / 幂等 / gzip 改写 / 坏包不误伤 / 不污染下拉分组。
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

// 只测纯函数模块，避免 require source.js 拉起代理进程/定时器
const repair = require(
  path.join(__dirname, "..", "vendor", "bundled-origin", "_ag-catalog-repair.cjs"),
);

function baseCatalog() {
  return {
    models: {
      "gemini-3-flash": {
        displayName: "Gemini 3 Flash",
        model: "MODEL_PLACEHOLDER_M18",
        recommended: true,
        maxTokens: 1048576,
      },
      "gemini-2.5-flash": {
        displayName: "Gemini 3.5 Flash Lite",
        model: "MODEL_GOOGLE_GEMINI_2_5_FLASH",
        recommended: true,
        maxTokens: 1048576,
      },
    },
    agentModelSorts: [
      { displayName: "Recommended", groups: [{ modelIds: ["gemini-3-flash"] }] },
    ],
    defaultAgentModelId: "gemini-3-flash",
  };
}

test("目录缺 2.5 Pro 时补回外壳模型，原有模型不动", () => {
  const obj = baseCatalog();
  const added = repair.ensureLegacyShellModels(obj);
  assert.equal(added, 1);
  assert.ok(obj.models["gemini-2.5-pro"], "应注入 gemini-2.5-pro");
  assert.equal(obj.models["gemini-2.5-pro"].model, "MODEL_GOOGLE_GEMINI_2_5_PRO");
  assert.equal(obj.models["gemini-2.5-pro"].displayName, "Gemini 2.5 Pro");
  assert.equal(obj.models["gemini-2.5-pro"].recommended, false);
  assert.equal(obj.models["gemini-3-flash"].model, "MODEL_PLACEHOLDER_M18");
  assert.equal(Object.keys(obj.models).length, 3);
});

test("已存在 2.5 Pro 时不重复注入（幂等）", () => {
  const obj = baseCatalog();
  obj.models["gemini-2.5-pro"] = {
    displayName: "Gemini 2.5 Pro",
    model: "MODEL_GOOGLE_GEMINI_2_5_PRO",
    recommended: false,
  };
  assert.equal(repair.ensureLegacyShellModels(obj), 0);
  assert.equal(Object.keys(obj.models).length, 3);
});

test("外壳模型不写进 agentModelSorts，避免污染下拉", () => {
  const obj = baseCatalog();
  repair.ensureLegacyShellModels(obj);
  const ids = obj.agentModelSorts[0].groups[0].modelIds;
  assert.deepEqual(ids, ["gemini-3-flash"]);
});

test("gzip 响应体：解压 → 注入 → 重新压缩，编码标记为 gzip", () => {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(baseCatalog()), "utf8"));
  const out = repair.repairAvailableModelsBody(gz, "gzip");
  assert.ok(out, "应返回改写结果");
  assert.equal(out.gzip, true);
  assert.equal(out.added, 1);
  const parsed = JSON.parse(zlib.gunzipSync(out.buf).toString("utf8"));
  assert.equal(parsed.models["gemini-2.5-pro"].model, "MODEL_GOOGLE_GEMINI_2_5_PRO");
});

test("非 gzip 明文响应体同样可改写", () => {
  const plain = Buffer.from(JSON.stringify(baseCatalog()), "utf8");
  const out = repair.repairAvailableModelsBody(plain, "");
  assert.ok(out);
  assert.equal(out.gzip, false);
  const parsed = JSON.parse(out.buf.toString("utf8"));
  assert.ok(parsed.models["gemini-2.5-pro"]);
});

test("已含 2.5 Pro 的响应体不重写（返回 null，原样透传）", () => {
  const obj = baseCatalog();
  obj.models["gemini-2.5-pro"] = { model: "MODEL_GOOGLE_GEMINI_2_5_PRO" };
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  assert.equal(repair.repairAvailableModelsBody(plain, ""), null);
});

test("坏 JSON / 非对象响应体返回 null，不误伤", () => {
  assert.equal(repair.repairAvailableModelsBody(Buffer.from("{not json"), ""), null);
  assert.equal(repair.repairAvailableModelsBody(Buffer.from('{"models":[]}'), ""), null);
  assert.equal(repair.repairAvailableModelsBody(Buffer.alloc(0), ""), null);
});


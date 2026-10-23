"use strict";

// v9.9.525 · Gemini 动态模型改写单测 (_ag-gemini37-compat.cjs)
// 覆盖: URL 提取模型名、LS 占位符动态替换、默认回退、非占位符不误伤、健壮性
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// 测试隔离：必须在 require 之前设置，让 compat 把旁路落盘重定向到临时目录，
// 避免在装有 IDE 的开发机上跑测试时覆盖/删除用户真实的 _agcap/_ag-selected.json。
const os = require("node:os");
const testStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-compat-test-"));
const testStateFile = path.join(testStateDir, "_ag-selected.json");
process.env.AG_SELECTED_FILE = testStateFile;

const compatPath = path.join(
  __dirname,
  "..",
  "vendor",
  "bundled-origin",
  "_ag-gemini37-compat.cjs",
);
const compat = require(compatPath);

const SOURCE_MODEL = compat.SOURCE_MODEL; // gemini-2.5-pro
const DEFAULT_TARGET = compat.DEFAULT_TARGET_MODEL; // gemini-3.8-flash-high

function buf(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8");
}
function parse(b) {
  return JSON.parse(b.toString("utf8"));
}

test("URL 模型提取: 从 REST streamGenerateContent 提取真实模型名", () => {
  const url = "/v1beta/models/gemini-3.9-pro:streamGenerateContent?alt=sse";
  const model = compat.extractModelFromUrl(url);
  assert.equal(model, "gemini-3.9-pro");
});

test("URL 模型提取: 当 URL 中也是占位符时返回 null", () => {
  const url = `/v1beta/models/${SOURCE_MODEL}:streamGenerateContent`;
  assert.equal(compat.extractModelFromUrl(url), null);
});

test("URL 模型提取: 非模型 URL 返回 null", () => {
  assert.equal(compat.extractModelFromUrl("/v1internal:streamGenerateContent"), null);
  assert.equal(compat.extractModelFromUrl(null), null);
});

test("动态模型改写: 带有 URL 时动态优先改写为 URL 中的模型名", () => {
  const url = "/v1beta/models/gemini-4.0-ultra:generateContent";
  const input = buf({ model: SOURCE_MODEL, contents: [] });
  const out = parse(compat.rewriteRequestBody(input, url));
  assert.equal(out.model, "gemini-4.0-ultra");
});

test("默认回退改写: 无有效 URL 时改写为默认 TARGET 模型", () => {
  const input = buf({ model: SOURCE_MODEL, contents: [] });
  const out = parse(compat.rewriteRequestBody(input, null));
  assert.equal(out.model, DEFAULT_TARGET);
});

test("不误伤: 非占位符模型名保持不变", () => {
  const input = buf({ model: "gemini-2.0-flash", contents: [] });
  const out = compat.rewriteRequestBody(input, null);
  assert.equal(out, input);
  assert.equal(parse(out).model, "gemini-2.0-flash");
});

test("健壮性: 非 Buffer / 非法 JSON 原样返回", () => {
  assert.equal(compat.rewriteRequestBody(null), null);
  const broken = Buffer.from('{"model": broken');
  assert.equal(compat.rewriteRequestBody(broken), broken);
});

// v9.9.529 · 推理强度 High 提升 (_agLiftThinking)
test("推理强度提升: 主对话请求 thinkingBudget 1024 -> -1(High/动态)", () => {
  const input = buf({
    model: SOURCE_MODEL,
    request: {
      generationConfig: {
        thinkingConfig: { thinkingBudget: 1024 },
      },
    },
  });
  const out = parse(compat.rewriteRequestBody(input, "/v1internal:streamGenerateContent?alt=sse"));
  assert.equal(out.model, DEFAULT_TARGET);
  assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, -1);
});

// 2026-10-23 · 按目标 uid 动态设置 thinkingBudget（原无条件 -1 会抹平 Medium/Low 档位）
test("动态档位: 旁路选 gemini-3.8-flash-medium 时 thinkingBudget = 4000", () => {
  try {
    writeState({ last: { uid: "gemini-3.8-flash-medium", ts: Date.now() }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), "/v1internal:streamGenerateContent?alt=sse"));
    assert.equal(out.model, "gemini-3.8-flash-medium");
    assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, 4000);
  } finally { clearState(); }
});

test("动态档位: 旁路选 gemini-3.8-flash-low 时 thinkingBudget = 1000", () => {
  try {
    writeState({ last: { uid: "gemini-3.8-flash-low", ts: Date.now() }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), "/v1internal:streamGenerateContent?alt=sse"));
    assert.equal(out.model, "gemini-3.8-flash-low");
    assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, 1000);
  } finally { clearState(); }
});

test("动态档位: 旁路选 gemini-3.8-flash-high 时 thinkingBudget = -1", () => {
  try {
    writeState({ last: { uid: "gemini-3.8-flash-high", ts: Date.now() }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), "/v1internal:streamGenerateContent?alt=sse"));
    assert.equal(out.model, "gemini-3.8-flash-high");
    assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, -1);
  } finally { clearState(); }
});

test("动态档位: 旁路选 Claude 时 thinkingBudget 仍为 -1（表中无此项，保持既有行为）", () => {
  try {
    writeState({ last: { uid: "claude-opus-5-5-low", ts: Date.now() }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), "/v1internal:streamGenerateContent?alt=sse"));
    assert.equal(out.model, "claude-opus-5-5-low");
    assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, -1);
  } finally { clearState(); }
});

test("动态档位: 默认回退 gemini-3.8-flash-high 时 thinkingBudget = -1", () => {
  clearState();
  const out = parse(compat.rewriteRequestBody(placeholderBody(), null));
  assert.equal(out.model, DEFAULT_TARGET);
  assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, -1);
});

test("动态档位: 无 thinkingConfig 时不抛错（不新增字段）", () => {
  try {
    writeState({ last: { uid: "gemini-3.8-flash-low", ts: Date.now() }, bySid: {} });
    const input = buf({ model: SOURCE_MODEL, request: { generationConfig: { temperature: 0.7 } } });
    const out = parse(compat.rewriteRequestBody(input, null));
    assert.equal(out.model, "gemini-3.8-flash-low");
    assert.equal(out.request.generationConfig.thinkingConfig, undefined);
    assert.equal(out.request.generationConfig.temperature, 0.7);
  } finally { clearState(); }
});

test("推理强度提升: 非主对话请求(lite/标题)不修改 thinkingBudget", () => {
  const input = buf({
    model: "gemini-3.1-flash-lite",
    request: {
      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  });
  const out = compat.rewriteRequestBody(input, null);
  assert.equal(out, input); // 未修改，返回原 Buffer 引用
  assert.equal(parse(out).request.generationConfig.thinkingConfig.thinkingBudget, 0);
});

test("推理强度提升: 主对话无 thinkingConfig 时不报错且 model 仍改写", () => {
  const input = buf({
    model: SOURCE_MODEL,
    request: { generationConfig: { temperature: 0.7 } },
  });
  const out = parse(compat.rewriteRequestBody(input, null));
  assert.equal(out.model, DEFAULT_TARGET);
  assert.equal(out.request.generationConfig.temperature, 0.7);
});

test("推理强度提升: 主对话 request 为 null/缺失时安全回退", () => {
  const input = buf({ model: SOURCE_MODEL });
  const out = parse(compat.rewriteRequestBody(input, null));
  assert.equal(out.model, DEFAULT_TARGET);
});

// v9.9.529+ · renderer 模型选择旁路 (_agReadSelected / __agtarget 落盘)
// 落盘路径已通过顶部 process.env.AG_SELECTED_FILE 重定向到临时目录（不碰真实运行态）
const stateFile = testStateFile;
function writeState(obj) {
  fs.mkdirSync(testStateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(obj));
}
function clearState() {
  try { fs.rmSync(stateFile, { force: true }); } catch {}
}
function placeholderBody(sessionId) {
  const request = { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } };
  if (sessionId) request.sessionId = sessionId;
  return buf({ model: SOURCE_MODEL, request });
}

test("旁路: 新鲜 last 选择 Claude medium 时占位符改写为该 uid", () => {
  try {
    writeState({ last: { uid: "claude-sonnet-5-5-medium", ts: Date.now() }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), "/v1internal:streamGenerateContent?alt=sse"));
    assert.equal(out.model, "claude-sonnet-5-5-medium");
  } finally { clearState(); }
});

test("旁路: bySid 会话记录优先于全局 last", () => {
  try {
    writeState({
      last: { uid: "claude-sonnet-5-5-high", ts: Date.now() },
      bySid: { sessA: { uid: "claude-opus-5-5-low", ts: Date.now() } },
    });
    const out = parse(compat.rewriteRequestBody(placeholderBody("sessA"), null));
    assert.equal(out.model, "claude-opus-5-5-low");
  } finally { clearState(); }
});

test("旁路: sid 无记录时回退全局 last", () => {
  try {
    writeState({
      last: { uid: "claude-opus-5-5-high", ts: Date.now() },
      bySid: { sessA: { uid: "claude-opus-5-5-low", ts: Date.now() } },
    });
    const out = parse(compat.rewriteRequestBody(placeholderBody("sessB"), null));
    assert.equal(out.model, "claude-opus-5-5-high");
  } finally { clearState(); }
});

test("旁路: 超过新鲜窗口(120min)回退默认模型", () => {
  try {
    writeState({ last: { uid: "claude-sonnet-5-5-high", ts: Date.now() - 121 * 60 * 1000 }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), null));
    assert.equal(out.model, DEFAULT_TARGET);
  } finally { clearState(); }
});

test("旁路: 状态文件缺失/损坏时安全回退默认模型", () => {
  clearState();
  const out1 = parse(compat.rewriteRequestBody(placeholderBody(), null));
  assert.equal(out1.model, DEFAULT_TARGET);
  try {
    fs.mkdirSync(testStateDir, { recursive: true });
    fs.writeFileSync(stateFile, "{ not json");
    const out2 = parse(compat.rewriteRequestBody(placeholderBody(), null));
    assert.equal(out2.model, DEFAULT_TARGET);
  } finally { clearState(); }
});

// 2026-10-24 · 补审阅缺口：URL 显式命中档位表时 thinkingBudget 也要按表设置
test("动态档位: URL 显式 gemini-3.8-flash-medium 时 thinkingBudget = 4000", () => {
  clearState();
  const url = "/v1beta/models/gemini-3.8-flash-medium:streamGenerateContent?alt=sse";
  const out = parse(compat.rewriteRequestBody(placeholderBody(), url));
  assert.equal(out.model, "gemini-3.8-flash-medium");
  assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, 4000);
});

test("动态档位: URL 显式 gemini-3.8-flash-low 时 thinkingBudget = 1000", () => {
  clearState();
  const url = "/v1beta/models/gemini-3.8-flash-low:streamGenerateContent?alt=sse";
  const out = parse(compat.rewriteRequestBody(placeholderBody(), url));
  assert.equal(out.model, "gemini-3.8-flash-low");
  assert.equal(out.request.generationConfig.thinkingConfig.thinkingBudget, 1000);
});

// 2026-10-24 · 直测查表函数（已导出），覆盖"表内/表外/无字段"三态
test("动态档位直测: _agApplyThinkingBudget 表内取值正确", () => {
  const mk = () => ({ request: { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } } });
  const cases = [
    ["gemini-3.8-flash-high", -1],
    ["gemini-3.8-flash-medium", 4000],
    ["gemini-3.8-flash-low", 1000],
    ["gemini-3.8-flash-tiered", -1],
  ];
  for (const [uid, expect] of cases) {
    const req = mk();
    assert.equal(compat._agApplyThinkingBudget(req, uid), true);
    assert.equal(req.request.generationConfig.thinkingConfig.thinkingBudget, expect, uid);
  }
});

test("动态档位直测: _agApplyThinkingBudget 表外模型回退 -1", () => {
  const req = { request: { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } } };
  assert.equal(compat._agApplyThinkingBudget(req, "claude-opus-5-5-high"), true);
  assert.equal(req.request.generationConfig.thinkingConfig.thinkingBudget, -1);
  const req2 = { request: { generationConfig: { thinkingConfig: { thinkingBudget: 1024 } } } };
  assert.equal(compat._agApplyThinkingBudget(req2, "some-future-model-x"), true);
  assert.equal(req2.request.generationConfig.thinkingConfig.thinkingBudget, -1);
});

test("动态档位直测: _agApplyThinkingBudget 无 thinkingBudget 字段时不新增且返回 false", () => {
  const req = { request: { generationConfig: { thinkingConfig: {} } } };
  assert.equal(compat._agApplyThinkingBudget(req, "gemini-3.8-flash-low"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(req.request.generationConfig.thinkingConfig, "thinkingBudget"), false);
  // thinkingConfig 缺失
  assert.equal(compat._agApplyThinkingBudget({ request: { generationConfig: {} } }, "gemini-3.8-flash-low"), false);
  // request 缺失
  assert.equal(compat._agApplyThinkingBudget({}, "gemini-3.8-flash-low"), false);
});

test("旁路: URL 显式模型名优先于旁路选择", () => {
  try {
    writeState({ last: { uid: "claude-sonnet-5-5-high", ts: Date.now() }, bySid: {} });
    const url = "/v1beta/models/gemini-4.0-pro:streamGenerateContent?alt=sse";
    const out = parse(compat.rewriteRequestBody(placeholderBody(), url));
    assert.equal(out.model, "gemini-4.0-pro");
  } finally { clearState(); }
});

test("旁路: 未来时间戳(时钟异常/伪造)回退默认模型", () => {
  try {
    writeState({ last: { uid: "claude-sonnet-5-5-high", ts: Date.now() + 60 * 60 * 1000 }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), null));
    assert.equal(out.model, DEFAULT_TARGET);
  } finally { clearState(); }
});

test("旁路: ts 为非数字字符串时安全回退默认模型", () => {
  try {
    writeState({ last: { uid: "claude-sonnet-5-5-high", ts: "not-a-number" }, bySid: {} });
    const out = parse(compat.rewriteRequestBody(placeholderBody(), null));
    assert.equal(out.model, DEFAULT_TARGET);
  } finally { clearState(); }
});


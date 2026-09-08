"use strict";

// v9.9.525 · Gemini 动态模型改写单测 (_ag-gemini37-compat.cjs)
// 覆盖: URL 提取模型名、LS 占位符动态替换、默认回退、非占位符不误伤、健壮性
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

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


"use strict";

// v9.9.507 · Gemini 新模型兼容层单测
//   覆盖: 旧别名→真名改写、幂等、真名/他名不误伤、内部信封嵌套改写、
//         廉价预筛短路、与 SP 简体改写同次 parse 协同 (标题路径回归)
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const sourcePath = path.join(__dirname, "..", "vendor", "bundled-origin", "source.js");
const mod = require(sourcePath);
const t = mod._test;

const ALIAS = "gemini-2.5-pro";
const TARGET = "gemini-3.8-flash-high";

function buf(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8");
}
function parse(b) {
  return JSON.parse(b.toString("utf8"));
}

test("默认兼容表: 2.5-pro → 3.8-flash-high", () => {
  const map = t._loadGeminiModelCompat();
  assert.equal(map[ALIAS], TARGET);
});

test("扁平聊天体: 顶层 model 别名被改写", () => {
  const out = parse(t._rewriteGeminiCompatBody(buf({ model: ALIAS, contents: [] })));
  assert.equal(out.model, TARGET);
});

test("内部信封: request.model 嵌套别名同样被改写", () => {
  const out = parse(
    t._rewriteGeminiCompatBody(buf({ request: { model: ALIAS, contents: [] } })),
  );
  assert.equal(out.request.model, TARGET);
});

test("幂等: 已是真名的请求原样透传(同一 Buffer 引用, 零序列化)", () => {
  const input = buf({ model: TARGET, contents: [] });
  const out = t._rewriteGeminiCompatBody(input);
  assert.equal(out, input, "不含别名时必须短路返回原 Buffer");
  assert.equal(parse(out).model, TARGET);
});

test("不误伤: 其他模型名保持不变", () => {
  const input = buf({ model: "gemini-2.0-flash", contents: [] });
  const out = t._rewriteGeminiCompatBody(input);
  assert.equal(out, input);
  assert.equal(parse(out).model, "gemini-2.0-flash");
});

test("健壮性: 非 Buffer / 过短 / 非法 JSON 不抛错", () => {
  assert.equal(t._rewriteGeminiCompatBody(null), null);
  const tiny = Buffer.from("x");
  assert.equal(t._rewriteGeminiCompatBody(tiny), tiny, "过短 Buffer 原样返回");
  const broken = Buffer.from('{"model":"gemini-2.5-pro", broken');
  const out = t._rewriteGeminiCompatBody(broken);
  assert.equal(out, broken, "非法 JSON 必须原样返回");
});

test("对象级改写函数: 命中返回 true, 未命中 false", () => {
  const a = { model: ALIAS };
  assert.equal(t._rewriteGeminiCompatModel(a), true);
  assert.equal(a.model, TARGET);
  const b = { model: "claude-sonnet-4" };
  assert.equal(t._rewriteGeminiCompatModel(b), false);
  assert.equal(b.model, "claude-sonnet-4");
  assert.equal(t._rewriteGeminiCompatModel(null), false);
});

test("协同回归: 内部标题路径同次 parse 内既升模型又注入简体要求", () => {
  const TITLE_PROMPT =
    "Generate a short conversation title around 3-5 words describing the USER's intent and goals during this chat. " +
    "Should be title-cased, e.g 'Developing a Chess App'. Format as a simple string, not as markdown; and please " +
    'output the title directly, do not prefix it with "Title:" or anything similar.';
  const TITLE_AND_OBJECTIVE_PROMPT =
    TITLE_PROMPT +
    "\n\tThen, in a new line, write the USER's main objective and goals, keeping in mind that their goals may have " +
    "been included in the previous CHECKPOINT summary.\n\tMake sure that this is very action oriented around solving " +
    "the USER's task.\n\t";
  const envelope = {
    request: {
      model: ALIAS,
      systemInstruction: { parts: [{ text: "You summarize coding conversations accurately." }] },
      contents: [
        { role: "user", parts: [{ text: "<USER_REQUEST>分析项目</USER_REQUEST>" }] },
        { role: "user", parts: [{ text: TITLE_AND_OBJECTIVE_PROMPT }] },
      ],
    },
  };
  const out = parse(
    t.modifyGeminiRestSP(
      buf(envelope),
      "/v1internal:streamGenerateContent?alt=sse",
    ),
  );
  // ① 模型升级 (嵌套层)
  assert.equal(out.request.model, TARGET);
  // ② 会话标题简体中文能力不被破坏
  const rewrittenTitle = out.request.contents[1].parts[0].text;
  assert.match(rewrittenTitle, /Simplified Chinese|中文/);
});

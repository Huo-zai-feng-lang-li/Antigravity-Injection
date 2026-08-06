"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const TITLE_PROMPT =
  "Generate a short conversation title around 3-5 words describing the USER's intent and goals during this chat. " +
  "Should be title-cased, e.g 'Developing a Chess App'. Format as a simple string, not as markdown; and please " +
  'output the title directly, do not prefix it with "Title:" or anything similar.';

const TITLE_AND_OBJECTIVE_PROMPT =
  TITLE_PROMPT +
  "\n\tThen, in a new line, write the USER's main objective and goals, keeping in mind that their goals may have " +
  "been included in the previous CHECKPOINT summary.\n\tMake sure that this is very action oriented around solving " +
  "the USER's task.\n\t";

const implementations = [
  ["bundled origin", path.join(__dirname, "..", "vendor", "bundled-origin", "source.js")],
  ["external API", path.join(__dirname, "..", "vendor", "外接api", "core", "sp_invert.js")],
];

const restImplementations = [
  implementations[0],
];

for (const [name, modulePath] of implementations) {
  test(`${name} recognizes the Antigravity title prompt`, () => {
    const implementation = require(modulePath);

    assert.equal(implementation.classifySPType(TITLE_PROMPT), "title");
    assert.match(implementation.invertAnySP(TITLE_PROMPT), /必须使用中文/);
  });
}

for (const [name, modulePath] of restImplementations) {
  test(`${name} rewrites the wrapped live Gemini title instruction`, () => {
    const implementation = require(modulePath);
    const request = {
      request: {
        systemInstruction: { parts: [{ text: "You summarize coding conversations accurately." }] },
        contents: [
          { role: "user", parts: [{ text: "<USER_REQUEST>分析项目提示词</USER_REQUEST>" }] },
          { role: "user", parts: [{ text: TITLE_AND_OBJECTIVE_PROMPT }] },
        ],
      },
    };

    const output = JSON.parse(
      implementation._test
        .modifyGeminiRestSP(
          Buffer.from(JSON.stringify(request)),
          "/v1internal:streamGenerateContent?alt=sse",
        )
        .toString("utf8"),
    );
    const rewritten = output.request.contents[1].parts[0].text;

    assert.match(rewritten, /Simplified Chinese/);
    assert.match(rewritten, /Then, in a new line/);
    assert.equal(
      output.request.systemInstruction.parts[0].text,
      request.request.systemInstruction.parts[0].text,
    );
    assert.doesNotMatch(rewritten, /Should be title-cased/);
  });
}

test.after(() => {
  setTimeout(() => process.exit(0), 100);
});


"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createIdeContextCollector } = require("../ide-context");
const {
  OPEN_MARKER,
  injectGeminiBuffer,
  injectOpenAiMessages,
} = require("../vendor/ide-context-injector");

class TabInputText {
  constructor(uri) {
    this.uri = uri;
  }
}

function uri(fsPath, scheme = "file") {
  return { fsPath, scheme };
}

function position(line, character) {
  return { line, character };
}

function selection(anchor, active) {
  const before = anchor.line < active.line || (anchor.line === active.line && anchor.character <= active.character);
  return {
    anchor,
    active,
    start: before ? anchor : active,
    end: before ? active : anchor,
    isEmpty: anchor.line === active.line && anchor.character === active.character,
  };
}

function mockVscode({ activeTextEditor, tabs = [] } = {}) {
  const event = () => ({ dispose() {} });
  return {
    TabInputText,
    window: {
      activeTextEditor,
      tabGroups: {
        all: [{ tabs: tabs.map((input) => ({ input })) }],
        onDidChangeTabs: event,
        onDidChangeTabGroups: event,
      },
      onDidChangeActiveTextEditor: event,
      onDidChangeTextEditorSelection: event,
    },
  };
}

function editor(text, file, currentSelection) {
  const lines = text.split("\n");
  const offsetAt = ({ line, character }) => {
    let offset = 0;
    for (let index = 0; index < line; index += 1) offset += lines[index].length + 1;
    return offset + character;
  };
  const document = {
    uri: uri(file),
    offsetAt,
    getText: ({ start, end }) => text.slice(offsetAt(start), offsetAt(end)),
  };
  return { document, selection: currentSelection };
}

test("collector returns open files without an active editor", () => {
  const vscode = mockVscode({ tabs: [new TabInputText(uri("C:\\P\\a.ts"))] });
  const snapshot = createIdeContextCollector(vscode).getSnapshot();
  assert.deepEqual(snapshot, {
    version: 1,
    activeFile: null,
    openFiles: ["C:\\P\\a.ts"],
    cursor: null,
    selection: null,
  });
});

test("collector uses cursor active, document-order selection, UTF-16 offsets, and full text", () => {
  const text = "甲😀乙\n完整<xml>\"选中\"文本";
  const chosen = selection(position(1, 13), position(0, 1));
  const activeTextEditor = editor(text, "C:\\P\\main.ts", chosen);
  const tabs = [
    new TabInputText(uri("C:\\P\\MAIN.ts")),
    new TabInputText(uri("C:\\P\\utils.ts")),
    new TabInputText(uri("untitled", "untitled")),
    "webview",
  ];
  const snapshot = createIdeContextCollector(mockVscode({ activeTextEditor, tabs })).getSnapshot();
  assert.equal(snapshot.activeFile, "C:\\P\\main.ts");
  assert.deepEqual(snapshot.openFiles, ["C:\\P\\MAIN.ts", "C:\\P\\utils.ts"]);
  assert.deepEqual(snapshot.cursor, { line: 1, column: 2, offset: 1 });
  assert.equal(snapshot.selection.text, text.slice(1));
  assert.deepEqual(snapshot.selection.start, { line: 1, column: 2, offset: 1 });
  assert.deepEqual(snapshot.selection.end, { line: 2, column: 14, offset: text.length });
});

test("collector emits an empty selection at the cursor", () => {
  const caret = position(0, 3);
  const activeTextEditor = editor("a😀b", "C:\\P\\emoji.ts", selection(caret, caret));
  const snapshot = createIdeContextCollector(mockVscode({ activeTextEditor })).getSnapshot();
  assert.equal(snapshot.cursor.offset, 3);
  assert.deepEqual(snapshot.selection, {
    text: "",
    start: { line: 1, column: 4, offset: 3 },
    end: { line: 1, column: 4, offset: 3 },
  });
});

const snapshot = {
  version: 1,
  activeFile: "C:\\P\\main.ts",
  openFiles: ["C:\\P\\main.ts", "C:\\P\\other.ts"],
  cursor: { line: 2, column: 3, offset: 7 },
  selection: {
    text: "\"完整\"\n<DAO_IDE_CONTEXT_V1_TEST>中文" + "x".repeat(10000),
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 2, column: 3, offset: 7 },
  },
};

test("Gemini appends once to the last user existing text part without truncation", () => {
  const input = Buffer.from(JSON.stringify({
    contents: [
      { role: "user", parts: [{ text: "old" }] },
      { role: "model", parts: [{ text: "answer" }] },
      { role: "user", parts: [{ inlineData: {} }, { text: "latest" }] },
    ],
  }));
  const first = injectGeminiBuffer(input, snapshot);
  assert.equal(first.injected, true);
  const parsed = JSON.parse(first.body.toString("utf8"));
  const text = parsed.contents[2].parts[1].text;
  assert.ok(text.startsWith("latest\n\n" + OPEN_MARKER));
  assert.ok(text.includes("x".repeat(10000)));
  const second = injectGeminiBuffer(first.body, snapshot);
  assert.equal(second.injected, false);
  assert.deepEqual(second.body, first.body);
});

test("Gemini finds an internal request wrapper without adding private fields", () => {
  const input = Buffer.from(JSON.stringify({ request: { contents: [{ role: "user", parts: [{ text: "wrapped" }] }] } }));
  const result = injectGeminiBuffer(input, snapshot);
  const parsed = JSON.parse(result.body.toString("utf8"));
  assert.equal(result.injected, true);
  assert.ok(parsed.request.contents[0].parts[0].text.includes(OPEN_MARKER));
  assert.deepEqual(Object.keys(parsed), ["request"]);
});

test("Gemini fails open byte-for-byte for unsafe structures", () => {
  for (const input of [Buffer.from("not-json"), Buffer.from('{"contents":[]}'), Buffer.from('{"contents":[{"role":"user","parts":[{}]}]}')]) {
    const result = injectGeminiBuffer(input, snapshot);
    assert.equal(result.injected, false);
    assert.deepEqual(result.body, input);
  }
});

test("Gemini does not duplicate a marker already present elsewhere in the request", () => {
  const input = Buffer.from(JSON.stringify({
    contents: [
      { role: "user", parts: [{ text: `old\n${OPEN_MARKER}` }] },
      { role: "user", parts: [{ text: "latest" }] },
    ],
  }));
  const result = injectGeminiBuffer(input, snapshot);
  assert.equal(result.injected, false);
  assert.deepEqual(result.body, input);
});

test("OpenAI messages append to last user string or last existing text part and dedupe", () => {
  const messages = [
    { role: "user", content: "old" },
    { role: "assistant", content: "answer" },
    { role: "user", content: [{ type: "image_url", image_url: {} }, { type: "text", text: "latest" }] },
  ];
  assert.equal(injectOpenAiMessages(messages, snapshot).injected, true);
  assert.ok(messages[2].content[1].text.includes(OPEN_MARKER));
  assert.ok(messages[2].content[1].text.includes("x".repeat(10000)));
  assert.equal(injectOpenAiMessages(messages, snapshot).injected, false);
});

test("OpenAI messages do not duplicate a marker in an earlier content part", () => {
  const messages = [{ role: "user", content: [
    { type: "text", text: `earlier\n${OPEN_MARKER}` },
    { type: "text", text: "latest" },
  ] }];
  assert.equal(injectOpenAiMessages(messages, snapshot).injected, false);
  assert.equal(messages[0].content[1].text, "latest");
});

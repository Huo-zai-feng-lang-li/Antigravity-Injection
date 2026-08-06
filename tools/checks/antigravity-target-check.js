#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function readVsixEntry(rel, entryName) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${rel}: invalid zip, EOCD not found`);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  const end = centralOffset + centralSize;
  for (let p = centralOffset; p < end;) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`${rel}: invalid central directory at ${p}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === entryName) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`${rel}: invalid local header for ${entryName}`);
      }
      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const data = buf.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      throw new Error(`${rel}: unsupported zip method ${method} for ${entryName}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${rel}: missing ${entryName}`);
}

function assertIncludes(file, text, label) {
  const body = read(file);
  if (!body.includes(text)) {
    throw new Error(`${label}: missing ${JSON.stringify(text)} in ${file}`);
  }
}

function assertNotIncludes(file, text, label) {
  const body = read(file);
  if (body.includes(text)) {
    throw new Error(`${label}: unexpected ${JSON.stringify(text)} in ${file}`);
  }
}

function assertAnyIncludes(file, texts, label) {
  const body = read(file);
  if (!texts.some((text) => body.includes(text))) {
    throw new Error(
      `${label}: missing any of ${texts.map((text) => JSON.stringify(text)).join(", ")} in ${file}`,
    );
  }
}

function assertRegex(file, regex, label) {
  const body = read(file);
  if (!regex.test(body)) {
    throw new Error(`${label}: missing ${regex} in ${file}`);
  }
}

function assertNoUndeclaredOs(file) {
  const body = read(file);
  if (!/\bos\./.test(body)) return;
  if (!/require\((["'])node:os\1\)|require\((["'])os\2\)/.test(body)) {
    throw new Error(`os import: ${file} uses the os namespace without requiring it`);
  }
}

function assertPackageVersion(file, expected) {
  const pkg = JSON.parse(read(file));
  if (pkg.version !== expected) {
    throw new Error(`${file}: expected version ${expected}, got ${pkg.version}`);
  }
}

function assertVsixEntryEqualsSource(vsixRel, entryName, sourceRel) {
  const packed = readVsixEntry(vsixRel, entryName);
  const source = read(sourceRel);
  if (packed !== source) {
    throw new Error(`${vsixRel}:${entryName} is stale; rebuild from ${sourceRel}`);
  }
}

function functionSource(file, name) {
  const body = read(file);
  const start = body.indexOf(`function ${name}`);
  if (start < 0) {
    throw new Error(`${name}: missing function in ${file}`);
  }
  const brace = body.indexOf("{", start);
  let depth = 0;
  let end = -1;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let templateExprDepth = 0;
  for (let i = brace; i < body.length; i++) {
    const ch = body[i];
    const nx = body[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && nx === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (quote === "`" && ch === "$" && nx === "{") {
        templateExprDepth++;
        depth++;
        i++;
        continue;
      }
      if (quote === "`" && ch === "}" && templateExprDepth > 0) {
        templateExprDepth--;
        depth--;
        continue;
      }
      if (ch === quote && templateExprDepth === 0) quote = null;
      continue;
    }
    if (ch === "/" && nx === "/") {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && nx === "*") {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error(`${name}: unterminated function in ${file}`);
  }
  return body.slice(start, end);
}

function assertFunctionBody(file, name, checks) {
  const fn = functionSource(file, name);
  for (const [label, predicate] of Object.entries(checks)) {
    if (!predicate(fn)) {
      throw new Error(`${name}: ${label} failed in ${file}`);
    }
  }
}

function functionRangeSource(file, firstName, lastName) {
  const body = read(file);
  const start = body.indexOf(`function ${firstName}`);
  if (start < 0) throw new Error(`${firstName}: missing function in ${file}`);
  const lastStart = body.indexOf(`function ${lastName}`, start);
  if (lastStart < 0) throw new Error(`${lastName}: missing function in ${file}`);
  const last = functionSource(file, lastName);
  return body.slice(start, lastStart + last.length);
}

function assertEndpointRewriteRuntime(file) {
  const sandbox = {
    module: { exports: {} },
    L: { info() {} },
    _cachedProxyUrl: "http://127.0.0.1:8889",
    _proxyHealthy: true,
    _lsSpawnSeen: false,
    _lsRewroteCount: 0,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      functionSource(file, "rewriteLsEndpointArg"),
      functionSource(file, "maybeRewriteLsArgs"),
      "module.exports = { maybeRewriteLsArgs };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const proxy = sandbox._cachedProxyUrl;
  const cases = [
    {
      name: "split cloud_code_endpoint",
      args: ["--cloud_code_endpoint", "https://daily-cloudcode-pa.googleapis.com"],
      expect: ["--cloud_code_endpoint", proxy],
    },
    {
      name: "equals cloud_code_endpoint",
      args: ["--cloud_code_endpoint=https://daily-cloudcode-pa.googleapis.com"],
      expect: [`--cloud_code_endpoint=${proxy}`],
    },
    {
      name: "legacy codeium endpoints",
      args: [
        "--api_server_url",
        "https://server.codeium.com",
        "--inference_api_server_url=https://inference.codeium.com",
      ],
      expect: [
        "--api_server_url",
        proxy,
        `--inference_api_server_url=${proxy}`,
      ],
    },
  ];
  for (const c of cases) {
    const actual = [...c.args];
    const changed = sandbox.module.exports.maybeRewriteLsArgs(
      "language_server_windows_x64.exe",
      actual,
    );
    if (!changed) throw new Error(`${file}: ${c.name} did not report rewrite`);
    if (JSON.stringify(actual) !== JSON.stringify(c.expect)) {
      throw new Error(
        `${file}: ${c.name} expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
}

function assertSelfUninstallRuntime(file) {
  const selfDir = "zk-agi.zk-proxy-pro-9.9.335";
  const extensionPath = `C:\\extensions\\${selfDir}`;
  const obsoletePath = "C:\\extensions\\.obsolete";
  const cases = [
    {
      name: "current directory obsolete",
      obsolete: { [selfDir]: true },
      registered: true,
      expected: true,
    },
    {
      name: "old version obsolete while current registered",
      obsolete: { "zk-agi.zk-proxy-pro-9.9.334": true },
      registered: true,
      expected: false,
    },
    {
      name: "current directory active and registered",
      obsolete: {},
      registered: true,
      expected: false,
    },
    {
      name: "current extension unregistered",
      obsolete: {},
      registered: false,
      expected: true,
    },
  ];

  for (const c of cases) {
    const sandbox = {
      module: { exports: {} },
      _extContext: { extensionPath },
      SELF_EXT_ID: "zk-agi.zk-proxy-pro",
      SELF_EXT_DIR_REGEX: /^zk-agi\.zk-proxy-pro-/,
      fs: {
        existsSync(p) {
          return p === obsoletePath;
        },
        readFileSync(p) {
          if (p !== obsoletePath) throw new Error(`unexpected read: ${p}`);
          return JSON.stringify(c.obsolete);
        },
      },
      path: path.win32,
      vscode: {
        extensions: {
          getExtension(id) {
            if (id !== "zk-agi.zk-proxy-pro") {
              throw new Error(`unexpected extension id: ${id}`);
            }
            return c.registered ? {} : undefined;
          },
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(
      [
        functionSource(file, "_isSelfUninstalling"),
        "module.exports = { _isSelfUninstalling };",
      ].join("\n"),
      sandbox,
      { filename: file },
    );
    const actual = sandbox.module.exports._isSelfUninstalling();
    if (actual !== c.expected) {
      throw new Error(
        `${file}: ${c.name} expected ${c.expected}, got ${actual}`,
      );
    }
  }
}

function assertSettingsJsoncRuntime(file) {
  const mem = new Map();
  const fp = "C:\\Users\\Administrator\\AppData\\Roaming\\Antigravity\\User\\settings.json";
  mem.set(
    fp,
    [
      "{",
      '  "files.autoSave": "afterDelay",',
      "  // Antigravity keeps user comments in settings.json",
      '  "http.proxy": "http://127.0.0.1:51081",',
      "  /* block comment must survive */",
      '  "json.schemas": []',
      "}",
      "",
    ].join("\n"),
  );
  const sandbox = {
    module: { exports: {} },
    L: { warn() {} },
    fs: {
      readFileSync(p) {
        if (!mem.has(p)) {
          const err = new Error("ENOENT");
          err.code = "ENOENT";
          throw err;
        }
        return mem.get(p);
      },
      writeFileSync(p, body) {
        mem.set(p, body);
      },
      mkdirSync() {},
    },
    path: {
      dirname() {
        return "C:\\Users\\Administrator\\AppData\\Roaming\\Antigravity\\User";
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      functionRangeSource(file, "_stripJsoncForParse", "_writeSettingsJson"),
      "module.exports = { _readSettingsJson, _writeSettingsJson };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const json = sandbox.module.exports._readSettingsJson(fp);
  if (!json || json["http.proxy"] !== "http://127.0.0.1:51081") {
    throw new Error(`${file}: failed to read commented Antigravity settings.json`);
  }
  json["codeium.apiServerUrl"] = "http://127.0.0.1:8937";
  json["codeium.inferenceApiServerUrl"] = "http://127.0.0.1:8937";
  if (!sandbox.module.exports._writeSettingsJson(fp, json)) {
    throw new Error(`${file}: failed to write commented Antigravity settings.json`);
  }
  const out = mem.get(fp);
  for (const text of [
    "// Antigravity keeps user comments in settings.json",
    "/* block comment must survive */",
    '"codeium.apiServerUrl": "http://127.0.0.1:8937"',
    '"codeium.inferenceApiServerUrl": "http://127.0.0.1:8937"',
  ]) {
    if (!out.includes(text)) {
      throw new Error(`${file}: JSONC settings write lost ${JSON.stringify(text)}`);
    }
  }
}

function assertRouteUpstreamRuntime(file) {
  const sandbox = {
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      'const TARGET_IDE = "Antigravity";',
      'const UPSTREAM_MGMT = "server.self-serve.windsurf.com";',
      'const UPSTREAM_INFER = "inference.codeium.com";',
      'const UPSTREAM_API = "daily-cloudcode-pa.googleapis.com";',
      'const UPSTREAM_CHAT = "";',
      'const API_SERVER_SERVICES = new Set(["exa.api_server_pb.ApiServerService", "exa.language_server_pb.LanguageServerService"]);',
      'const INFERENCE_SERVICES = new Set(["exa.language_server_pb.LanguageServerService", "exa.chat_web.ChatWebService", "exa.codeium_common_pb.CascadeService", "exa.codeium_common_pb.AutocompleteService", "exa.codeium_common_pb.CodeiumService", "exa.api_server_pb.ApiServerService"]);',
      functionSource(file, "routeUpstream"),
      "module.exports = { routeUpstream };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const cases = [
    {
      path: "/v1internal:fetchUserInfo",
      host: "daily-cloudcode-pa.googleapis.com",
    },
    {
      path: "/v1:loadCodeAssist",
      host: "daily-cloudcode-pa.googleapis.com",
    },
    {
      path: "/exa.api_server_pb.ApiServerService/GetChatMessage",
      host: "daily-cloudcode-pa.googleapis.com",
    },
  ];
  for (const c of cases) {
    const got = sandbox.module.exports.routeUpstream(c.path);
    if (!got || got.host !== c.host || got.path !== c.path) {
      throw new Error(
        `${file}: routeUpstream(${c.path}) expected ${c.host}, got ${JSON.stringify(got)}`,
      );
    }
  }
}

function assertGeminiRestPromptRuntime(file) {
  const sandbox = {
    module: { exports: {} },
    Buffer,
    JSON,
    Set,
    String,
    RegExp,
    Object,
    Array,
    Number,
    Date,
    log() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      'const TARGET_IDE = "Antigravity";',
      'const API_SERVER_SERVICES = new Set(["exa.api_server_pb.ApiServerService", "exa.language_server_pb.LanguageServerService"]);',
      'const INFERENCE_SERVICES = new Set(["exa.language_server_pb.LanguageServerService", "exa.chat_web.ChatWebService", "exa.codeium_common_pb.CascadeService", "exa.codeium_common_pb.AutocompleteService", "exa.codeium_common_pb.CodeiumService", "exa.api_server_pb.ApiServerService"]);',
      'const _activeCanon = "check-canon";',
      'const _activeCanonText = "DEFAULT_ANTIGRAVITY_ZK_PROMPT";',
      'const TAO_FOOTER = "\\nDEFAULT_FOOTER";',
      'const SP_MODE = "invert";',
      "let _customSP = null;",
      "function _canonHeader(name) { return `HEADER:${name}\\n`; }",
      "function invertSP(text) { return String(text).includes('OFFICIAL_ANTIGRAVITY_SP') ? `INVERTED:${text}` : null; }",
      "function looksLikeSPShape(text) { return String(text).includes('OFFICIAL_ANTIGRAVITY_SP'); }",
      "function classifySPType(text) { return String(text).includes('OFFICIAL_ANTIGRAVITY_SP') ? 'sp_role' : null; }",
      functionRangeSource(file, "isGeminiRestGeneratePath", "modifyGeminiRestSP"),
      functionSource(file, "_observeGeminiRestSP"),
      functionSource(file, "observeSPFromBody"),
      functionSource(file, "classifyRPC"),
      "module.exports = { isGeminiRestGeneratePath, modifyGeminiRestSP, observeSPFromBody, classifyRPC };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const api = sandbox.module.exports;
  const streamPath = "/v1internal:streamGenerateContent?alt=sse";
  if (!api.isGeminiRestGeneratePath(streamPath)) {
    throw new Error(`${file}: streamGenerateContent was not recognized as Gemini REST`);
  }
  if (api.classifyRPC(streamPath) !== "GEMINI_REST_CHAT") {
    throw new Error(`${file}: streamGenerateContent was not classified as GEMINI_REST_CHAT`);
  }
  const assertNoRejectedTopLevel = (value, label) => {
    for (const key of ["contents", "systemInstruction", "system_instruction"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error(`${file}: ${label} emitted rejected top-level ${key}`);
      }
    }
  };
  const internalReq = {
    model: "gemini-3-1-pro-high",
    request: {
      text: "hello",
    },
  };
  const internalBody = Buffer.from(JSON.stringify(internalReq));
  const internalOut = JSON.parse(api.modifyGeminiRestSP(internalBody, streamPath).toString("utf8"));
  assertNoRejectedTopLevel(internalOut, "Gemini REST internal passthrough");
  if (JSON.stringify(internalOut) !== JSON.stringify(internalReq)) {
    throw new Error(`${file}: Gemini REST internal private payload was mutated`);
  }
  const internalNestedReq = {
    model: "gemini-3-1-pro-high",
    request: {
      systemInstruction: {
        parts: [{ text: "OFFICIAL_ANTIGRAVITY_SP internal nested" }],
      },
      text: "hello",
    },
  };
  const internalNestedOut = JSON.parse(
    api.modifyGeminiRestSP(Buffer.from(JSON.stringify(internalNestedReq)), streamPath).toString("utf8"),
  );
  assertNoRejectedTopLevel(internalNestedOut, "Gemini REST internal nested");
  if (internalNestedOut.request.text !== "hello") {
    throw new Error(`${file}: Gemini REST internal user payload was mutated`);
  }
  const internalNestedText = internalNestedOut.request.systemInstruction.parts[0].text;
  if (!internalNestedText.startsWith("INVERTED:OFFICIAL_ANTIGRAVITY_SP")) {
    throw new Error(`${file}: Gemini REST internal nested systemInstruction was not inverted`);
  }
  const internalObserved = api.observeSPFromBody(
    Buffer.from(JSON.stringify(internalNestedReq)),
    "GEMINI_REST_CHAT",
  );
  if (!internalObserved || internalObserved.field !== "request.systemInstruction.parts") {
    throw new Error(`${file}: Gemini REST internal nested systemInstruction was not observable`);
  }

  const req = {
    systemInstruction: {
      parts: [{ text: "OFFICIAL_ANTIGRAVITY_SP\nkeep tool rules" }],
    },
    contents: [{ role: "user", parts: [{ text: "hello" }] }],
  };
  const body = Buffer.from(JSON.stringify(req));
  const publicPath = "/v1:streamGenerateContent?alt=sse";
  const out = JSON.parse(api.modifyGeminiRestSP(body, publicPath).toString("utf8"));
  const text = out.systemInstruction.parts[0].text;
  if (!text.startsWith("INVERTED:OFFICIAL_ANTIGRAVITY_SP")) {
    throw new Error(`${file}: Gemini REST public systemInstruction was not inverted`);
  }
  if (out.contents[0].parts[0].text !== "hello") {
    throw new Error(`${file}: Gemini REST public user contents were mutated`);
  }
  const observed = api.observeSPFromBody(body, "GEMINI_REST_CHAT");
  if (!observed || observed.variant !== "gemini_system_instruction") {
    throw new Error(`${file}: Gemini REST systemInstruction was not observable`);
  }
  const created = JSON.parse(
    api
      .modifyGeminiRestSP(
        Buffer.from(JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hello" }] }] })),
        publicPath,
      )
      .toString("utf8"),
  );
  const createdText = created.systemInstruction.parts[0].text;
  if (!createdText.includes("DEFAULT_ANTIGRAVITY_ZK_PROMPT")) {
    throw new Error(`${file}: Gemini REST public missing prompt did not inject default`);
  }
  const snake = JSON.parse(
    api
      .modifyGeminiRestSP(
        Buffer.from(
          JSON.stringify({
            system_instruction: { parts: { text: "OFFICIAL_ANTIGRAVITY_SP snake" } },
            contents: { role: "user", parts: { text: "hello" } },
          }),
        ),
        publicPath,
      )
      .toString("utf8"),
  );
  if (Object.prototype.hasOwnProperty.call(snake, "system_instruction")) {
    throw new Error(`${file}: Gemini REST public emitted snake_case system_instruction`);
  }
  if (!snake.systemInstruction.parts[0].text.startsWith("INVERTED:OFFICIAL_ANTIGRAVITY_SP")) {
    throw new Error(`${file}: Gemini REST public snake_case prompt was not inverted`);
  }
}

function assertKeepBlocksRuntime(file) {
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      'const KEEP_BLOCKS = ["tool_calling", "mcp_servers", "user_information", "workspace_information", "conversation_summary"];',
      "function neutralizeBlock(x) { return x; }",
      "function trimWorkspaceInfo(x) { return x; }",
      "function trimUserInfo(x) { return x; }",
      functionSource(file, "extractKeepBlocks"),
      "module.exports = { extractKeepBlocks };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const original = [
    "<tool_calling>",
    "Tools are grouped by namespace where each namespace has one or more tools defined.",
    "Call tools as you normally would. Valid channels: analysis, commentary.",
    "Absolute paths must be used for local file links.",
    "</tool_calling>",
    "<mcp_servers>",
    "Use the browser and shell tools according to their descriptions.",
    "</mcp_servers>",
    "<user_information>",
    "OS: Windows",
    "Your recent terminal commands:",
    "git status",
    "</user_information>",
    "<workspace_information>",
    "<workspace_layout>",
    "- plugins/",
    "  - zk-proxy-pro/",
    "- README.md",
    "</workspace_layout>",
    "</workspace_information>",
    "<conversation_summary>用户正在验证 Antigravity 提示词反代。</conversation_summary>",
  ].join("\n");
  const kept = sandbox.module.exports.extractKeepBlocks(original);
  if (kept !== "") {
    throw new Error(`${file}: extractKeepBlocks should be disabled, got ${kept.length} chars`);
  }
  assertFunctionBody(file, "invertSP", {
    "does not append keep or realtime modules": (fn) =>
      !/extractKeepBlocks\s*\(/.test(fn) &&
      !/extractRealtimeBlocks\s*\(/.test(fn),
  });
  assertFunctionBody(file, "invertAnySP", {
    "does not append keep or realtime modules": (fn) =>
      !/extractKeepBlocks\s*\(/.test(fn) &&
      !/extractRealtimeBlocks\s*\(/.test(fn),
  });
}

function assertCustomPromptPersistenceRuntime(file) {
  const writes = new Map();
  const customFile = "C:\\Users\\Administrator\\.codeium\\zk\\ide_prompt.json";
  const sandbox = {
    module: { exports: {} },
    __dirname: "C:\\Users\\Administrator\\.antigravity\\extensions\\zk-agi.zk-proxy-test\\vendor\\bundled-origin",
    process: { env: { ZK_CUSTOM_SP_FILE: customFile } },
    os: { homedir: () => "C:\\Users\\Administrator" },
    path,
    fs: {
      existsSync(p) {
        return writes.has(p);
      },
      mkdirSync() {},
      writeFileSync(p, body) {
        writes.set(p, String(body));
      },
      unlinkSync(p) {
        writes.delete(p);
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      'const _LEGACY_CUSTOM_SP_FILE = path.join(__dirname, "_custom_sp.json");',
      functionSource(file, "_zkDataDir"),
      functionSource(file, "_customSpFile"),
      "const _CUSTOM_SP_FILE = _customSpFile();",
      'let _customSP = { sp: "反重力提示词反代测试", keep_blocks: false, source: "check", ide: "Antigravity", at: 1 };',
      functionSource(file, "_saveCustomSP"),
      "_saveCustomSP();",
      "module.exports = { file: _CUSTOM_SP_FILE };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  const raw = writes.get(customFile);
  if (!raw) throw new Error(`${file}: _saveCustomSP did not write ${customFile}`);
  const saved = JSON.parse(raw);
  if (saved.sp !== "反重力提示词反代测试" || saved.ide !== "Antigravity") {
    throw new Error(`${file}: saved custom prompt payload is wrong`);
  }
}

function assertBundledCustomPromptRuntime(file) {
  const rulesFile = path.join(
    ROOT,
    "plugins/zk-proxy-pro/vendor/bundled-origin/_antigravity_rules.txt",
  );
  const expected = fs.readFileSync(rulesFile, "utf8");
  if (!expected.trim()) throw new Error(`${rulesFile}: custom prompt is empty`);
  const sandbox = {
    module: { exports: {} },
    __dirname: path.dirname(rulesFile),
    fs,
    path,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      functionSource(file, "_bundledCustomSpFile"),
      "const _BUNDLED_CUSTOM_SP_FILE = _bundledCustomSpFile();",
      functionSource(file, "_loadBundledCustomSP"),
      "const _bundledCustomSP = _loadBundledCustomSP();",
      "let _customSP = null;",
      functionSource(file, "_effectiveCustomSP"),
      'const SP_MODE = "custom";',
      "const _spInvertLib = { isAlreadyInverted: () => false, isLikelyOfficialSP: (text) => text === 'OFFICIAL' };",
      "function log() {}",
      functionSource(file, "invertSP"),
      "const fallback = _effectiveCustomSP();",
      'let override = "";',
      '_customSP = { sp: "OVERRIDE" };',
      "override = _effectiveCustomSP();",
      "_customSP = null;",
      'const injected = invertSP("OFFICIAL");',
      'const rejected = invertSP("USER");',
      "module.exports = { fallback, override, injected, rejected };",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  if (sandbox.module.exports.fallback !== expected) {
    throw new Error(`${file}: bundled custom prompt does not match ${rulesFile}`);
  }
  if (sandbox.module.exports.override !== "OVERRIDE") {
    throw new Error(`${file}: saved custom prompt does not override bundled default`);
  }
  if (sandbox.module.exports.injected !== expected || sandbox.module.exports.rejected !== null) {
    throw new Error(`${file}: custom mode did not replace only the official prompt with bundled rules`);
  }
}

function assertLsMainBridgePortRuntime(file) {
  const writes = new Map();
  const sandbox = {
    module: { exports: {} },
    fs: {
      mkdirSync() {},
      writeFileSync(target, value) {
        writes.set(path.normalize(target), JSON.parse(value));
      },
    },
    os: {
      homedir: () => path.join("C:", "Users", "bridge-test"),
      userInfo: () => ({ username: "bridge-test" }),
    },
    path,
    process: { pid: 1234 },
    PKG_VERSION: "9.9.501",
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      functionSource(file, "_publishPort"),
      "_publishPort(8937);",
    ].join("\n"),
    sandbox,
    { filename: file },
  );
  for (const stateDir of [".zk", ".dao"]) {
    const target = path.normalize(
      path.join("C:", "Users", "bridge-test", stateDir, "origin-port.json"),
    );
    const state = writes.get(target);
    if (!state || state.port !== 8937) {
      throw new Error(`${file}: LS Main bridge port was not published to ${target}`);
    }
  }
}

function assertLiveOfficialPromptPreview(file) {
  assertIncludes(file, "let _liveInjectAt = 0;", "live official prompt marker");
  assertIncludes(file, "function _hasLiveInject()", "live official prompt guard");
  assertFunctionBody(file, "_recordInject", {
    "marks prompt capture as live": (fn) => fn.includes("_liveInjectAt = now;"),
  });
  assertFunctionBody(file, "handleControl", {
    "preview hides disk cached prompt before first live request": (fn) =>
      fn.includes("const previewInject = _hasLiveInject() ? _lastInject : null;") &&
      fn.includes('source: hasBefore ? "captured" : "awaiting_first_request"'),
    "sig ignores disk cached prompt before first live request": (fn) =>
      fn.includes("const sigInject = _hasLiveInject() ? _lastInject : null;"),
  });
}

const extensionFiles = [
  "plugins/zk-proxy-pro/extension.js",
];

for (const file of extensionFiles) {
  assertNoUndeclaredOs(file);
  assertIncludes(file, '"Antigravity"', "Antigravity settings candidate");
  assertIncludes(file, "Antigravity.exe", "Antigravity executable candidate");
  assertIncludes(file, "--remote-debugging-port=9000", "Antigravity CDP launch hint");
  assertIncludes(file, "--cloud_code_endpoint", "Antigravity Cloud Code endpoint flag");
  assertRegex(file, /const\s+TARGET_IDE\s*=\s*"Antigravity"/, "target IDE constant");
  assertRegex(
    file,
    /const\s+TARGET_IDE_WINDOWS_EXECUTABLE\s*=\s*"Antigravity\.exe"/,
    "exact Antigravity executable target",
  );
  assertRegex(
    file,
    /const\s+TARGET_IDE_SETTINGS_NAMES\s*=\s*\[\s*"Antigravity"\s*\]/,
    "target IDE settings names",
  );
  assertIncludes(file, "/origin/custom_sp", "custom prompt endpoint");
  assertIncludes(file, '[".zk", ".dao"]', "LS Main bridge compatibility port");
  assertIncludes(file, "提示词", "short prompt UI wording");
  assertIncludes(file, "输入自定义提示词", "short custom prompt placeholder");
  assertIncludes(file, "\\u5df2\\u4fdd\\u5b58", "short save status");
  assertNotIncludes(file, 'id="btnZk"', "zk mode button removed");
  assertNotIncludes(file, 'id="canonSelect"', "canon dropdown removed");
  assertNotIncludes(file, 'id="editReload"', "load current prompt button removed");
  assertNotIncludes(file, 'id="editReset"', "reset to zk button removed");
  assertNotIncludes(file, "自定义 IDE 模型提示词", "long custom prompt wording removed");
  assertNotIncludes(file, "Antigravity 系统提示词反代", "long prompt proxy title removed");
  assertNotIncludes(file, "保存后下次 chat 生效", "long prompt helper removed");
  assertNotIncludes(file, "\\u6ce8\\u5165", "inject wording removed from webview");
  assertNotIncludes(file, "\\u8f7d</button>", "load button wording removed from webview");
  assertNotIncludes(file, "\\u5f52\\u9053", "return-to-zk wording removed from webview");
  assertNotIncludes(file, "canon_name", "canon name hidden from webview status");
  assertNotIncludes(file, "default_source_name", "default source name hidden from webview status");
  assertNotIncludes(file, "tao_header_chars", "tao header count hidden from webview status");
  assertNotIncludes(file, "本源体", "old essence wording removed from UI");
  assertNotIncludes(file, "默认ZK路径", "old zk default wording removed from UI");
  assertNotIncludes(file, "帛书头", "scripture header wording removed from UI");
  if (file.includes("zk-proxy-pro")) {
    assertIncludes(file, "function setActiveTab(tab)", "pro official/edit tab single active state");
    assertNotIncludes(file, 'id="editSave"', "pro manual save button removed");
    assertNotIncludes(file, 'id="e1Save"', "pro config panel manual save button removed");
    assertNotIncludes(file, "请先保存", "pro edit tab never blocks switching for manual save");
    assertFunctionBody(file, "getEaConfigHtml", {
      "pro config panel autosaves changed content": (fn) =>
        fn.includes("function _e1ScheduleSave()") &&
        fn.includes("function _e1FlushSave()") &&
        fn.includes("fPost('/origin/custom_sp', { sp: tx.value, source: 'webview-e1' })"),
      "pro config panel never blocks tab switching for manual save": (fn) =>
        !fn.includes("请先保存"),
    });
  }
  assertFunctionBody(file, "getEssenceHtml", {
    "official tab does not render edit fallback as captured prompt": (fn) =>
      !fn.includes("$sp.textContent = _cc.default_sp"),
    "edit fallback stays scoped to edit mode": (fn) =>
      fn.includes("if (!_cc.has_custom && editMode && _cc.default_sp)"),
    "defaults to edit tab on boot": (fn) =>
      (fn.includes("openEditMode(false);") || fn.includes("openEditMode(false, false);")) &&
      fn.includes("vsc.postMessage({ command: 'getCustomSP' });"),
    "tracks edit baseline for dirty save state": (fn) =>
      fn.includes("var editBaseText = '';") &&
      fn.includes("function setEditBaseText(text)") &&
      fn.includes("function isEditDirty()"),
    "clean edit state can switch to official without saving": (fn) =>
      fn.includes("if (!isEditDirty()) _closeEditMode();") ||
      fn.includes("closeEditMode();"),
    "save ignores unchanged content": (fn) =>
      file.includes("zk-proxy-pro")
        ? fn.includes("if (!isEditDirty()) return;")
        : fn.includes("if (!isEditDirty()) { $editStatus.textContent = '\\u672a\\u4fee\\u6539'; return; }"),
    "background mode refresh does not override edit tab": (fn) =>
      fn.includes("if (p.mode && !editMode) setModeUI(p.mode);") &&
      fn.includes("if (e.data.type === 'mode' && !editMode) setModeUI(e.data.mode);") &&
      fn.includes("if (_d.ping && _d.ping.mode && !editMode) setModeUI(_d.ping.mode);"),
    "pro edit tab has one-click mode switch": (fn) =>
      !file.includes("zk-proxy-pro") ||
      (fn.includes("openEditMode(true, true);") &&
        fn.includes("vsc.postMessage({ command: 'setMode', mode: 'custom' });")),
    "pro official and edit tabs cannot both be active": (fn) =>
      !file.includes("zk-proxy-pro") ||
      (fn.includes("$btnOff.classList.toggle('active', tab === 'official');") &&
        fn.includes("$editToggle.classList.toggle('active', tab === 'edit');")),
    "pro edit tab autosaves changed content": (fn) =>
      !file.includes("zk-proxy-pro") ||
      (fn.includes("function scheduleEditSave()") &&
        fn.includes("vsc.postMessage({ command: 'setCustomSP', sp: sp.trim() });")),
  });
  assertFunctionBody(file, "_settingsJsonPath", {
    "targets Antigravity settings path": (fn) =>
      fn.includes("TARGET_IDE_SETTINGS_NAMES"),
  });
  assertFunctionBody(file, "_allSettingsJsonPaths", {
    "uses target plus compatibility settings": (fn) =>
      fn.includes("IDE_SETTINGS_NAMES"),
    "only clears existing compatibility files": (fn) =>
      fn.includes("fs.existsSync"),
  });
  assertFunctionBody(file, "setAnchor", {
    "does not write every compatibility settings file": (fn) =>
      !fn.includes("for (const sp of _allSettingsJsonPaths())"),
  });
  assertFunctionBody(file, "maybeRewriteLsArgs", {
    "rewrites Antigravity cloud_code_endpoint": (fn) =>
      fn.includes("--cloud_code_endpoint"),
  });
  assertFunctionBody(file, "_maybeRestartLS", {
    "does not force restart Antigravity server-owned LS": (fn) =>
      fn.includes('TARGET_IDE === "Antigravity"') &&
      fn.indexOf("return;") < fn.indexOf("forceRestartLS()"),
  });
  assertFunctionBody(file, "rewriteLsEndpointArg", {
    "supports split flag value args": (fn) => fn.includes("value === flag"),
    "supports equals flag value args": (fn) => fn.includes("startsWith(eqPrefix)"),
    "rewrites equals form in place": (fn) =>
      fn.includes("`${flag}=${_cachedProxyUrl}`"),
  });
  assertFunctionBody(file, "_readSettingsJson", {
    "parses JSONC comments": (fn) => fn.includes("_stripJsoncForParse"),
  });
  assertFunctionBody(file, "_writeSettingsJson", {
    "preserves settings.json comments": (fn) => fn.includes("_patchJsoncObject"),
  });
  assertRegex(
    file,
    /cloud_code_endpoint[\s\S]*api_server_url|api_server_url[\s\S]*cloud_code_endpoint/,
    "exec endpoint rewrite includes cloud_code_endpoint",
  );
  assertEndpointRewriteRuntime(file);
  assertSettingsJsoncRuntime(file);
  assertLsMainBridgePortRuntime(file);
  if (file.includes("zk-proxy-pro")) assertSelfUninstallRuntime(file);
}

for (const file of [
  "plugins/zk-proxy-pro/vendor/bundled-origin/source.js",
]) {
  assertNoUndeclaredOs(file);
  assertRegex(file, /TARGET_IDE\s*=.*"Antigravity"/, "source target IDE");
  assertRegex(
    file,
    /const\s+SP_MODE_VALID\s*=\s*new Set\(\["passthrough",\s*"custom"\]\)/,
    "official/custom prompt modes only",
  );
  assertIncludes(file, 'let SP_MODE = SP_MODE_VALID.has(_configuredMode) ? _configuredMode : "custom";', "custom mode default");
  assertIncludes(file, "ide_prompt.json", "custom IDE prompt persistence file");
  assertIncludes(file, "/origin/ide_prompt", "custom prompt alias endpoint");
  assertIncludes(file, "_saveCustomSP();", "custom prompt persistence call");
  assertIncludes(file, 'path.join(__dirname, "_antigravity_rules.txt")', "bundled custom prompt file");
  assertIncludes(file, 'SP_MODE === "invert" || SP_MODE === "custom"', "custom mode request rewrite");
  assertFunctionBody(file, "_geminiFallbackSystemText", {
    "custom mode never falls back to scripture": (fn) =>
      fn.includes('if (SP_MODE === "custom") return _effectiveCustomSP();'),
  });
  assertIncludes(
    file,
    "daily-cloudcode-pa.googleapis.com",
    "Antigravity API upstream default",
  );
  assertIncludes(file, "v\\d+(?:internal)?", "Antigravity v1internal REST routing");
  assertIncludes(file, "streamGenerateContent", "Antigravity Gemini REST streaming chat");
  assertIncludes(file, "gemini_internal_passthrough", "Gemini REST internal passthrough marker");
  assertNotIncludes(file, 'const sysKey = "system_instruction";', "Gemini REST rejected snake_case writer");
  assertAnyIncludes(
    file,
    ["OFFICIAL-REQ", "official-req"],
    "official upstream request diagnostics",
  );
  assertRouteUpstreamRuntime(file);
  assertGeminiRestPromptRuntime(file);
  assertKeepBlocksRuntime(file);
  assertCustomPromptPersistenceRuntime(file);
  assertBundledCustomPromptRuntime(file);
  assertLiveOfficialPromptPreview(file);
}

for (const file of [
  "plugins/zk-proxy-pro/package.json",
]) {
  assertIncludes(file, "antigravity", "package keyword");
}

const proPkg = JSON.parse(read("plugins/zk-proxy-pro/package.json"));
assertPackageVersion("plugins/zk-proxy-pro/package.json", proPkg.version);
if (`${proPkg.publisher}.${proPkg.name}` !== "zk-agi.zk-proxy-pro") {
  throw new Error(
    "plugins/zk-proxy-pro/package.json: extension id must match zk-agi.zk-proxy-pro",
  );
}
if (read("plugins/zk-proxy-pro/vendor/bundled-origin/_origin_mode.txt").trim() !== "custom") {
  throw new Error("plugins/zk-proxy-pro/vendor/bundled-origin/_origin_mode.txt: default must be custom");
}
const defaultMode =
  proPkg.contributes &&
  proPkg.contributes.configuration &&
  proPkg.contributes.configuration.properties &&
  proPkg.contributes.configuration.properties["zk.origin.defaultMode"];
if (!defaultMode || defaultMode.default !== "custom") {
  throw new Error("plugins/zk-proxy-pro/package.json: default prompt mode must be custom");
}
if (JSON.stringify(defaultMode.enum) !== JSON.stringify(["passthrough", "custom"])) {
  throw new Error("plugins/zk-proxy-pro/package.json: prompt modes must be official/custom only");
}

const proVsix = `dist/${proPkg.name}-${proPkg.version}.vsix`;
if (fs.existsSync(path.join(__dirname, "../..", proVsix))) {
  assertVsixEntryEqualsSource(
    proVsix,
    "extension/package.json",
    "plugins/zk-proxy-pro/package.json",
  );
  assertVsixEntryEqualsSource(
    proVsix,
    "extension/extension.js",
    "plugins/zk-proxy-pro/extension.js",
  );
  assertVsixEntryEqualsSource(
    proVsix,
    "extension/vendor/bundled-origin/source.js",
    "plugins/zk-proxy-pro/vendor/bundled-origin/source.js",
  );
  assertVsixEntryEqualsSource(
    proVsix,
    "extension/vendor/bundled-origin/_antigravity_rules.txt",
    "plugins/zk-proxy-pro/vendor/bundled-origin/_antigravity_rules.txt",
  );
  assertVsixEntryEqualsSource(
    proVsix,
    "extension/vendor/bundled-origin/_origin_mode.txt",
    "plugins/zk-proxy-pro/vendor/bundled-origin/_origin_mode.txt",
  );
}

console.log("antigravity-target-check ok");

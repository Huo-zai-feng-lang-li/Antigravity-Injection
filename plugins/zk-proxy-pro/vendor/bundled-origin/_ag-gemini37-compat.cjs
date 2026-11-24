"use strict";

const fs = require("fs");
const path = require("path");

// LS 内部占位符模型名（所有 Gemini 模型可能都用这个占位符）
const SOURCE_MODEL = "gemini-2.5-pro";
// 默认目标模型（当 URL 中提取不到实际模型名、且无旁路选择时的回退）
// 2026-11-24：3.8 三档（high/medium/low）已从服务端下线（uid 全 404），仅 tiered 存活；
// 改为当前唯一对 standard-tier 开放的 Gemini 4（Hydrogen 全档位可用）。
const DEFAULT_TARGET_MODEL = "gemini-4-hydrogen-sonar";
// renderer 模型选择旁路落盘文件相对目录（与 source.js 的 /__agtarget 路由一致）
const SELECTED_STATE_FILE = path.join("_agcap", "_ag-selected.json");
// 测试隔离：允许通过环境变量把落盘路径重定向到临时目录，
// 避免在装有 IDE 的开发机上跑单测时覆盖/删除用户真实的选择记录。
// 生产环境不设该变量，行为完全不变。
const AG_SELECTED_FILE_OVERRIDE = process.env.AG_SELECTED_FILE || null;
// 旁路选择的新鲜窗口：超过该时长未重新选择则回退默认模型（毫秒）
const SELECTED_FRESH_MS = 120 * 60 * 1000;

/**
 * 从 Gemini REST URL 中提取实际模型名。
 * URL 格式: /v1beta/models/{model}:generateContent 或 /v1beta/models/{model}:streamGenerateContent
 * @param {string} reqUrl - 请求 URL
 * @returns {string|null} 提取到的模型名，提取失败返回 null
 */
function extractModelFromUrl(reqUrl) {
  if (!reqUrl || typeof reqUrl !== "string") return null;
  try {
    const qIdx = reqUrl.indexOf("?");
    const rawPath = qIdx < 0 ? reqUrl : reqUrl.slice(0, qIdx);
    const m = rawPath.match(/\/models\/([^:]+):(?:generateContent|streamGenerateContent)$/);
    if (m && m[1]) {
      const model = decodeURIComponent(m[1]);
      if (model === SOURCE_MODEL) return null;
      return model;
    }
  } catch {}
  return null;
}

/**
 * [EFFORT-DYNAMIC] 按目标模型设置主对话请求的推理强度。
 *
 * 背景：Antigravity 私有端点 /v1internal 为旧版 schema，只认
 * request.generationConfig.thinkingConfig.thinkingBudget（token 数），
 * 不认 Gemini 3 新字段 thinkingLevel（加了会 400 INVALID_ARGUMENT）。
 * LS 给 Fast 版模型写入 thinkingBudget=1024（Low 档），导致模型自报
 * effort level 0.25。
 *
 * 2026-10-23 变更（原 [EFFORT-HIGH] 无条件 -1 会抹平档位）：
 *   改为按**目标 uid** 查表设置，官方元信息中的 thinkingBudget 为准：
 *     gemini-3.8-flash-high    -> -1    （动态思考，等同 High 满载）
 *     gemini-3.8-flash-medium  -> 4000
 *     gemini-3.8-flash-low     -> 1000
 *     gemini-3.8-flash-tiered  -> -1
 *   表中没有的模型（Claude 全系、其它 Gemini、未知新模型）保持 -1，
 *   与既有已验证行为一致，零回归。
 *
 * 仅对主对话请求（顶层 model 为 LS 占位符 gemini-2.5-pro）生效，
 * 不动 lite/标题摘要等附属请求。
 */
// ⚠️ 维护警告：官方发布带档位的新模型（如 Gemini 3.9/4.x 的 medium/low）时，
// 必须在此表中同步添加对应 uid，否则会落到默认 -1（High 满载）而被"抹平档位"。
// 取值以官方 fetchAvailableModels 元信息的 thinkingBudget 字段为准。
const THINKING_BUDGET_BY_MODEL = Object.freeze({
  "gemini-3.8-flash-high": -1,
  "gemini-3.8-flash-medium": 4000,
  "gemini-3.8-flash-low": 1000,
  "gemini-3.8-flash-tiered": -1,
  // 2026-11-24：Gemini 4 Hydrogen（唯一对 standard-tier 开放的 Gemini 4 档）
  // 实测 TTFT：budget -1/16384 = 16~18s、8192 = 9.2s、4000 = 6.7s、1000 = 5.8s。
  // Gemini 4 不返回明文 thought（只有 thoughtSignature），思考期客户端零输出，
  // 故 budget 越大越像"卡住"。Fast 档取 4000 作为速度/深度的平衡点。
  "gemini-4-hydrogen-sonar": 4000,
  // 2026-11-24：Claude 4.6 两档（目录内实测 200；4.6 于 11-30 下线）
  "claude-sonnet-4-6": -1,
  "claude-opus-4-6-thinking": -1,
  // 2026-11-24 第五轮：3 Flash 兜底档，-1 = 动态（不压思考深度），
  // 它原生流式吐 thought，客户端首字节 1.35s 就有输出，不会出现空等。
  "gemini-3-flash": -1,
});

// 合成别名表：前端下拉用「假 uid」表达同一模型的不同推理档，此处解析回真实 uid。
// 键必须与 workbench 补丁 MODELS 里的 uid 完全一致；未登记的 uid 原样透传。
// budget 为数字时表示强制写入 request.generationConfig.thinkingConfig.thinkingBudget。
const UID_ALIAS = Object.freeze({
  // Fast 档：4000 实测 TTFT 6.7s（-1 要 18s，用户感知为"卡住"）
  "gemini-4-hydrogen-sonar": { uid: "gemini-4-hydrogen-sonar", budget: 4000 },
  // High Effort 档：16384 映射到 HIGH（3614 thought tokens），TTFT ~16s
  "gemini-4-hydrogen-sonar-high": { uid: "gemini-4-hydrogen-sonar", budget: 16384 },
  // 2026-11-24 第五轮：3 Flash 兜底档。不设强制预算（-1 = 服务端自动），
  // 保留它 1.35s TTFT + 明文 thought 的原生行为，作为"快且不落线"的日常档。
  "gemini-3-flash": { uid: "gemini-3-flash", budget: -1 },
});

/**
 * 按目标模型 uid 设置 thinkingBudget。
 * @param {object} request - 解析后的请求体
 * @param {string} targetModel - 最终改写后的真实模型 uid
 * @param {number} [forcedBudget] - 合成别名指定的固定预算；给出时强制创建 thinkingConfig 并写入
 * @returns {boolean} 是否发生了修改
 */
function _agApplyThinkingBudget(request, targetModel, forcedBudget) {
  try {
    const r = request && request.request;
    if (!r || typeof r !== "object") return false;

    // 合成别名（最强档）需要强制注入，即使 LS 没带 generationConfig / thinkingConfig
    if (typeof forcedBudget === "number") {
      if (!r.generationConfig || typeof r.generationConfig !== "object") r.generationConfig = {};
      if (
        !r.generationConfig.thinkingConfig ||
        typeof r.generationConfig.thinkingConfig !== "object"
      ) {
        r.generationConfig.thinkingConfig = {};
      }
      r.generationConfig.thinkingConfig.thinkingBudget = forcedBudget;
      return true;
    }

    const tc = r.generationConfig && r.generationConfig.thinkingConfig;
    if (!tc || !Object.prototype.hasOwnProperty.call(tc, "thinkingBudget")) return false;
    const budget = Object.prototype.hasOwnProperty.call(
      THINKING_BUDGET_BY_MODEL,
      targetModel
    )
      ? THINKING_BUDGET_BY_MODEL[targetModel]
      : -1;
    tc.thinkingBudget = budget;
    return true;
  } catch {}
  return false;
}

/**
 * 读取 renderer 模型选择旁路落盘的目标 uid。
 *
 * workbench renderer 选中合成模型（Claude 5.5 等旧 LS 身份表中不存在、
 * 与官方 3.8 共用 modelAlias:8 外壳的模型）时，经 zk 的 /__agtarget
 * 路由把 {uid,label,sid,ts} 写到 _agcap/_ag-selected.json。旧 LS 对所有
 * 主对话统一发占位符 gemini-2.5-pro，无法从请求体区分用户选了哪个模型，
 * 故以此旁路的"最近一次显式选择"决定真实 uid。
 *
 * 选择优先级：当前会话 sid 的记录 > 全局 last；仅在新鲜窗口
 * （SELECTED_FRESH_MS）内采用，超时或无记录返回 null（回退默认模型），
 * 避免上次的选择在重启/长时间闲置后污染新会话。切回官方模型时前端同样
 * 会上报，last 立即刷新，不会串模型。
 *
 * @param {object} request - 解析后的请求体
 * @returns {string|null} 旁路目标 uid，无有效记录返回 null
 */
function _agReadSelected(request) {
  try {
    const f = AG_SELECTED_FILE_OVERRIDE || path.join(__dirname, SELECTED_STATE_FILE);
    const st = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!st || typeof st !== "object") return null;
    const sid =
      (request && request.request && request.request.sessionId) ||
      (request && request.sessionId) ||
      "";
    let rec = null;
    if (sid && st.bySid && st.bySid[sid]) rec = st.bySid[sid];
    if (!rec && st.last) rec = st.last;
    if (!rec || !rec.uid) return null;
    const ageMs = Date.now() - (Number(rec.ts) || 0);
    if (!(ageMs >= 0 && ageMs <= SELECTED_FRESH_MS)) return null;
    return rec.uid;
  } catch {
    return null;
  }
}

/**
 * 判断该请求是否为「主对话」请求（agent chat），用于在 LS 不再发送占位符时
 * 仍能按旁路选择覆盖真实 uid。
 *
 * 背景（2026-11-24 实测）：旧 LS 现已直接发送 `gemini-3.8-flash-n` 一类具体 uid，
 * 不再是占位符 `gemini-2.5-pro`；原「仅在占位符时改写」的条件会让所有合成项失效，
 * 表现为「界面选 Claude 5.5 / Gemini 4，实际跑 3.8」。主对话与附属请求（标题/摘要/
 * 行内补全）共用同一 URL，故以请求体特征区分：
 *   - 主对话必然带 tools 定义，或带超长 systemInstruction（实测 25k+ 字符）
 *   - 附属请求 systemInstruction 仅数百字符、无 tools
 *
 * @param {object} request - 解析后的请求体
 * @returns {boolean} 是否为主对话请求
 */
function _agIsMainChat(request) {
  try {
    const r = request && request.request;
    if (!r || typeof r !== "object") return false;
    const toolCount = Array.isArray(r.tools) ? r.tools.length : 0;
    const siLen =
      r.systemInstruction && Array.isArray(r.systemInstruction.parts)
        ? r.systemInstruction.parts.map((p) => (p && p.text) || "").join("").length
        : 0;
    return toolCount > 0 || siLen > 2000;
  } catch {
    return false;
  }
}

/**
 * 动态改写请求体中的模型名，并按目标档位设置推理强度。
 *
 * 占位符请求（旧 LS）：URL 显式模型名 > 旁路选择 > 默认。
 * 非占位符主对话（新 LS 直接发具体 uid）：仅在存在 URL 显式模型名或旁路选择时覆盖，
 * 无目标则原样透传——避免默认值把官方正在使用的 uid 顶掉（3.8 下线后默认会 404）。
 * 附属请求（标题/摘要/补全）永不改写。
 *
 * @param {Buffer} body - 请求体
 * @param {string} [reqUrl] - 请求 URL（用于提取实际模型名）
 * @returns {Buffer} 改写后的请求体
 */
function rewriteRequestBody(body, reqUrl) {
  if (!Buffer.isBuffer(body)) return body;
  try {
    const request = JSON.parse(body.toString("utf8"));
    if (!request || typeof request.model !== "string") return body;

    const isPlaceholder = request.model === SOURCE_MODEL;
    const urlModel = extractModelFromUrl(reqUrl);
    const selected = _agReadSelected(request);

    // 附属请求（非占位符且非主对话）：一律不动
    if (!isPlaceholder && !_agIsMainChat(request)) return body;
    // 非占位符主对话且无任何改写目标：原样透传，保留官方当前可用 uid
    if (!isPlaceholder && !urlModel && !selected) return body;

    // 目标模型解析：URL 显式模型名 > renderer 旁路选择（合成项）> 默认
    const rawTarget = urlModel || selected || DEFAULT_TARGET_MODEL;
    // 合成别名解析：前端假 uid → 真实 uid（可带强制推理预算）
    const alias = Object.prototype.hasOwnProperty.call(UID_ALIAS, rawTarget)
      ? UID_ALIAS[rawTarget]
      : null;
    const targetModel = alias ? alias.uid : rawTarget;
    request.model = targetModel;
    // [EFFORT-DYNAMIC] 按最终目标模型设置 thinkingBudget；别名带 budget 时强制注入
    _agApplyThinkingBudget(request, targetModel, alias ? alias.budget : undefined);
    return Buffer.from(JSON.stringify(request), "utf8");
  } catch {
    return body;
  }
}

module.exports = {
  SOURCE_MODEL,
  DEFAULT_TARGET_MODEL,
  SELECTED_FRESH_MS,
  THINKING_BUDGET_BY_MODEL,
  UID_ALIAS,
  extractModelFromUrl,
  _agReadSelected,
  _agApplyThinkingBudget,
  _agIsMainChat,
  rewriteRequestBody,
};

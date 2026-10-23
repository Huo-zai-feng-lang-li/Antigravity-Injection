"use strict";

const fs = require("fs");
const path = require("path");

// LS 内部占位符模型名（所有 Gemini 模型可能都用这个占位符）
const SOURCE_MODEL = "gemini-2.5-pro";
// 默认目标模型（当 URL 中提取不到实际模型名、且无旁路选择时的回退）
const DEFAULT_TARGET_MODEL = "gemini-3.8-flash-high";
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
});

/**
 * 按目标模型 uid 设置 thinkingBudget。
 * @param {object} request - 解析后的请求体
 * @param {string} targetModel - 最终改写后的模型 uid
 * @returns {boolean} 是否发生了修改
 */
function _agApplyThinkingBudget(request, targetModel) {
  try {
    const tc =
      request &&
      request.request &&
      request.request.generationConfig &&
      request.request.generationConfig.thinkingConfig;
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
 * 动态改写请求体中的模型名，并按目标档位设置推理强度。
 *
 * 如果请求体里的 model 是 LS 占位符 (gemini-2.5-pro)，则按以下优先级
 * 解析真实目标模型并改写：
 *   URL 显式模型名 > renderer 旁路选择（Claude 等合成模型）> 默认 3.8。
 * 这样官方发布任何新模型（Gemini 3.9/4.0、新版 Claude 等），只要前端
 * 放行显示并把 uid 经旁路带上，代理即可正确路由，无需改这里的映射代码。
 *
 * @param {Buffer} body - 请求体
 * @param {string} [reqUrl] - 请求 URL（用于提取实际模型名）
 * @returns {Buffer} 改写后的请求体
 */
function rewriteRequestBody(body, reqUrl) {
  if (!Buffer.isBuffer(body)) return body;
  try {
    const request = JSON.parse(body.toString("utf8"));
    if (!request || request.model !== SOURCE_MODEL) {
      // 非占位符请求：不做任何改写（thinkingBudget 只对主对话占位符有意义）
      return body;
    }

    // 目标模型解析：URL 显式模型名 > renderer 旁路选择（Claude 等）> 默认 3.8
    const targetModel =
      extractModelFromUrl(reqUrl) || _agReadSelected(request) || DEFAULT_TARGET_MODEL;
    request.model = targetModel;
    // [EFFORT-DYNAMIC] 按最终目标模型设置 thinkingBudget（High -1 / Medium 4000 / Low 1000）
    _agApplyThinkingBudget(request, targetModel);
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
  extractModelFromUrl,
  _agReadSelected,
  _agApplyThinkingBudget,
  rewriteRequestBody,
};

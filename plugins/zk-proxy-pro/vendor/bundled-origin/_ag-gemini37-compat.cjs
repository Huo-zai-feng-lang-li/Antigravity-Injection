"use strict";

// LS 内部占位符模型名（所有 Gemini 模型可能都用这个占位符）
const SOURCE_MODEL = "gemini-2.5-pro";
// 默认目标模型（当 URL 中提取不到实际模型名时的回退）
const DEFAULT_TARGET_MODEL = "gemini-3.8-flash-high";

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
 * [EFFORT-HIGH] 提升主对话请求的推理强度到 High。
 *
 * 背景：Antigravity 私有端点 /v1internal 为旧版 schema，只认
 * request.generationConfig.thinkingConfig.thinkingBudget（token 数），
 * 不认 Gemini 3 新字段 thinkingLevel（加了会 400 INVALID_ARGUMENT）。
 * LS 给 Fast 版模型写入 thinkingBudget=1024（Low 档），导致模型自报
 * effort level 0.25。官方定义 thinkingBudget=-1 为动态思考（模型按任务
 * 复杂度自行决定，等同 High 满载），故此处将主对话请求的 1024 提升为 -1。
 *
 * 仅对主对话请求（顶层 model 为 LS 占位符 gemini-2.5-pro）生效，
 * 不动 lite/标题摘要等附属请求。
 *
 * @param {object} request - 解析后的请求体
 * @returns {boolean} 是否发生了提升
 */
function _agLiftThinking(request) {
  try {
    if (
      request &&
      request.model === SOURCE_MODEL &&
      request.request &&
      request.request.generationConfig &&
      request.request.generationConfig.thinkingConfig &&
      Object.prototype.hasOwnProperty.call(
        request.request.generationConfig.thinkingConfig,
        "thinkingBudget"
      )
    ) {
      request.request.generationConfig.thinkingConfig.thinkingBudget = -1;
      return true;
    }
  } catch {}
  return false;
}

/**
 * 动态改写请求体中的模型名，并提升推理强度到 High。
 *
 * 如果请求体里的 model 是 LS 占位符 (gemini-2.5-pro)，
 * 则改写成从 URL 提取的实际模型名（或默认目标模型）。
 * 这样官方发布任何新模型（3.9/4.0/4.1），只要模型解锁让它显示，
 * 用户选择后就能自动正确代理，不需要改映射代码。
 *
 * @param {Buffer} body - 请求体
 * @param {string} [reqUrl] - 请求 URL（用于提取实际模型名）
 * @returns {Buffer} 改写后的请求体
 */
function rewriteRequestBody(body, reqUrl) {
  if (!Buffer.isBuffer(body)) return body;
  try {
    const request = JSON.parse(body.toString("utf8"));
    // [EFFORT-HIGH] 提升主对话思考等级到 High（thinkingBudget 1024 -> -1）
    const lifted = _agLiftThinking(request);

    if (!request || request.model !== SOURCE_MODEL) {
      // 非占位符请求：仅当提升动作改了内容时才重序列化
      return lifted ? Buffer.from(JSON.stringify(request), "utf8") : body;
    }

    // 优先从 URL 提取实际模型名，回退到默认目标模型
    const targetModel = extractModelFromUrl(reqUrl) || DEFAULT_TARGET_MODEL;
    request.model = targetModel;
    return Buffer.from(JSON.stringify(request), "utf8");
  } catch {
    return body;
  }
}

module.exports = {
  SOURCE_MODEL,
  DEFAULT_TARGET_MODEL,
  extractModelFromUrl,
  rewriteRequestBody,
};

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
    // 去掉 query string
    const qIdx = reqUrl.indexOf("?");
    const rawPath = qIdx < 0 ? reqUrl : reqUrl.slice(0, qIdx);
    // 匹配 /v1beta/models/{model}:generateContent
    const m = rawPath.match(/\/models\/([^:]+):(?:generateContent|streamGenerateContent)$/);
    if (m && m[1]) {
      const model = decodeURIComponent(m[1]);
      // 如果 URL 里也是占位符，说明 LS 没在 URL 里放实际模型名
      if (model === SOURCE_MODEL) return null;
      return model;
    }
  } catch {}
  return null;
}

/**
 * 动态改写请求体中的模型名。
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
    if (!request || request.model !== SOURCE_MODEL) return body;

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

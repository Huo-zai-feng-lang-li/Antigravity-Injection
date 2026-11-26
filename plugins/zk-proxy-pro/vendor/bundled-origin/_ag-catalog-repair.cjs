"use strict";

/**
 * _ag-catalog-repair.cjs · v9.9.536
 * 旧版 LS 占位符外壳复活
 *
 * 背景 (2026-11-26 实测)：
 *   旧 LS 主对话固定以 `gemini-2.5-pro`(MODEL_GOOGLE_GEMINI_2_5_PRO) 作占位符发请求，
 *   再由 _ag-gemini37-compat.cjs 改写成用户实际选择的 uid。
 *   官方 fetchAvailableModels 当天只剩 14 个模型，2.5 Pro 被下架 → LS 的模型注册表里没有它，
 *   SendUserCascadeMessage 在本地直接报 `unknown model key MODEL_GOOGLE_GEMINI_2_5_PRO: model not found`，
 *   请求根本没发出，表现为「模型不回复」。
 *
 * 治法 (往而不害)：
 *   只在 LS 消费的 fetchAvailableModels 响应里补回这一条外壳模型，
 *   不写 agentModelSorts / defaultAgentModelId，前端下拉不受影响；
 *   任何解析失败都返回 null，调用方原样透传。
 */

const zlib = require("zlib");

/** 旧 LS 占位符的模型 uid（compat 侧的 SOURCE_MODEL） */
const SHELL_UID = "gemini-2.5-pro";
/** 旧 LS 占位符的模型键（LS 报错里的 unknown model key） */
const SHELL_MODEL_KEY = "MODEL_GOOGLE_GEMINI_2_5_PRO";
const SHELL_DISPLAY_NAME = "Gemini 2.5 Pro";
/** 兜底配额时间：远期，避免前端把外壳显示成额度耗尽 */
const FALLBACK_RESET_TIME = "2099-12-31T00:00:00Z";

/**
 * 以目录里真实存在的模型项为模板克隆外壳项，保证字段形状跟随服务端。
 * @param {Record<string, any>|null|undefined} models 目录的 models 字典
 * @returns {Record<string, any>} 外壳模型项（已深拷贝，不与模板共享引用）
 */
function buildShellEntry(models) {
  const template =
    (models && (models["gemini-2.5-flash"] || Object.values(models)[0])) ||
    null;
  const entry = template
    ? JSON.parse(JSON.stringify(template))
    : {
        displayName: SHELL_DISPLAY_NAME,
        supportsImages: true,
        supportsThinking: true,
        maxTokens: 1048576,
        maxOutputTokens: 65535,
        apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
        modelProvider: "MODEL_PROVIDER_GOOGLE",
        supportedMimeTypes: {},
      };
  entry.displayName = SHELL_DISPLAY_NAME;
  entry.model = SHELL_MODEL_KEY;
  entry.recommended = false;
  entry.disabled = false;
  if (!entry.quotaInfo || typeof entry.quotaInfo !== "object") {
    entry.quotaInfo = { remainingFraction: 1, resetTime: FALLBACK_RESET_TIME };
  } else {
    entry.quotaInfo.remainingFraction = 1;
    if (!entry.quotaInfo.resetTime) {
      entry.quotaInfo.resetTime = FALLBACK_RESET_TIME;
    }
  }
  return entry;
}

/**
 * 目录缺失外壳模型时补回一条（幂等）。
 * @param {Record<string, any>} parsed fetchAvailableModels 响应对象
 * @returns {number} 实际新增条数（0 或 1）
 */
function ensureLegacyShellModels(parsed) {
  const models = parsed && parsed.models;
  if (!models || typeof models !== "object" || Array.isArray(models)) return 0;
  if (models[SHELL_UID]) return 0;
  models[SHELL_UID] = buildShellEntry(models);
  return 1;
}

/**
 * 修复 fetchAvailableModels 响应体：gzip/明文均可，解压 → 注入 → 按原编码回写。
 * 任何异常或无需修复都返回 null，调用方原样透传。
 * @param {Buffer} bodyBuf 官方响应体
 * @param {string} contentEncoding 原 content-encoding 头（仅用于识别，实际以魔数为准）
 * @returns {{buf: Buffer, gzip: boolean, added: number}|null}
 */
function repairAvailableModelsBody(bodyBuf, contentEncoding) {
  if (!Buffer.isBuffer(bodyBuf) || bodyBuf.length === 0) return null;
  const isGzip = bodyBuf.length > 2 && bodyBuf[0] === 0x1f && bodyBuf[1] === 0x8b;
  try {
    const raw = isGzip ? zlib.gunzipSync(bodyBuf) : bodyBuf;
    const parsed = JSON.parse(raw.toString("utf8"));
    const added = ensureLegacyShellModels(parsed);
    if (!added) return null;
    const out = Buffer.from(JSON.stringify(parsed), "utf8");
    return { buf: isGzip ? zlib.gzipSync(out) : out, gzip: isGzip, added };
  } catch (e) {
    return null;
  }
}

module.exports = {
  SHELL_UID,
  SHELL_MODEL_KEY,
  buildShellEntry,
  ensureLegacyShellModels,
  repairAvailableModelsBody,
};

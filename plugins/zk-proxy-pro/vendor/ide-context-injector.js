"use strict";

const OPEN_MARKER = "<ZK_IDE_CONTEXT_V1>";
const CLOSE_MARKER = "</ZK_IDE_CONTEXT_V1>";

function contextBlock(snapshot) {
  return `${OPEN_MARKER}\n${JSON.stringify(snapshot)}\n${CLOSE_MARKER}`;
}

function containsMarker(value, seen = new WeakSet()) {
  if (typeof value === "string") return value.includes(OPEN_MARKER);
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((item) => containsMarker(item, seen));
}

function appendText(target, key, snapshot) {
  const text = target && target[key];
  if (typeof text !== "string" || text.includes(OPEN_MARKER)) return false;
  target[key] = `${text}\n\n${contextBlock(snapshot)}`;
  return true;
}

function injectGeminiObject(obj, snapshot) {
  if (!obj || typeof obj !== "object") return false;
  if (containsMarker(obj)) return false;
  const queue = [obj];
  let target = null;
  while (queue.length) {
    const candidate = queue.shift();
    if (Array.isArray(candidate.contents)) target = candidate;
    for (const value of Object.values(candidate)) {
      if (value && typeof value === "object" && !Array.isArray(value)) queue.push(value);
    }
  }
  if (!target) return false;
  for (let index = target.contents.length - 1; index >= 0; index -= 1) {
    const message = target.contents[index];
    if (!message || message.role !== "user" || !Array.isArray(message.parts)) continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      if (appendText(message.parts[partIndex], "text", snapshot)) return true;
      if (message.parts[partIndex] && typeof message.parts[partIndex].text === "string" && message.parts[partIndex].text.includes(OPEN_MARKER)) return false;
    }
    return false;
  }
  return false;
}

function injectGeminiBuffer(body, snapshot) {
  try {
    const obj = JSON.parse(Buffer.from(body).toString("utf8"));
    if (!injectGeminiObject(obj, snapshot)) return { body, injected: false };
    return { body: Buffer.from(JSON.stringify(obj), "utf8"), injected: true };
  } catch {
    return { body, injected: false };
  }
}

function injectOpenAiMessages(messages, snapshot) {
  if (!Array.isArray(messages)) return { messages, injected: false };
  if (containsMarker(messages)) return { messages, injected: false };
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    if (typeof message.content === "string") {
      if (message.content.includes(OPEN_MARKER)) return { messages, injected: false };
      message.content = `${message.content}\n\n${contextBlock(snapshot)}`;
      return { messages, injected: true };
    }
    if (!Array.isArray(message.content)) return { messages, injected: false };
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (!part || (part.type && part.type !== "text")) continue;
      if (appendText(part, "text", snapshot)) return { messages, injected: true };
      if (typeof part.text === "string" && part.text.includes(OPEN_MARKER)) return { messages, injected: false };
    }
    return { messages, injected: false };
  }
  return { messages, injected: false };
}

module.exports = {
  OPEN_MARKER,
  CLOSE_MARKER,
  contextBlock,
  injectGeminiBuffer,
  injectOpenAiMessages,
};

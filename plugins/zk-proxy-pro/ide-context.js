"use strict";

const path = require("path");

function normalizeFilePath(value) {
  return typeof value === "string" && value ? path.normalize(path.resolve(value)) : null;
}

function toLocation(document, point) {
  return {
    line: point.line + 1,
    column: point.character + 1,
    offset: document.offsetAt(point),
  };
}

function collectOpenFiles(vscode, activeFile) {
  const files = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = normalizeFilePath(value);
    const key = normalized && normalized.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    files.push(normalized);
  };

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (!(input instanceof vscode.TabInputText) || input.uri.scheme !== "file") continue;
      add(input.uri.fsPath);
    }
  }
  add(activeFile);
  return files;
}

function createIdeContextCollector(vscode) {
  let cached = null;
  const invalidate = () => {
    cached = null;
  };
  const subscriptions = [
    vscode.window.onDidChangeActiveTextEditor(invalidate),
    vscode.window.onDidChangeTextEditorSelection(invalidate),
    vscode.window.tabGroups.onDidChangeTabs(invalidate),
    vscode.window.tabGroups.onDidChangeTabGroups(invalidate),
  ];

  const getSnapshot = () => {
    const editor = vscode.window.activeTextEditor;
    const document = editor && editor.document;
    const activeFile = document && document.uri.scheme === "file"
      ? normalizeFilePath(document.uri.fsPath)
      : null;
    const openFiles = collectOpenFiles(vscode, activeFile);
    if (!activeFile || !editor.selection) {
      cached = { version: 1, activeFile: null, openFiles, cursor: null, selection: null };
      return cached;
    }

    const selected = editor.selection;
    cached = {
      version: 1,
      activeFile,
      openFiles,
      cursor: toLocation(document, selected.active),
      selection: {
        text: selected.isEmpty ? "" : document.getText(selected),
        start: toLocation(document, selected.start),
        end: toLocation(document, selected.end),
      },
    };
    return cached;
  };

  return { getSnapshot, subscriptions };
}

module.exports = { createIdeContextCollector };

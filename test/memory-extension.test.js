import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { CLASSROOM_RULES_PROMPT } from "../dist/classroom-rules.js";
import { sakunyanExtension } from "../dist/extension.js";
import { emptyMemory, getMemoryPath, readMemory, SUMMARY_SYSTEM_PROMPT, SUMMARY_VERSION, updateMemory, upsertEpisode } from "../dist/memory.js";
import { getDefaultMode } from "../dist/modes.js";
import { writeSession } from "./fixtures/memory-sessions.js";

// 注入する日付（月/日）はローカル時刻で決まるので、テストでは日本時間に固定する。
process.env.TZ = "Asia/Tokyo";
// sakunyan専用フォルダを一時フォルダに向け、利用者の記憶を読まない・書かないようにする。
const agentDir = mkdtempSync(join(tmpdir(), "sakunyan-memory-ext-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => rmSync(agentDir, { recursive: true, force: true }));
globalThis.fetch = async () => {
  throw new Error("offline");
};

const memoryPath = getMemoryPath(agentDir);
const resetMemory = () => rmSync(join(agentDir, "memory"), { recursive: true, force: true });
const saveEpisode = (sessionId, timestamp, summary) => updateMemory(memoryPath, (state) =>
  upsertEpisode(state, { sessionId, timestamp, sessionModified: 1, summary, summaryVersion: SUMMARY_VERSION }));

function startExtension(mode, sessionId = "current") {
  const handlers = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand() {},
    setActiveTools() {},
  });
  const summaryRequests = [];
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const context = {
    mode,
    cwd: "/project",
    model: { id: "fixture" },
    modelRegistry: {
      find: () => ({}),
      complete: async (_model, request) => {
        if (request.systemPrompt === SUMMARY_SYSTEM_PROMPT) {
          summaryRequests.push(request.messages[0].content[0].text);
          return { stopReason: "stop", content: [{ type: "text", text: "辞書内包表記を練習した。次は条件付き。" }] };
        }
        return { stopReason: "stop", content: [{ type: "text", text: "準備できたよ" }] };
      },
      getApiKeyForProvider: async () => undefined,
    },
    sessionManager: {
      getSessionFile: () => join(agentDir, "sessions", "--project--", `${sessionId}.jsonl`),
      getSessionId: () => sessionId,
    },
    ui: { theme, setHeader() {}, setStatus() {}, setWidget() {}, setWorkingMessage() {}, notify() {}, custom: async () => undefined },
    shutdown() {},
  };
  const ask = async () => (await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, context)).systemPrompt;
  return { handlers, context, summaryRequests, ask };
}

async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("timed out");
}

test("記憶はpiの基本のあと、モードの指示・実行環境・教室ルールより前に入る", async () => {
  resetMemory();
  await saveEpisode("past", "2026-10-13T03:00:00.000Z", "リスト内包表記を練習した。");
  const { handlers, context, ask } = startExtension("print");
  await handlers.get("session_start")({ reason: "startup" }, context);
  const prompt = await ask();
  const memoryAt = prompt.indexOf("## 最近の学習（新しい順）\n- 10/13: リスト内包表記を練習した。");
  assert.ok(prompt.startsWith("BASE_PROMPT\n\n"));
  assert.ok(memoryAt > 0);
  assert.ok(memoryAt < prompt.indexOf(getDefaultMode().prompt));
  assert.ok(prompt.indexOf(getDefaultMode().prompt) < prompt.indexOf(CLASSROOM_RULES_PROMPT));
});

test("記憶は最初の質問で組み立てて固定し、会話の途中では変えない。新しいセッションで組み立て直す", async () => {
  resetMemory();
  await saveEpisode("first", "2026-10-13T03:00:00.000Z", "最初の要約。");
  const { handlers, context, ask } = startExtension("print");
  await handlers.get("session_start")({ reason: "startup" }, context);
  const firstPrompt = await ask();
  await saveEpisode("later", "2026-10-14T03:00:00.000Z", "あとから保存された要約。");
  assert.equal(await ask(), firstPrompt);
  assert.doesNotMatch(firstPrompt, /あとから保存された要約/);

  await handlers.get("session_start")({ reason: "new" }, context);
  assert.match(await ask(), /あとから保存された要約/);
});

test("記憶がないときは何も足さない", async () => {
  resetMemory();
  const { handlers, context, ask } = startExtension("print");
  await handlers.get("session_start")({ reason: "startup" }, context);
  assert.ok((await ask()).startsWith(`BASE_PROMPT\n\n${getDefaultMode().prompt}`));
});

test("TUIでは接続確認と並行して裏で要約し、TUI以外では要約しない", async () => {
  resetMemory();
  writeSession(agentDir, { id: "past-tui", userTexts: ["辞書内包表記を教えて", "書けました"], mtime: 1_000 });

  const print = startExtension("print");
  await print.handlers.get("session_start")({ reason: "startup" }, print.context);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(print.summaryRequests.length, 0);

  const tui = startExtension("tui");
  await tui.handlers.get("session_start")({ reason: "startup" }, tui.context);
  await waitFor(() => (readMemory(memoryPath)?.episodes.length ?? 0) === 1);
  assert.equal(tui.summaryRequests.length, 1);
  assert.match(tui.summaryRequests[0], /利用者: 辞書内包表記を教えて/);
  assert.match(await tui.ask(), /辞書内包表記を練習した。次は条件付き。/);
  await tui.handlers.get("session_shutdown")({ reason: "quit" }, tui.context);
});

test("壊れた記憶でも会話は記憶なしで続く", async () => {
  resetMemory();
  assert.ok(await updateMemory(memoryPath, () => emptyMemory()));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(memoryPath, "{broken");
  const { handlers, context, ask } = startExtension("print");
  await handlers.get("session_start")({ reason: "startup" }, context);
  assert.ok((await ask()).startsWith(`BASE_PROMPT\n\n${getDefaultMode().prompt}`));
});

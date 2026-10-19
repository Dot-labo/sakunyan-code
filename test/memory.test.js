import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  emptyMemory,
  formatMemoryPrompt,
  getMemoryPath,
  getSessionsDir,
  isSummarizable,
  listSessionFiles,
  MAX_STORED_EPISODES,
  MAX_SUMMARY_CHARS,
  MEMORY_GUIDANCE,
  NO_SUMMARY,
  extractTopic,
  normalizeSummary,
  readMemory,
  readTranscript,
  runMemoryMaintenance,
  selectSessionsToSummarize,
  SUMMARY_VERSION,
  updateMemory,
  upsertEpisode,
} from "../dist/memory.js";
import { SEMANTIC_VERSION } from "../dist/semantic-memory.js";
import { writeSession } from "./fixtures/memory-sessions.js";

// 注入する日付（月/日）はローカル時刻で決まるので、テストでは日本時間に固定する。
process.env.TZ = "Asia/Tokyo";

const tempAgentDir = () => mkdtempSync(join(tmpdir(), "sakunyan-memory-"));
const text = (value) => [{ type: "text", text: value }];

const episode = (sessionId, day, extra = {}) => ({
  sessionId, timestamp: `2026-10-${String(day).padStart(2, "0")}T03:00:00.000Z`, sessionModified: 1, summary: `${sessionId}の要約`, summaryVersion: SUMMARY_VERSION, ...extra,
});

test("本文だけを取り出し、ツールの結果とエラーの応答と壊れた行を含めない", () => {
  const agentDir = tempAgentDir();
  const path = writeSession(agentDir, {
    id: "s1",
    userTexts: ["リスト内包表記を教えて", "フィルタ付きも書けた"],
    extra: [
      { type: "message", id: "t1", message: { role: "toolResult", content: text("TOOL_OUTPUT_SENTINEL") } },
      { type: "message", id: "e1", message: { role: "assistant", content: text("ERROR_SENTINEL"), stopReason: "error" } },
    ],
  });
  writeFileSync(path, readFileSync(path, "utf8") + "{not json\n");
  const transcript = readTranscript(path);
  assert.equal(transcript.sessionId, "s1");
  assert.equal(transcript.userMessageCount, 2);
  assert.equal(transcript.assistantMessageCount, 2);
  assert.match(transcript.text, /利用者: リスト内包表記を教えて/);
  assert.doesNotMatch(transcript.text, /TOOL_OUTPUT_SENTINEL|ERROR_SENTINEL/);
  assert.equal(transcript.lastTimestamp, "2026-10-14T00:01:30.000Z");
});

test("長いログは末尾の12,000文字だけを使う", () => {
  const agentDir = tempAgentDir();
  const transcript = readTranscript(writeSession(agentDir, { id: "long", userTexts: ["あ".repeat(20_000), "最後の質問"] }));
  assert.equal(transcript.text.length, 12_000);
  assert.match(transcript.text, /最後の質問への答え$/);
});

test("1往復だけの会話と、応答がすべてエラーの会話は要約できない", () => {
  const agentDir = tempAgentDir();
  assert.equal(isSummarizable(readTranscript(writeSession(agentDir, { id: "one", userTexts: ["こんにちは"] }))), false);
  assert.equal(isSummarizable(readTranscript(writeSession(agentDir, { id: "err", replyError: true }))), false);
  assert.equal(isSummarizable(readTranscript(writeSession(agentDir, { id: "ok" }))), true);
});

test("今のセッションと要約できないものを除き、新しい順に5件まで選ぶ", () => {
  const agentDir = tempAgentDir();
  for (let index = 0; index < 7; index++) writeSession(agentDir, { id: `s${index}`, folder: index % 2 ? "--a--" : "--b--", mtime: 1_000 + index });
  const current = writeSession(agentDir, { id: "current", mtime: 2_000 });
  writeSession(agentDir, { id: "greeting", userTexts: ["こんにちは"], mtime: 1_600 });
  const selected = selectSessionsToSummarize(listSessionFiles(getSessionsDir(agentDir)), emptyMemory(), current);
  assert.deepEqual(selected.map(({ transcript }) => transcript.sessionId), ["s6", "s5", "s4", "s3", "s2"]);
});

test("未要約と再開を先に、版だけが古いものはあとに（「なし」は最後に）選び、畳み込み済みは版が古くても選ばない", () => {
  const agentDir = tempAgentDir();
  writeSession(agentDir, { id: "done", mtime: 1_000 });
  writeSession(agentDir, { id: "resumed", mtime: 3_000 });
  writeSession(agentDir, { id: "new", mtime: 900 });
  writeSession(agentDir, { id: "old-version", mtime: 1_100 });
  writeSession(agentDir, { id: "old-none", mtime: 1_300 });
  writeSession(agentDir, { id: "old-folded", mtime: 1_200 });
  const state = { ...emptyMemory(), episodes: [
    { ...episode("done", 13), sessionModified: 1_000_000 },
    { ...episode("resumed", 13), sessionModified: 2_000_000 },
    { ...episode("old-version", 13), sessionModified: 1_100_000, summaryVersion: SUMMARY_VERSION - 1 },
    { ...episode("old-none", 13), sessionModified: 1_300_000, summaryVersion: SUMMARY_VERSION - 1, summary: NO_SUMMARY },
    { ...episode("old-folded", 13), sessionModified: 1_200_000, summaryVersion: SUMMARY_VERSION - 1, foldedRevision: 1 },
  ] };
  const files = listSessionFiles(getSessionsDir(agentDir));
  assert.deepEqual(selectSessionsToSummarize(files, state, undefined).map(({ transcript }) => transcript.sessionId), ["resumed", "new", "old-version", "old-none"]);
  assert.deepEqual(selectSessionsToSummarize(files, state, undefined, 2).map(({ transcript }) => transcript.sessionId), ["resumed", "new"]);
});

test("要約を整える: 話し手の名前、文の終わりでの切り詰め、「なし」、秘密情報", async () => {
  assert.equal(normalizeSummary("  リストを練習。\n次は辞書。  "), "リストを練習。 次は辞書。");
  assert.equal(normalizeSummary("利用者: for文を練習した。"), "for文を練習した。");
  assert.equal(normalizeSummary("【Python】for文を練習した。"), "for文を練習した。");
  assert.equal(extractTopic("【Python】for文を練習した。"), "Python");
  assert.equal(extractTopic("利用者: 【HTML/CSS】h1を書いた。"), "HTML/CSS");
  assert.equal(extractTopic("for文を練習した。"), undefined);
  const { extractTopicLabel } = await import("../dist/memory.js");
  assert.deepEqual(extractTopicLabel("【Scratch・一区切り】ゲームを完成させた。"), { topic: "Scratch", topicStatus: "一区切り" });
  assert.deepEqual(extractTopicLabel("【JavaScript・見送り】やめた。"), { topic: "JavaScript", topicStatus: "見送り" });
  assert.deepEqual(extractTopicLabel("【HTML・CSS】h1を書いた。"), { topic: "HTML・CSS" });
  assert.equal(normalizeSummary("【Scratch・一区切り】ゲームを完成させた。"), "ゲームを完成させた。");
  assert.equal([...normalizeSummary("あ".repeat(300))].length, MAX_SUMMARY_CHARS);
  assert.equal(normalizeSummary(`${"い".repeat(100)}。${"う".repeat(100)}。`), `${"い".repeat(100)}。`);
  assert.equal(normalizeSummary("なし。"), NO_SUMMARY);
  assert.equal(normalizeSummary("利用者にコードを丸ごと提供しただけの会話であり、利用者が新しく何かを学んだり、実際にコードを書いたり動かしたりしていないため。"), NO_SUMMARY);
  assert.equal(normalizeSummary("なし。あいさつだけの会話のため。"), NO_SUMMARY);
  assert.equal(normalizeSummary("再帰関数でつまずき、今日はやめた。次にやることは決まっていない。"), "再帰関数でつまずき、今日はやめた。");
  assert.equal(normalizeSummary("キー sk-abcdefghijklmnopqrstuvwxyz を設定した"), NO_SUMMARY);
  assert.equal(normalizeSummary("   "), undefined);
});

test("2件をほぼ同時に保存しても両方が残り、権限は0600と0700になる", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  const results = await Promise.all([
    updateMemory(path, (state) => upsertEpisode(state, episode("a", 13))),
    updateMemory(path, (state) => upsertEpisode(state, episode("b", 14))),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(readMemory(path).episodes.map(({ sessionId }) => sessionId), ["b", "a"]);
  if (process.platform !== "win32") {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(join(agentDir, "memory")).mode & 0o777, 0o700);
  }
});

test("同じセッションは置き換えて畳み込み済みの印を外し、200件の上限では畳み込み済みからだけ削る", () => {
  let state = { ...emptyMemory(), episodes: [episode("a", 1, { foldedRevision: 1 })] };
  state = upsertEpisode(state, episode("a", 2, { summary: "新しい要約" }));
  assert.equal(state.episodes.length, 1);
  assert.equal(state.episodes[0].summary, "新しい要約");
  assert.equal(state.episodes[0].foldedRevision, undefined);

  const many = [];
  for (let index = 0; index < MAX_STORED_EPISODES; index++) {
    many.push({ ...episode(`e${index}`, 1), timestamp: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(), foldedRevision: index < 3 ? undefined : 1 });
  }
  const capped = upsertEpisode({ ...emptyMemory(), episodes: many }, episode("new", 20));
  assert.equal(capped.episodes.length, MAX_STORED_EPISODES);
  // 一番古い3件は畳み込んでいないので残り、畳み込み済みのうち一番古い e3 が消える。
  const ids = new Set(capped.episodes.map(({ sessionId }) => sessionId));
  assert.ok(ids.has("e0") && ids.has("e1") && ids.has("e2"));
  assert.ok(!ids.has("e3"));
});

test("壊れたmemory.jsonは上書きせず、注入もしない", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  mkdirSync(join(agentDir, "memory"), { recursive: true });
  writeFileSync(path, "{broken");
  assert.equal(readMemory(path), undefined);
  assert.equal(await updateMemory(path, (state) => upsertEpisode(state, episode("a", 13))), false);
  assert.equal(readFileSync(path, "utf8"), "{broken");
  assert.equal(formatMemoryPrompt(readMemory(path), undefined), "");
});

test("注入は意味記憶→最近の学習（新しい順）→確かめの一文で、今のセッション・「なし」・畳み込み済みを除き、古い版は入れる", () => {
  const state = {
    ...emptyMemory(),
    semantic: { semanticVersion: SEMANTIC_VERSION, revision: 1, updatedAt: "2026-10-01T00:00:00.000Z", topics: [{ name: "Go", status: "一区切り", progress: "変数と制御構文" }], struggles: [], habits: ["自分で書いて確かめたい"] },
    episodes: [
      episode("d13", 13, { summary: "リスト内包表記を練習した。" }),
      episode("d14", 14, { summary: "Flaskで簡単なAPIを作り始めた。", topic: "Flask" }),
      episode("none", 15, { summary: NO_SUMMARY }),
      episode("current", 16),
      episode("old-version", 17, { summaryVersion: SUMMARY_VERSION - 1 }),
      episode("folded", 12, { foldedRevision: 1 }),
    ],
  };
  const prompt = formatMemoryPrompt(state, "current");
  assert.match(prompt, /^## 学習の全体像\n### テーマ\n- Go（一区切り）: 変数と制御構文\n### 学び方の傾向\n- 自分で書いて確かめたい\n\n## 最近の学習（新しい順）\n- 10\/17: old-versionの要約\n- 10\/14: 【Flask】Flask[^\n]*\n- 10\/13: リスト[^\n]*\n\n/);
  assert.ok(prompt.endsWith(MEMORY_GUIDANCE));
  assert.doesNotMatch(prompt, /なし|currentの要約|foldedの要約/);
  assert.equal(formatMemoryPrompt(emptyMemory(), undefined), "");
});

test("要約の入力に、これまでのテーマ名を新しい順に添える", async () => {
  const { buildSummaryInput, knownTopicNames } = await import("../dist/memory.js");
  const state = { ...emptyMemory(), episodes: [episode("a", 1, { topic: "Python" }), episode("b", 3, { topic: "Git" }), episode("c", 2, { topic: "python" })],
    semantic: { semanticVersion: SEMANTIC_VERSION, revision: 1, updatedAt: "x", topics: [{ name: "Scratch", status: "一区切り", progress: "ゲーム" }], struggles: [], habits: [] } };
  assert.deepEqual(knownTopicNames(state), ["Git", "python", "Scratch"]);
  const transcript = { sessionId: "s", lastTimestamp: "", userMessageCount: 2, assistantMessageCount: 1, text: "利用者: こんにちは" };
  assert.equal(buildSummaryInput(transcript), "利用者: こんにちは");
  assert.equal(buildSummaryInput(transcript, ["Git", "Python"]), "## これまでのテーマ名（当てはまるならこの名前を使う）\nGit、Python\n\n## 会話ログ\n利用者: こんにちは");
});

test("要約して保存し、「なし」は作り直さず、失敗したセッションは次回に再試行する", async () => {
  const agentDir = tempAgentDir();
  const options = { sessionsDir: getSessionsDir(agentDir), memoryPath: getMemoryPath(agentDir), currentSessionFile: undefined, fold: async () => undefined };
  writeSession(agentDir, { id: "learn", userTexts: ["for文", "書けた"], mtime: 1_000 });
  writeSession(agentDir, { id: "probe", userTexts: ["接続確認", "もう一度"], mtime: 1_100 });
  writeSession(agentDir, { id: "fail", userTexts: ["while文", "書けた"], mtime: 1_200 });
  const calls = [];
  const summarize = async (transcript) => {
    calls.push(transcript);
    if (transcript.includes("接続確認")) return "なし";
    if (transcript.includes("while文")) return undefined;
    return "【Python】for文を練習した。次はwhile文。";
  };
  assert.deepEqual(await runMemoryMaintenance({ ...options, summarize }), { summarized: 2, folded: 0 });
  assert.equal(calls.length, 3);
  const saved = readMemory(options.memoryPath).episodes;
  assert.deepEqual(saved.map(({ sessionId, summary }) => [sessionId, summary]).sort(), [["learn", "for文を練習した。次はwhile文。"], ["probe", NO_SUMMARY]]);
  assert.equal(saved.find(({ sessionId }) => sessionId === "learn").topic, "Python");
  assert.equal(saved.find(({ sessionId }) => sessionId === "probe").topic, undefined);

  calls.length = 0;
  await runMemoryMaintenance({ ...options, summarize: async (transcript) => (calls.push(transcript), "while文を練習した。") });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /while文/);
});

test("モデルが例外を投げても、セッションが終わったあとでも保存しない", async () => {
  const agentDir = tempAgentDir();
  const options = { sessionsDir: getSessionsDir(agentDir), memoryPath: getMemoryPath(agentDir), currentSessionFile: undefined, fold: async () => undefined };
  writeSession(agentDir, { id: "a", mtime: 1_000 });
  assert.equal((await runMemoryMaintenance({ ...options, summarize: async () => { throw new Error("boom"); } })).summarized, 0);
  let current = true;
  const summarize = async () => { current = false; return "要約"; };
  assert.equal((await runMemoryMaintenance({ ...options, summarize, isCurrent: () => current })).summarized, 0);
  assert.deepEqual(readMemory(options.memoryPath).episodes, []);
});

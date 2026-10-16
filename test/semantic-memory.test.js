import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyFold,
  emptyMemory,
  foldOnce,
  formatMemoryPrompt,
  getMemoryPath,
  getSessionsDir,
  readMemory,
  resetOutdatedSemantic,
  runMemoryMaintenance,
  selectEpisodesToFold,
  SUMMARY_VERSION,
  updateMemory,
  upsertEpisode,
} from "../dist/memory.js";
import { MAX_SEMANTIC_CHARS, parseFoldOutput, renderSemantic, SEMANTIC_VERSION, validateSemantic } from "../dist/semantic-memory.js";
import { writeSession } from "./fixtures/memory-sessions.js";

process.env.TZ = "Asia/Tokyo";

const tempAgentDir = () => mkdtempSync(join(tmpdir(), "sakunyan-semantic-"));
const episode = (sessionId, day, extra = {}) => ({
  sessionId, timestamp: `2026-10-${String(day).padStart(2, "0")}T03:00:00.000Z`, sessionModified: 1, summary: `${sessionId}の要約`, summaryVersion: SUMMARY_VERSION, ...extra,
});
const content = (name = "Python") => ({ topics: [{ name, status: "学習中", progress: "クラスまで", next: "継承" }], struggles: [], habits: [] });
const stateWith = (count, extra = {}) => ({ ...emptyMemory(), ...extra, episodes: Array.from({ length: count }, (_, index) => episode(`e${index + 1}`, index + 1)) });

async function seed(path, state) {
  assert.ok(await updateMemory(path, () => state));
}

test("意味記憶は決まった形・件数・文字数・分量・秘密情報を検証する", () => {
  assert.deepEqual(validateSemantic(content()), content());
  assert.equal(validateSemantic({ ...content(), topics: Array.from({ length: 6 }, (_, index) => content(`T${index}`).topics[0]) }), undefined);
  assert.equal(validateSemantic({ topics: [{ name: "Python", status: "完了", progress: "x" }], struggles: [], habits: [] }), undefined);
  assert.equal(validateSemantic({ topics: [{ name: "Python", status: "学習中", progress: "あ".repeat(81) }], struggles: [], habits: [] }), undefined);
  assert.equal(validateSemantic({ ...content(), struggles: ["a", "b", "c", "d"] }), undefined);
  assert.equal(validateSemantic({ ...content(), habits: ["キーは sk-abcdefghijklmnopqrstuv"] }), undefined);
  assert.equal(validateSemantic({ topics: [], struggles: [], habits: [] }).topics.length, 0);
  // 5テーマ・3件・3件をすべて上限まで埋めると800文字を超えるので保存できない。
  const full = {
    topics: Array.from({ length: 5 }, (_, index) => ({ name: `テーマ${index}`.padEnd(20, "あ"), status: "学習中", progress: "い".repeat(80), next: "う".repeat(40) })),
    struggles: ["え".repeat(60), "お".repeat(60), "か".repeat(60)],
    habits: ["き".repeat(60), "く".repeat(60), "け".repeat(60)],
  };
  assert.ok([...renderSemantic(full)].length > MAX_SEMANTIC_CHARS);
  assert.equal(validateSemantic(full), undefined);
});

test("モデルの出力からJSONを取り出す（コードフェンスや前置きがあっても）", () => {
  assert.deepEqual(parseFoldOutput("はい。\n```json\n" + JSON.stringify(content()) + "\n```"), content());
  assert.equal(parseFoldOutput("JSONではありません"), undefined);
});

test("畳み込むのは、使えるエピソードが5件を超えた分の古いものだけ（最大10件）", () => {
  assert.deepEqual(selectEpisodesToFold(stateWith(5)), []);
  assert.deepEqual(selectEpisodesToFold(stateWith(6)).map(({ sessionId }) => sessionId), ["e1"]);
  assert.equal(selectEpisodesToFold(stateWith(20)).length, 10);
  const withNone = stateWith(6);
  withNone.episodes[0].summary = "なし";
  assert.deepEqual(selectEpisodesToFold(withNone), []);
});

test("畳み込みに成功すると、新しい意味記憶と畳み込み済みの印が1回の書き込みで一緒に反映される", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(6));
  let input;
  assert.equal(await foldOnce(path, async (value) => (input = value, JSON.stringify(content())), () => true), "folded");
  assert.match(input, /## 今の全体像\n\{"topics":\[\],"struggles":\[\],"habits":\[\]\}/);
  assert.match(input, /- 2026-10-01: e1の要約/);
  const state = readMemory(path);
  assert.equal(state.semantic.revision, 1);
  assert.equal(state.semantic.semanticVersion, SEMANTIC_VERSION);
  assert.deepEqual(state.episodes.filter(({ foldedRevision }) => foldedRevision === 1).map(({ sessionId }) => sessionId), ["e1"]);
  // ファイルの中身を直接見て、両方が同じ書き込みに入っていることを確かめる。
  const raw = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(raw.semantic.revision, raw.episodes.find(({ sessionId }) => sessionId === "e1").foldedRevision);
  const prompt = formatMemoryPrompt(state, undefined);
  assert.match(prompt, /## 学習の全体像\n### テーマ\n- Python（学習中）: クラスまで。次は継承/);
  assert.doesNotMatch(prompt, /e1の要約/);
});

test("畳み込みに失敗したら、意味記憶も印も変わらず、あふれた分は注入に残る", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(7));
  const before = readFileSync(path, "utf8");
  for (const generate of [async () => undefined, async () => "形が違う", async () => JSON.stringify({ ...content(), topics: Array(6).fill(content().topics[0]) }), async () => { throw new Error("boom"); }]) {
    assert.equal(await foldOnce(path, generate, () => true), "failed");
    assert.equal(readFileSync(path, "utf8"), before);
  }
  const prompt = formatMemoryPrompt(readMemory(path), undefined);
  for (let index = 1; index <= 7; index++) assert.match(prompt, new RegExp(`e${index}の要約`));
});

test("畳み込みの間に別の処理が意味記憶を変えたら、保存せずにやり直しにする", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(6));
  const generate = async () => {
    // 先に別の sakunyan が畳み込みを終えて保存した状態を作る。
    await updateMemory(path, (state) => applyFold(state, 0, [state.episodes.find(({ sessionId }) => sessionId === "e1")], content("Go")));
    return JSON.stringify(content("Python"));
  };
  assert.equal(await foldOnce(path, generate, () => true), "failed");
  const state = readMemory(path);
  assert.equal(state.semantic.revision, 1);
  assert.equal(state.semantic.topics[0].name, "Go");
});

test("畳み込み対象のエピソードが途中で要約し直されたら反映しない", () => {
  const state = stateWith(6);
  const batch = selectEpisodesToFold(state);
  const changed = upsertEpisode(state, { ...batch[0], sessionModified: 99, summary: "再開後の要約" });
  assert.equal(applyFold(changed, 0, batch, content()), undefined);
  assert.equal(applyFold({ ...state, episodes: state.episodes.map((item) => ({ ...item, foldedRevision: item.sessionId === "e1" ? 1 : undefined })) }, 0, batch, content()), undefined);
});

test("版が違う意味記憶は空にし、印を外して残りのエピソードから作り直す", async () => {
  const outdated = { ...stateWith(6), semantic: { semanticVersion: SEMANTIC_VERSION + 1, revision: 4, updatedAt: "x", topics: [], struggles: [], habits: [] } };
  outdated.episodes[0].foldedRevision = 4;
  const reset = resetOutdatedSemantic(outdated);
  assert.equal(reset.semantic, null);
  assert.ok(reset.episodes.every(({ foldedRevision }) => foldedRevision === undefined));
  assert.equal(resetOutdatedSemantic(stateWith(6)), undefined);
});

test("裏の処理は、要約のあとにエピソードが5件以下になるまで畳み込む", async () => {
  const agentDir = tempAgentDir();
  const options = { sessionsDir: getSessionsDir(agentDir), memoryPath: getMemoryPath(agentDir), currentSessionFile: undefined };
  await seed(options.memoryPath, stateWith(15));
  writeSession(agentDir, { id: "new", mtime: 5_000 });
  const folds = [];
  const result = await runMemoryMaintenance({
    ...options,
    summarize: async () => "新しい要約。",
    fold: async (input) => (folds.push(input), JSON.stringify(content())),
  });
  // 16件のうち、まず古い10件、続けて超えた残りの1件を畳み込み、5件が残る。
  assert.deepEqual(result, { summarized: 1, folded: 2 });
  assert.equal(folds.length, 2);
  const state = readMemory(options.memoryPath);
  assert.equal(state.semantic.revision, 2);
  assert.equal(state.episodes.filter(({ foldedRevision }) => foldedRevision === undefined).length, 5);
});

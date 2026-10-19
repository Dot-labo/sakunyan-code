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
import { MAX_SEMANTIC_CHARS, missingTopics, parseFoldOutput, renderSemantic, SEMANTIC_VERSION, validateSemantic } from "../dist/semantic-memory.js";
import { writeSession } from "./fixtures/memory-sessions.js";

process.env.TZ = "Asia/Tokyo";

const tempAgentDir = () => mkdtempSync(join(tmpdir(), "sakunyan-semantic-"));
const episode = (sessionId, day, extra = {}) => ({
  sessionId, timestamp: `2026-10-${String(day).padStart(2, "0")}T03:00:00.000Z`, sessionModified: 1, summary: `${sessionId}の要約`, summaryVersion: SUMMARY_VERSION, ...extra,
});
const content = (name = "Python") => ({ topics: [{ name, status: "学習中", progress: "クラスまで" }], struggles: [], habits: [] });
const stateWith = (count, extra = {}) => ({ ...emptyMemory(), ...extra, episodes: Array.from({ length: count }, (_, index) => episode(`e${index + 1}`, index + 1)) });

async function seed(path, state) {
  assert.ok(await updateMemory(path, () => state));
}

test("意味記憶は決まった形・件数・文字数・分量・秘密情報を検証する", () => {
  assert.deepEqual(validateSemantic(content()), content());
  assert.equal(validateSemantic({ ...content(), topics: Array.from({ length: 6 }, (_, index) => content(`T${index}`).topics[0]) }), undefined);
  assert.equal(validateSemantic({ topics: [{ name: "Python", status: "完了", progress: "x" }], struggles: [], habits: [] }), undefined);
  assert.equal(validateSemantic({ topics: [{ name: "Python", status: "学習中", progress: "あ".repeat(101) }], struggles: [], habits: [] }), undefined);
  assert.equal(validateSemantic({ ...content(), struggles: ["a", "b", "c", "d"] }), undefined);
  assert.equal(validateSemantic({ ...content(), habits: ["キーは sk-abcdefghijklmnopqrstuv"] }), undefined);
  assert.equal(validateSemantic({ topics: [], struggles: [], habits: [] }).topics.length, 0);
  // 次にやることは持たないので、モデルが付けてきても捨てる。
  assert.deepEqual(validateSemantic({ topics: [{ name: "Python", status: "学習中", progress: "クラスまで", next: "継承" }], struggles: [], habits: [] }).topics[0], { name: "Python", status: "学習中", progress: "クラスまで" });
  // 5テーマ・3件・3件をすべて上限まで埋めると800文字を超えるので保存できない。
  const full = {
    topics: Array.from({ length: 5 }, (_, index) => ({ name: `テーマ${index}`.padEnd(20, "あ"), status: "学習中", progress: "い".repeat(100) })),
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
  assert.match(prompt, /## 学習の全体像\n### テーマ\n- Python（学習中）: クラスまで\n/);
  assert.doesNotMatch(prompt, /e1の要約/);
});

test("畳み込みに失敗したら、意味記憶も印も変わらず、あふれた分は注入に残る", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(7));
  const before = readFileSync(path, "utf8");
  for (const generate of [async () => undefined, async () => "形が違う", async () => JSON.stringify({ ...content(), topics: Array.from({ length: 9 }, (_, index) => content(`T${index}`).topics[0]) }), async () => { throw new Error("boom"); }]) {
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

test("決まりに合わない出力は、どこが違うかを伝えて1回だけ直してもらい、直れば反映する", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(6));
  const tooLong = { ...content(), topics: [{ name: "Python", status: "学習中", progress: "あ".repeat(110) }] };
  const inputs = [];
  const generate = async (input) => {
    inputs.push(input);
    return JSON.stringify(inputs.length === 1 ? tooLong : content());
  };
  assert.equal(await foldOnce(path, generate, () => true), "folded");
  assert.equal(inputs.length, 2);
  assert.ok(inputs[1].startsWith(inputs[0]));
  assert.match(inputs[1], /## 前回の出力（決まりに合っていないところがあります）/);
  assert.match(inputs[1], /「Python」 の progress が110文字です（最大100文字）/);
  assert.equal(readMemory(path).semantic.topics[0].progress, "クラスまで");
});

test("直してもらっても合わなければ失敗にし、JSONでない出力は直しを頼まない", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  await seed(path, stateWith(6));
  let calls = 0;
  const tooLong = JSON.stringify({ ...content(), topics: [{ name: "Python", status: "学習中", progress: "あ".repeat(110) }] });
  assert.equal(await foldOnce(path, async () => (calls += 1, tooLong), () => true), "failed");
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(await foldOnce(path, async () => (calls += 1, "JSONではありません"), () => true), "failed");
  assert.equal(calls, 1);
  assert.equal(readMemory(path).semantic, null);
});

test("取り込む記録のテーマが抜けているか、表記ゆれを同じとみなして調べる", () => {
  const json = JSON.stringify({ topics: [{ name: "Python" }, { name: "HTML/CSS" }] });
  assert.deepEqual(missingTopics(json, ["python", "CSS", "html・css", "Git"]), ["Git"]);
  assert.deepEqual(missingTopics("壊れた", ["Git"]), []);
});

test("取り込む記録のテーマが抜けていたら1回だけ直してもらい、直らなくても決まりに合う結果は使う", async () => {
  const agentDir = tempAgentDir();
  const path = getMemoryPath(agentDir);
  const state = stateWith(6);
  state.episodes = state.episodes.map((item) => ({ ...item, topic: item.sessionId === "e1" ? "Git" : "Python" }));
  await seed(path, state);
  const inputs = [];
  const withoutGit = JSON.stringify(content("Python"));
  const withGit = JSON.stringify({ ...content("Python"), topics: [...content("Python").topics, { name: "Git", status: "学習中", progress: "add と commit" }] });
  assert.equal(await foldOnce(path, async (input) => (inputs.push(input), inputs.length === 1 ? withoutGit : withGit), () => true), "folded");
  assert.match(inputs[0], /- 2026-10-01: 【Git】e1の要約/);
  assert.match(inputs[1], /テーマ「Git」が topics に入っていません/);
  // 最後に学んだ日が分かる Git（10/01）が、日付の分からない Python より前に並ぶ。
  assert.deepEqual(readMemory(path).semantic.topics.map(({ name, lastStudied }) => [name, lastStudied]), [["Git", "2026-10-01"], ["Python", undefined]]);

  // 直しても抜けているときは、失敗にせず、その記録の要約から1行作って入れる（畳み込みが止まらず、テーマも消えない）。
  const other = getMemoryPath(tempAgentDir());
  await seed(other, state);
  let calls = 0;
  assert.equal(await foldOnce(other, async () => (calls += 1, withoutGit), () => true), "folded");
  assert.equal(calls, 2);
  assert.deepEqual(readMemory(other).semantic.topics.map(({ name, progress }) => [name, progress]), [["Git", "e1の要約"], ["Python", "クラスまで"]]);
});

test("残すテーマはプログラムが決める: 前のテーマを戻し、学習中→一区切り→見送り、新しい順に5件", async () => {
  const { arrangeTopics } = await import("../dist/semantic-memory.js");
  const previous = [
    { name: "Scratch", status: "一区切り", progress: "ゲーム", lastStudied: "2026-09-03" },
    { name: "JavaScript", status: "見送り", progress: "やめた", lastStudied: "2026-09-10" },
    { name: "HTML/CSS", status: "学習中", progress: "背景色", lastStudied: "2026-10-04" },
    { name: "micro:bit", status: "一区切り", progress: "LED", lastStudied: "2026-09-08" },
    { name: "Python", status: "学習中", progress: "辞書まで", lastStudied: "2026-10-07" },
  ];
  // モデルは学習中の HTML/CSS を書き忘れ、新しい Git を入れた。
  const model = [
    { name: "Python", status: "学習中", progress: "クラスまで" },
    { name: "Scratch", status: "一区切り", progress: "ゲーム" },
    { name: "JavaScript", status: "見送り", progress: "やめた" },
    { name: "micro:bit", status: "一区切り", progress: "LED" },
    { name: "Git", status: "学習中", progress: "commit まで" },
  ];
  const folded = [{ timestamp: "2026-10-10T10:00:00.000Z", summary: "クラスを作った。", topic: "Pythonクラス" }, { timestamp: "2026-09-27T10:00:00.000Z", summary: "commit した。", topic: "Git" }];
  const topics = arrangeTopics(model, previous, folded);
  assert.deepEqual(topics.map(({ name, status, lastStudied }) => [name, status, lastStudied]), [
    ["Python", "学習中", "2026-10-10"],
    ["HTML/CSS", "学習中", "2026-10-04"],
    ["Git", "学習中", "2026-09-27"],
    ["micro:bit", "一区切り", "2026-09-08"],
    ["Scratch", "一区切り", "2026-09-03"],
  ]);
  assert.equal(topics.find(({ name }) => name === "HTML/CSS").progress, "背景色");
});

test("状態はプログラムが決める: 一番新しい記録の印、なければ前の状態、どちらもなければモデルの判断", async () => {
  const { arrangeTopics } = await import("../dist/semantic-memory.js");
  const previous = [{ name: "Git", status: "学習中", progress: "commit", lastStudied: "2026-09-27" }];
  // モデルは Scratch を「学習中」、Git を「一区切り」とまちがえた。
  const model = [
    { name: "Scratch", status: "学習中", progress: "ゲーム" },
    { name: "Git", status: "一区切り", progress: "commit" },
    { name: "JavaScript", status: "学習中", progress: "console.log" },
    { name: "Ruby", status: "見送り", progress: "少し見た" },
  ];
  const folded = [
    { timestamp: "2026-09-01T10:00:00.000Z", summary: "ネコを動かした。", topic: "Scratch" },
    { timestamp: "2026-09-03T10:00:00.000Z", summary: "ゲームを完成。", topic: "Scratch", topicStatus: "一区切り" },
    { timestamp: "2026-09-10T10:00:00.000Z", summary: "やめた。", topic: "JavaScript", topicStatus: "見送り" },
  ];
  const status = Object.fromEntries(arrangeTopics(model, previous, folded).map(({ name, status }) => [name, status]));
  assert.deepEqual(status, { Scratch: "一区切り", Git: "学習中", JavaScript: "見送り", Ruby: "見送り" });
});

test("古い会話があとから畳み込まれても、新しい記録で決まった状態を戻さない", async () => {
  const { arrangeTopics } = await import("../dist/semantic-memory.js");
  const previous = [{ name: "Scratch", status: "一区切り", progress: "ゲームを完成", lastStudied: "2026-09-03" }];
  const model = [{ name: "Scratch", status: "学習中", progress: "ネコとゲーム" }];
  const folded = [{ timestamp: "2026-09-01T10:00:00.000Z", summary: "ネコを動かした。", topic: "Scratch" }];
  const [scratch] = arrangeTopics(model, previous, folded);
  assert.deepEqual([scratch.status, scratch.lastStudied], ["一区切り", "2026-09-03"]);
  // 新しい記録が来たら、そちらで決める（再開した）。
  const [resumed] = arrangeTopics(model, previous, [{ timestamp: "2026-10-01T10:00:00.000Z", summary: "また始めた。", topic: "Scratch" }]);
  assert.deepEqual([resumed.status, resumed.lastStudied], ["学習中", "2026-10-01"]);
});

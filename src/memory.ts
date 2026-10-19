import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { containsSecret } from "./secrets.js";
import {
  arrangeTopics,
  buildFoldInput,
  buildRepairInput,
  checkFoldOutput,
  checkSemantic,
  isEmptySemantic,
  missingTopicProblem,
  missingTopics,
  renderSemantic,
  SEMANTIC_VERSION,
  validateSemantic,
  type SemanticContent,
  type TopicEnd,
} from "./semantic-memory.js";

// 記憶は2層だけ。
// - エピソード記憶: 過去のセッションを1件ずつ短く要約したもの。畳み込んでいない分をそのまま渡す。
// - 意味記憶: エピソードが増えてあふれた古い分を畳み込んだ、決まった形の1つの文書。
// セッションのログ（JSONL）は原本として読むだけで、変更しない。

export const NO_SUMMARY = "なし";
/** 要約の作り方（対象の条件やプロンプト）を変えたら上げる。版が違う、畳み込んでいないエピソードは要約し直す。 */
export const SUMMARY_VERSION = 9;
export const FORMAT_VERSION = 1;
/** 畳み込まずに残すエピソードの数。これを超えた古い分を意味記憶に畳み込む。 */
export const RECENT_EPISODES = 5;
export const MAX_FOLD_BATCH = 10;
export const MAX_SUMMARIES_PER_RUN = 5;
export const MAX_STORED_EPISODES = 200;
export const MAX_TRANSCRIPT_CHARS = 12_000;
export const MAX_SUMMARY_CHARS = 150;
// 1往復だけの会話（あいさつ、記録の読み上げ、使い方の質問）は学習の進み具合を含まないので要約しない。
export const MIN_USER_MESSAGES = 2;
// 起動のたびに全部のセッションを読まないよう、更新が新しい順にこの数だけを見る。
const MAX_SCANNED_SESSIONS = 50;
const HEADER_READ_BYTES = 4096;
const MAX_FOLDS_PER_RUN = 20;

export type Episode = {
  sessionId: string;
  /** セッションの最後のメッセージの日時（ISO 8601） */
  timestamp: string;
  /** 要約したときのセッションファイルの更新日時（ミリ秒） */
  sessionModified: number;
  summary: string;
  summaryVersion: number;
  /** 要約のときにモデルが付けたテーマ名（例: Python）。畳み込みでテーマが抜けていないかを確かめるのに使う */
  topic?: string;
  /** 利用者がこの会話でそのテーマを終わりにした・やめたときだけ付く。意味記憶のテーマの状態はこれで決める */
  topicStatus?: TopicEnd;
  /** 畳み込んだときの意味記憶の revision。ないものは畳み込んでいない */
  foldedRevision?: number;
};

export type SemanticMemory = SemanticContent & {
  semanticVersion: number;
  revision: number;
  updatedAt: string;
};

export type MemoryState = {
  formatVersion: number;
  episodes: Episode[];
  semantic: SemanticMemory | null;
};

export type SessionFile = { path: string; mtimeMs: number };

export type Transcript = {
  sessionId: string;
  lastTimestamp: string;
  userMessageCount: number;
  /** エラーで終わらなかったアシスタントの応答の数 */
  assistantMessageCount: number;
  text: string;
};

/** モデルへの単発の依頼。失敗したときは undefined を返す。 */
export type Generate = (input: string) => Promise<string | undefined>;

export const SUMMARY_SYSTEM_PROMPT = `あなたは、プログラミング学習の会話ログから、利用者の学習記録を1件作る係です。
会話ログは「利用者:」と「sakunyan:」（学習を手伝うAI）の発言でできています。

## 書くこと
- 先頭に【テーマ名】を付ける。テーマ名は言語・ツール・作品の名前だけにする（例: 【Python】【HTML/CSS】【Git】【Scratch】【じゃんけんゲーム】）。文法や機能の名前（【if文】【リスト】【Pythonクラス】など）にはしない
- 「これまでのテーマ名」が与えられたら、当てはまるものはその名前をそのまま使う
- 利用者がそのテーマを終わりにする・区切りをつけると言ったら【テーマ名・一区切り】、そのテーマをやめる・見送ると言ったら【テーマ名・見送り】と書く。その日の勉強をやめただけ（「今日はここまで」「また今度」）のときは付けない
- 日本語150文字以内、1〜2文。主語は利用者にする（「〜を練習した」「〜でつまずいた」）
- 利用者が実際に取り組んだこと、どこまで進んだか、次にやることを、事実だけで書く
- 次にやることは、会話の中で決まった場合だけ、会話の言葉どおりに書く（言いかえたり、くわしくしたりしない）。決まっていなければ何も書かない（「決まっていない」とも書かない）
- 利用者が実際にしたこと・言ったことを書く。sakunyanの推測（「〜のはず」「〜が原因かも」）は事実として書かない
- つまずいた点、混乱した点、間違えた点があれば必ず書く（解決したかどうかも書く）
- 「理解した」「できた」は、利用者が自分で書けた・動いたと言った場合だけ書く。説明を聞いただけなら「説明を受けた」と書く
- 何かを作りたい・学びたいと相談して答えやコードを受け取っただけでも、「〜を作りたいと相談し、完成したコードを受け取った（まだ自分では試していない）」のように書く

## 書かないこと
- 「理解力が高い」「準備ができている」などの評価や、「〜すると良いでしょう」などの助言
- sakunyanが過去の学習記録やプロファイルを読み上げたり、学習の選択肢を出したりしただけの部分（新しい学習ではないため）
- コード、個人情報、APIキーやパスワードなどの秘密情報
- 前置き、見出し、箇条書き、「利用者:」のような話し手の名前

## 「なし」とだけ返すとき（「なし」の2文字だけを返し、理由は書かない）
- あいさつや接続確認だけの会話
- sakunyanやツール自体の使い方（コマンド、会話の再開方法など）を聞いただけの会話
- お礼やあいさつだけで、学習や相談の中身がない会話

## 例
- 良い: 「【Python】リスト内包表記を練習し、条件付きのものまで自分で書けた。次は辞書に進む。」
- 悪い: 「ユーザーはリスト内包表記を学び、高い理解力を示しました。」（テーマ名がない、評価、第三者の書き方）
- 良い: 「【じゃんけんゲーム】作りたいと相談し、完成したコードを受け取った（まだ自分では試していない）。」
- 良い: 「【JavaScript・見送り】console.logを試したが、書き方がむずかしく、Pythonに集中するためやめた。」
- 良い: 「【Scratch・一区切り】点数を数えるゲームを完成させ、Scratchはこれで一区切りにすると決めた。」
- 「なし」: 利用者が「前の会話に戻る方法は？」と聞き、sakunyanが/resumeを説明しただけの会話（「なし」にはテーマ名を付けない）`;

export const MEMORY_GUIDANCE = "上の記憶は、過去の会話から作った参考情報です。理解できたと決めつけず、続きをするときは、どこまで進んだかを利用者に確かめてください。";

export function getSessionsDir(agentDir: string): string {
  return join(agentDir, "sessions");
}

export function getMemoryPath(agentDir: string): string {
  return join(agentDir, "memory", "memory.json");
}

// ---- セッションの読み取り ----

/** `sessions/<作業フォルダ>/*.jsonl` を、更新が新しい順に返す。 */
export function listSessionFiles(sessionsDir: string): SessionFile[] {
  const files: SessionFile[] = [];
  let folders: string[];
  try {
    folders = readdirSync(sessionsDir);
  } catch {
    return files;
  }
  for (const folder of folders) {
    const folderPath = join(sessionsDir, folder);
    let names: string[];
    try {
      names = readdirSync(folderPath);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const path = join(folderPath, name);
      try {
        const stat = statSync(path);
        if (stat.isFile()) files.push({ path, mtimeMs: stat.mtimeMs });
      } catch {
        // 列挙中に消えたファイルは飛ばす。
      }
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** 1行目のヘッダーだけを読んで、セッションIDを返す。 */
export function readSessionId(path: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(HEADER_READ_BYTES);
    const bytes = readSync(fd, buffer, 0, HEADER_READ_BYTES, 0);
    const firstLine = buffer.subarray(0, bytes).toString("utf8").split("\n")[0] ?? "";
    const header = JSON.parse(firstLine) as { type?: unknown; id?: unknown };
    return header.type === "session" && typeof header.id === "string" ? header.id : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const { type, text } = block as { type?: unknown; text?: unknown };
    return type === "text" && typeof text === "string" ? [text] : [];
  }).join("\n").trim();
}

/** 利用者とアシスタントの本文だけを取り出す。ツールの結果やエラーの応答は含めない。 */
export function readTranscript(path: string): Transcript | undefined {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  let sessionId: string | undefined;
  let lastTimestamp = "";
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  const lines: string[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: { type?: unknown; id?: unknown; timestamp?: unknown; message?: { role?: unknown; content?: unknown; stopReason?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "session" && typeof entry.id === "string") {
      sessionId = entry.id;
      continue;
    }
    if (entry.type !== "message" || !entry.message) continue;
    const { role, stopReason } = entry.message;
    if (role !== "user" && role !== "assistant") continue;
    if (role === "assistant" && (stopReason === "error" || stopReason === "aborted")) continue;
    const text = textOf(entry.message.content);
    if (!text) continue;
    if (role === "user") userMessageCount += 1;
    else assistantMessageCount += 1;
    if (typeof entry.timestamp === "string") lastTimestamp = entry.timestamp;
    lines.push(`${role === "user" ? "利用者" : "sakunyan"}: ${text}`);
  }
  if (!sessionId) return undefined;
  const text = lines.join("\n\n");
  return {
    sessionId,
    lastTimestamp,
    userMessageCount,
    assistantMessageCount,
    text: text.length > MAX_TRANSCRIPT_CHARS ? text.slice(-MAX_TRANSCRIPT_CHARS) : text,
  };
}

/** 学習の記録になりうる会話か。利用者が2回以上話し、sakunyanが1回以上きちんと答えたものだけ。 */
export function isSummarizable(transcript: Transcript): boolean {
  return transcript.userMessageCount >= MIN_USER_MESSAGES && transcript.assistantMessageCount >= 1;
}

// ---- 要約 ----

/** モデルの出力を1行にまとめ、150文字以内の最後の「。」で切る。秘密情報を含むときは「なし」にする。 */
export function normalizeSummary(output: string): string | undefined {
  const text = output
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\s*\n\s*/g, " ")
    .trim()
    // 会話ログの書き方をまねて付いた話し手の名前と、先頭の【テーマ名】を取る（テーマ名は別に持つ）。
    .replace(/^(?:利用者|sakunyan|要約)\s*[:：]\s*/i, "")
    .replace(/^【[^】]{1,30}】\s*/, "")
    // 「次にやることは決まっていない」のような中身のない文は取る（試用で確認）。
    .replace(/[^。]*次に(?:やること|取り組むこと|すること)は?(?:まだ|特に)?(?:決まっていない|未定|ない)(?:です)?。?/g, "")
    .trim();
  if (!text) return undefined;
  if (/^なし[。.]?$/.test(text)) return NO_SUMMARY;
  // 要約の代わりに「なしにした理由」を返してきたものは、要約として使わない（試用で確認）。
  if (/^なし[。.、:：]/.test(text) || /(?:ため|から)(?:、)?「?なし」?(?:とする|です)?。?$/.test(text) || /していないため。?$/.test(text)) return NO_SUMMARY;
  if (containsSecret(text)) return NO_SUMMARY;
  const characters = [...text];
  if (characters.length <= MAX_SUMMARY_CHARS) return text;
  // 文の途中で切れないよう、150文字以内に「。」があればそこまでにする。
  const head = characters.slice(0, MAX_SUMMARY_CHARS).join("");
  const sentenceEnd = head.lastIndexOf("。");
  return sentenceEnd > 0 ? head.slice(0, sentenceEnd + 1) : head;
}

const TOPIC_LABEL = /^\s*(?:(?:利用者|sakunyan|要約)\s*[:：]\s*)?【([^】]{1,30})】\s*/i;
const TOPIC_END = /^(.+?)\s*[・･:：]\s*(一区切り|見送り)$/;

/** 要約の先頭の【テーマ名】（と、付いていれば「・一区切り」「・見送り」）を取り出す。 */
export function extractTopicLabel(output: string): { topic: string; topicStatus?: TopicEnd } | undefined {
  const label = TOPIC_LABEL.exec(output.replace(/```[a-z]*\n?/gi, "").trim())?.[1]?.replace(/\s+/g, " ").trim();
  if (!label || containsSecret(label)) return undefined;
  const ended = TOPIC_END.exec(label);
  const topic = (ended?.[1] ?? label).trim();
  if (!topic) return undefined;
  return ended ? { topic, topicStatus: ended[2] as TopicEnd } : { topic };
}

/** 要約の先頭の【テーマ名】を取り出す。なければ undefined。 */
export function extractTopic(output: string): string | undefined {
  return extractTopicLabel(output)?.topic;
}

export type SummaryResult = { summary: string; topic?: string; topicStatus?: TopicEnd };

/** 要約の入力。テーマ名がばらつかないよう、これまでのテーマ名を添える（試用で「リスト」などが別テーマになった）。 */
export function buildSummaryInput(transcript: Transcript, knownTopics: readonly string[] = []): string {
  if (!knownTopics.length) return transcript.text;
  return `## これまでのテーマ名（当てはまるならこの名前を使う）\n${knownTopics.join("、")}\n\n## 会話ログ\n${transcript.text}`;
}

/** 意味記憶と、エピソードに付いたテーマ名（新しい順、重複なし、最大10件）。 */
export function knownTopicNames(state: MemoryState): string[] {
  const names: string[] = [];
  const add = (name: string | undefined) => {
    if (name && !names.some((known) => known.toLowerCase() === name.toLowerCase())) names.push(name);
  };
  [...state.episodes].sort(byNewest).forEach(({ topic }) => add(topic));
  state.semantic?.topics.forEach(({ name }) => add(name));
  return names.slice(0, 10);
}

export async function summarizeTranscript(transcript: Transcript, generate: Generate, knownTopics: readonly string[] = []): Promise<SummaryResult | undefined> {
  try {
    const output = await generate(buildSummaryInput(transcript, knownTopics));
    if (output === undefined) return undefined;
    const summary = normalizeSummary(output);
    if (summary === undefined) return undefined;
    const label = summary === NO_SUMMARY ? undefined : extractTopicLabel(output);
    return label ? { summary, ...label } : { summary };
  } catch {
    return undefined;
  }
}

export type SummaryCandidate = { file: SessionFile; transcript: Transcript };

/**
 * 注入と畳み込みに使うエピソード（「なし」以外）。版が古くても、要約し直されるまではそのまま使う。
 * 外してしまうと、要約し直すまでの間、その内容がどこにも見えなくなるため。
 */
export function isUsableEpisode(episode: Episode): boolean {
  return episode.summary !== NO_SUMMARY;
}

/** 要約する優先度。0 = 未要約か再開された、1 = 版だけが古い（「なし」以外）、2 = 版だけが古い「なし」。undefined は不要。 */
function summaryPriority(episode: Episode | undefined, mtimeMs: number): number | undefined {
  if (!episode || mtimeMs > episode.sessionModified) return 0;
  // 畳み込み済みのものは、中身がもう意味記憶にあるので、版が古くても要約し直さない（二重に反映しないため）。
  if (episode.foldedRevision !== undefined || episode.summaryVersion === SUMMARY_VERSION) return undefined;
  return episode.summary === NO_SUMMARY ? 2 : 1;
}

/**
 * 今のセッション以外で、要約が必要で要約できるものを最大5件選ぶ。
 * 未要約・再開されたものを先にし、版だけが古いものはそのあと（それぞれ更新が新しい順）。
 */
export function selectSessionsToSummarize(
  files: readonly SessionFile[],
  state: MemoryState,
  currentSessionFile: string | undefined,
  limit = MAX_SUMMARIES_PER_RUN,
): SummaryCandidate[] {
  const stored = new Map(state.episodes.map((episode) => [episode.sessionId, episode]));
  const ranked: (SummaryCandidate & { priority: number })[] = [];
  for (const file of [...files].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_SCANNED_SESSIONS)) {
    if (file.path === currentSessionFile) continue;
    const sessionId = readSessionId(file.path);
    const priority = sessionId === undefined ? undefined : summaryPriority(stored.get(sessionId), file.mtimeMs);
    if (priority === undefined) continue;
    const transcript = readTranscript(file.path);
    if (!transcript || !isSummarizable(transcript)) continue;
    ranked.push({ file, transcript, priority });
  }
  return ranked
    .sort((a, b) => a.priority - b.priority || b.file.mtimeMs - a.file.mtimeMs)
    .slice(0, limit)
    .map(({ file, transcript }) => ({ file, transcript }));
}

// ---- 保存 ----

export function emptyMemory(): MemoryState {
  return { formatVersion: FORMAT_VERSION, episodes: [], semantic: null };
}

function isEpisode(value: unknown): value is Episode {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.sessionId === "string"
    && typeof entry.timestamp === "string"
    && typeof entry.sessionModified === "number"
    && typeof entry.summary === "string"
    && typeof entry.summaryVersion === "number"
    && (entry.foldedRevision === undefined || typeof entry.foldedRevision === "number")
    && (entry.topic === undefined || typeof entry.topic === "string")
    && (entry.topicStatus === undefined || entry.topicStatus === "一区切り" || entry.topicStatus === "見送り");
}

function readSemanticMemory(value: unknown): SemanticMemory | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.semanticVersion !== "number" || typeof raw.revision !== "number" || typeof raw.updatedAt !== "string") return undefined;
  // 版が違うものは中身の形も違いうるので、検証せずに版だけ持っておき、作り直しの対象にする。
  if (raw.semanticVersion !== SEMANTIC_VERSION) {
    return { semanticVersion: raw.semanticVersion, revision: raw.revision, updatedAt: raw.updatedAt, topics: [], struggles: [], habits: [] };
  }
  const content = validateSemantic(raw);
  return content ? { ...content, semanticVersion: raw.semanticVersion, revision: raw.revision, updatedAt: raw.updatedAt } : undefined;
}

/** ファイルがなければ空の記憶、壊れているか形が不正なら undefined を返す。 */
export function readMemory(path: string): MemoryState | undefined {
  let content: string;
  try {
    if (!existsSync(path)) return emptyMemory();
    content = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || parsed.formatVersion !== FORMAT_VERSION || !Array.isArray(parsed.episodes)) return undefined;
    const semantic = readSemanticMemory(parsed.semantic);
    if (semantic === undefined) return undefined;
    return { formatVersion: FORMAT_VERSION, episodes: parsed.episodes.filter(isEpisode), semantic };
  } catch {
    return undefined;
  }
}

/**
 * ロックの中で最新の記憶を読み直し、mutate の結果を一時ファイルから置き換える。
 * mutate が undefined を返したら何も書かない。壊れたファイルは上書きしない。
 */
export async function updateMemory(path: string, mutate: (state: MemoryState) => MemoryState | undefined): Promise<boolean> {
  const directory = dirname(path);
  let release: (() => Promise<void>) | undefined;
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    release = await lockfile.lock(directory, {
      realpath: false,
      lockfilePath: `${path}.lock`,
      retries: { retries: 10, minTimeout: 20, maxTimeout: 200 },
    });
    const current = readMemory(path);
    if (!current) return false;
    const next = mutate(current);
    if (!next) return false;
    const tempPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, path);
    return true;
  } catch {
    return false;
  } finally {
    await release?.().catch(() => undefined);
  }
}

function byNewest(a: { timestamp: string }, b: { timestamp: string }): number {
  return Date.parse(b.timestamp) - Date.parse(a.timestamp);
}

/** 同じセッションのエピソードは置き換える（畳み込み済みの印も外れる）。上限は畳み込み済みの古いものから削る。 */
export function upsertEpisode(state: MemoryState, episode: Episode): MemoryState {
  const episodes = [...state.episodes.filter(({ sessionId }) => sessionId !== episode.sessionId), episode].sort(byNewest);
  let overflow = episodes.length - MAX_STORED_EPISODES;
  for (let index = episodes.length - 1; index >= 0 && overflow > 0; index--) {
    if (episodes[index]?.foldedRevision !== undefined) {
      episodes.splice(index, 1);
      overflow -= 1;
    }
  }
  return { ...state, episodes };
}

// ---- 畳み込み ----

/** 版が違う意味記憶は空にして、すべての畳み込み済みの印を外す（残っているエピソードから作り直す）。 */
export function resetOutdatedSemantic(state: MemoryState): MemoryState | undefined {
  if (!state.semantic || state.semantic.semanticVersion === SEMANTIC_VERSION) return undefined;
  return {
    ...state,
    semantic: null,
    episodes: state.episodes.map(({ foldedRevision: _folded, ...episode }) => episode),
  };
}

/** 畳み込んでいない使えるエピソードが5件を超えたら、古い順に超えた分（最大10件）を返す。 */
export function selectEpisodesToFold(state: MemoryState): Episode[] {
  const unfolded = state.episodes
    .filter((episode) => episode.foldedRevision === undefined && isUsableEpisode(episode))
    .sort((a, b) => -byNewest(a, b));
  const overflow = unfolded.length - RECENT_EPISODES;
  return overflow > 0 ? unfolded.slice(0, Math.min(overflow, MAX_FOLD_BATCH)) : [];
}

export function semanticRevision(state: MemoryState): number {
  return state.semantic?.revision ?? 0;
}

/**
 * 畳み込みの結果を反映する。始めたときから意味記憶も対象のエピソードも変わっていないときだけ、
 * 新しい意味記憶と畳み込み済みの印を一緒に返す。変わっていたら undefined（何も書かない）。
 */
export function applyFold(
  state: MemoryState,
  expectedRevision: number,
  folded: readonly Episode[],
  content: SemanticContent,
  now = new Date(),
): MemoryState | undefined {
  if (semanticRevision(state) !== expectedRevision) return undefined;
  if (state.semantic && state.semantic.semanticVersion !== SEMANTIC_VERSION) return undefined;
  const current = new Map(state.episodes.map((episode) => [episode.sessionId, episode]));
  for (const episode of folded) {
    const latest = current.get(episode.sessionId);
    if (!latest || latest.foldedRevision !== undefined || latest.sessionModified !== episode.sessionModified || latest.summary !== episode.summary) {
      return undefined;
    }
  }
  const revision = expectedRevision + 1;
  const foldedIds = new Set(folded.map(({ sessionId }) => sessionId));
  return {
    ...state,
    semantic: { ...content, semanticVersion: SEMANTIC_VERSION, revision, updatedAt: now.toISOString() },
    episodes: state.episodes.map((episode) => (foldedIds.has(episode.sessionId) ? { ...episode, foldedRevision: revision } : episode)),
  };
}

function currentSemanticContent(state: MemoryState): SemanticContent | undefined {
  if (!state.semantic || state.semantic.semanticVersion !== SEMANTIC_VERSION) return undefined;
  const { topics, struggles, habits } = state.semantic;
  return { topics, struggles, habits };
}

export async function foldOnce(memoryPath: string, generate: Generate, isCurrent: () => boolean): Promise<"folded" | "nothing" | "failed"> {
  const state = readMemory(memoryPath);
  if (!state) return "failed";
  const batch = selectEpisodesToFold(state);
  if (!batch.length) return "nothing";
  const revision = semanticRevision(state);
  let content: SemanticContent | undefined;
  const previous = currentSemanticContent(state);
  // モデルの結果に、残すテーマの選び方をプログラムで当ててから、決まり（5件、800文字など）を調べる。
  const arrange = (check: ReturnType<typeof checkFoldOutput> | undefined) => {
    if (!check?.content) return undefined;
    return checkSemantic({ ...check.content, topics: arrangeTopics(check.content.topics, previous?.topics ?? [], batch) });
  };
  try {
    const input = buildFoldInput(previous, batch);
    const output = await generate(input);
    const first = output === undefined ? undefined : checkFoldOutput(output);
    const firstArranged = arrange(first);
    content = firstArranged?.content;
    // 決まりに合わない（長すぎるなど）か、取り込む記録のテーマが抜けているときは、
    // どこが違うかを伝えて1回だけ直してもらう。
    // - 直さずに捨て続けると、学ぶほど長くなる progress で畳み込みが永久に失敗してしまう（試用で確認）。
    // - テーマが抜けるのは、テーマが5件を超えたときに学習中の新しいテーマが捨てられたため（試用で確認）。
    //   直しても抜けているときは、決まりに合う結果を捨てずに使う（失敗し続けないため）。
    const missing = first?.json ? missingTopics(first.json, batch.flatMap(({ topic }) => (topic ? [topic] : []))) : [];
    const problems = [...(first?.problems ?? []), ...(firstArranged?.problems ?? []), ...missing.map(missingTopicProblem)];
    if (first?.json && problems.length && isCurrent()) {
      const repaired = await generate(buildRepairInput(input, first.json, problems));
      const secondArranged = arrange(repaired === undefined ? undefined : checkFoldOutput(repaired));
      if (secondArranged?.content) content = secondArranged.content;
    }
  } catch {
    content = undefined;
  }
  if (!content || !isCurrent()) return "failed";
  const result = content;
  const ok = await updateMemory(memoryPath, (latest) => applyFold(latest, revision, batch, result));
  return ok ? "folded" : "failed";
}

// ---- 裏の処理 ----

export type RunMemoryOptions = {
  sessionsDir: string;
  memoryPath: string;
  currentSessionFile: string | undefined;
  summarize: Generate;
  fold: Generate;
  /** セッションが終了・交換されたら false を返す。 */
  isCurrent?: () => boolean;
};

export type RunMemoryResult = { summarized: number; folded: number };

/** 要約が必要なセッションを要約し、そのあとエピソードが5件以下になるまで畳み込む。失敗した分は次の起動でやり直す。 */
export async function runMemoryMaintenance(options: RunMemoryOptions): Promise<RunMemoryResult> {
  const isCurrent = options.isCurrent ?? (() => true);
  const result: RunMemoryResult = { summarized: 0, folded: 0 };
  const state = readMemory(options.memoryPath);
  if (!state) return result;
  if (resetOutdatedSemantic(state)) await updateMemory(options.memoryPath, resetOutdatedSemantic);

  const candidates = selectSessionsToSummarize(listSessionFiles(options.sessionsDir), state, options.currentSessionFile);
  const knownTopics = knownTopicNames(state);
  for (const { file, transcript } of candidates) {
    if (!isCurrent()) return result;
    const made = await summarizeTranscript(transcript, options.summarize, knownTopics);
    if (made?.topic && !knownTopics.some((name) => name.toLowerCase() === made.topic?.toLowerCase())) knownTopics.unshift(made.topic);
    if (made === undefined || !isCurrent()) continue;
    const episode: Episode = {
      sessionId: transcript.sessionId,
      timestamp: transcript.lastTimestamp || new Date(file.mtimeMs).toISOString(),
      sessionModified: file.mtimeMs,
      summary: made.summary,
      summaryVersion: SUMMARY_VERSION,
      ...(made.topic ? { topic: made.topic } : {}),
      ...(made.topicStatus ? { topicStatus: made.topicStatus } : {}),
    };
    if (await updateMemory(options.memoryPath, (latest) => upsertEpisode(latest, episode))) result.summarized += 1;
  }

  for (let attempt = 0; attempt < MAX_FOLDS_PER_RUN && isCurrent(); attempt++) {
    const outcome = await foldOnce(options.memoryPath, options.fold, isCurrent);
    if (outcome !== "folded") break;
    result.folded += 1;
  }
  return result;
}

// ---- 注入 ----

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 意味記憶と、畳み込んでいないエピソード（今のセッションと「なし」を除く）を、注入する形にする。 */
export function formatMemoryPrompt(state: MemoryState | undefined, currentSessionId: string | undefined): string {
  if (!state) return "";
  const sections: string[] = [];
  const semantic = currentSemanticContent(state);
  if (semantic && !isEmptySemantic(semantic)) sections.push(`## 学習の全体像\n${renderSemantic(semantic)}`);
  const recent = state.episodes
    .filter((episode) => episode.foldedRevision === undefined && isUsableEpisode(episode)
      && episode.sessionId !== currentSessionId && !Number.isNaN(Date.parse(episode.timestamp)))
    .sort(byNewest);
  if (recent.length) {
    sections.push(["## 最近の学習（新しい順）", ...recent.map(({ timestamp, summary, topic, topicStatus }) =>
      `- ${formatDate(timestamp)}: ${topic ? `【${topic}${topicStatus ? `・${topicStatus}` : ""}】` : ""}${summary}`)].join("\n"));
  }
  if (!sections.length) return "";
  return [...sections, MEMORY_GUIDANCE].join("\n\n");
}

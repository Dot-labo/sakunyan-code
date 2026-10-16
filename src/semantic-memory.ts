import { containsSecret } from "./secrets.js";

// 意味記憶: 直近のエピソードより前の学習を、決まった形と分量でまとめた1つの文書。
// 形が自由だとモデルが書き直すたびに崩れるので、区分と件数・文字数を固定し、プログラムで検証する。

/** 形や畳み込みの指示を変えたら上げる。版が違う意味記憶は作り直す。 */
export const SEMANTIC_VERSION = 1;
export const TOPIC_STATUSES = ["学習中", "一区切り", "見送り"] as const;
export const MAX_TOPICS = 5;
export const MAX_TOPIC_NAME_CHARS = 20;
export const MAX_PROGRESS_CHARS = 80;
export const MAX_NEXT_CHARS = 40;
export const MAX_NOTES = 3;
export const MAX_NOTE_CHARS = 60;
export const MAX_SEMANTIC_CHARS = 800;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type Topic = { name: string; status: TopicStatus; progress: string; next?: string };
export type SemanticContent = {
  topics: Topic[];
  /** つまずきやすい点 */
  struggles: string[];
  /** 学び方の傾向 */
  habits: string[];
};

export const FOLD_SYSTEM_PROMPT = `あなたは、プログラミング学習者の「学習の全体像」を書き直す係です。
今の全体像（JSON）と、新しく取り込む学習記録（古い順、日付付き）を受け取り、新しい全体像をJSONだけで返してください。

## 形（この形以外は受け付けられません）
{"topics":[{"name":"テーマ名","status":"学習中|一区切り|見送り","progress":"どこまで進んだか","next":"次にやること"}],"struggles":["つまずきやすい点"],"habits":["学び方の傾向"]}
- topics: 最大${MAX_TOPICS}件。name は${MAX_TOPIC_NAME_CHARS}文字以内、progress は${MAX_PROGRESS_CHARS}文字以内、next は${MAX_NEXT_CHARS}文字以内（決まっていなければ省く）
- status は「学習中」「一区切り」「見送り」のどれか
- struggles と habits: それぞれ最大${MAX_NOTES}件、各${MAX_NOTE_CHARS}文字以内。なければ空の配列

## 書き直し方
- 今の全体像の内容と新しい学習記録を合わせて、上の分量に収める
- 同じテーマ（同じ言語・同じ作品など）は1つにまとめ、進み具合は新しい記録で上書きする
- 入りきらないときは、古くて重要でない「一区切り」「見送り」のテーマから省く
- struggles には、何度か出てきたつまずきだけを書く。habits には、記録から分かる学び方（例: 自分で書いて確かめたい）だけを書く
- 学習記録と今の全体像にないことは書かない。評価や助言は書かない
- コード、個人情報、APIキーやパスワードなどの秘密情報は書かない
- JSON以外（前置き、説明、コードフェンス）は返さない`;

function cleanText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || [...text].length > maxChars) return undefined;
  return text;
}

function cleanNotes(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_NOTES) return undefined;
  const notes: string[] = [];
  for (const item of value) {
    const note = cleanText(item, MAX_NOTE_CHARS);
    if (!note) return undefined;
    notes.push(note);
  }
  return notes;
}

/** 決まった形・件数・文字数・分量に合い、秘密情報を含まないときだけ返す。1つでも合わなければ undefined。 */
export function validateSemantic(value: unknown): SemanticContent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.topics) || raw.topics.length > MAX_TOPICS) return undefined;
  const topics: Topic[] = [];
  for (const item of raw.topics) {
    if (!item || typeof item !== "object") return undefined;
    const topic = item as Record<string, unknown>;
    const name = cleanText(topic.name, MAX_TOPIC_NAME_CHARS);
    const progress = cleanText(topic.progress, MAX_PROGRESS_CHARS);
    const status = TOPIC_STATUSES.find((candidate) => candidate === topic.status);
    if (!name || !progress || !status) return undefined;
    const hasNext = topic.next !== undefined && topic.next !== null && topic.next !== "";
    const next = hasNext ? cleanText(topic.next, MAX_NEXT_CHARS) : undefined;
    if (hasNext && !next) return undefined;
    topics.push(next ? { name, status, progress, next } : { name, status, progress });
  }
  const struggles = cleanNotes(raw.struggles);
  const habits = cleanNotes(raw.habits);
  if (!struggles || !habits) return undefined;
  const content = { topics, struggles, habits };
  const rendered = renderSemantic(content);
  if ([...rendered].length > MAX_SEMANTIC_CHARS || containsSecret(rendered)) return undefined;
  return content;
}

/** 注入する形に整える（見出し「## 学習の全体像」の下に入る部分）。 */
export function renderSemantic(content: SemanticContent): string {
  const sections: string[] = [];
  if (content.topics.length) {
    sections.push(["### テーマ", ...content.topics.map(({ name, status, progress, next }) =>
      `- ${name}（${status}）: ${progress}${next ? `。次は${next}` : ""}`)].join("\n"));
  }
  if (content.struggles.length) sections.push(["### つまずきやすい点", ...content.struggles.map((note) => `- ${note}`)].join("\n"));
  if (content.habits.length) sections.push(["### 学び方の傾向", ...content.habits.map((note) => `- ${note}`)].join("\n"));
  return sections.join("\n");
}

export function isEmptySemantic(content: SemanticContent): boolean {
  return !content.topics.length && !content.struggles.length && !content.habits.length;
}

export type FoldEpisode = { timestamp: string; summary: string };

/** 畳み込みでモデルに渡す入力。今の全体像と、取り込む学習記録（古い順）。 */
export function buildFoldInput(current: SemanticContent | undefined, episodes: readonly FoldEpisode[]): string {
  const now = current ?? { topics: [], struggles: [], habits: [] };
  return [
    "## 今の全体像",
    JSON.stringify(now),
    "",
    "## 新しく取り込む学習記録（古い順）",
    ...episodes.map(({ timestamp, summary }) => `- ${timestamp.slice(0, 10)}: ${summary}`),
  ].join("\n");
}

/** モデルの出力から最初のJSONオブジェクトを取り出して検証する。 */
export function parseFoldOutput(output: string): SemanticContent | undefined {
  const text = output.replace(/```[a-z]*\n?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return validateSemantic(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

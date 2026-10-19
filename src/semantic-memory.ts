import { containsSecret } from "./secrets.js";

// 意味記憶: 直近のエピソードより前の学習を、決まった形と分量でまとめた1つの文書。
// 形が自由だとモデルが書き直すたびに崩れるので、区分と件数・文字数を固定し、プログラムで検証する。
// 「次にやること」は持たない。新しいほど正しい情報なので、最近の学習（エピソード）に任せる。
// 古い記録を畳み込むたびに次にやることを書かせると、モデルが記録にない予定を作ってしまった（試用で確認）。

/** 形や畳み込みの指示を変えたら上げる。版が違う意味記憶は作り直す。 */
export const SEMANTIC_VERSION = 7;
export const TOPIC_STATUSES = ["学習中", "一区切り", "見送り"] as const;
export const MAX_TOPICS = 5;
export const MAX_TOPIC_NAME_CHARS = 20;
export const MAX_PROGRESS_CHARS = 100;
export const MAX_NOTES = 3;
export const MAX_NOTE_CHARS = 60;
export const MAX_SEMANTIC_CHARS = 800;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export type Topic = { name: string; status: TopicStatus; progress: string };
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
{"topics":[{"name":"テーマ名","status":"学習中|一区切り|見送り","progress":"どこまで学んだか"}],"struggles":["つまずきやすい点"],"habits":["学び方の傾向"]}
- topics: 最大${MAX_TOPICS}件。name は${MAX_TOPIC_NAME_CHARS}文字以内、progress は${MAX_PROGRESS_CHARS}文字以内
- status は「学習中」「一区切り」「見送り」のどれか
- struggles と habits: それぞれ最大${MAX_NOTES}件、各${MAX_NOTE_CHARS}文字以内。なければ空の配列

## 書き直し方
- 今の全体像の内容と新しい学習記録を合わせて、上の分量に収める
- テーマは言語や作品ごとに分ける（例: 「Python」「JavaScript」「テトリス作り」）。同じテーマは1つにまとめる
- 途中でやめたもの・見送ったものも、status を「見送り」にしてテーマとして残す（なぜやめたかを progress に書く）
- progress には、そのテーマで最初から学んだ範囲を通して書く（今の全体像にある古い範囲を消さず、新しい記録の範囲を足す）
- progress が${MAX_PROGRESS_CHARS}文字を超えそうなら、古い細かい項目をまとめて短くする（例: 「変数、if文、for文、リスト」→「基礎文法（変数〜リスト）」）
- 次にやることや予定は書かない（最近の記録に任せる）
- 入りきらないときは、古くて重要でない「一区切り」「見送り」のテーマから省く
- struggles には、何度か出てきたつまずきだけを書く。habits には、記録から分かる学び方（例: 自分で書いて確かめたい）だけを書く
- 学習記録と今の全体像にないことは書かない。評価や助言は書かない
- コード、個人情報、APIキーやパスワードなどの秘密情報は書かない
- JSON以外（前置き、説明、コードフェンス）は返さない

## 例
学習記録:
- 2026-10-01: Pythonのfor文を練習した。rangeの終わりが含まれない点で混乱した。
- 2026-10-02: JavaScriptのconsole.logを試したが、Pythonとの違いに戸惑い、Pythonに集中することにした。
- 2026-10-03: Pythonのリストでappendとlenを使えた。
返すJSON:
{"topics":[{"name":"Python","status":"学習中","progress":"for文（range）、リストのappendとlen"},{"name":"JavaScript","status":"見送り","progress":"console.logを試したが、Pythonとの違いに戸惑い、Pythonに集中するため見送った"}],"struggles":["rangeの終わりの数が含まれない点"],"habits":[]}`;

const length = (text: string) => [...text].length;
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

export type SemanticCheck = { content?: SemanticContent; problems: string[] };

/**
 * 決まった形・件数・文字数・分量に合い、秘密情報を含まないかを調べる。
 * 合わないところは、モデルに直してもらうときにそのまま渡せる文で返す。
 */
export function checkSemantic(value: unknown): SemanticCheck {
  const problems: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { problems: ["JSONオブジェクトではありません"] };
  const raw = value as Record<string, unknown>;
  const topics: Topic[] = [];
  if (!Array.isArray(raw.topics)) problems.push("topics が配列ではありません");
  else {
    if (raw.topics.length > MAX_TOPICS) problems.push(`topics が${raw.topics.length}件あります（最大${MAX_TOPICS}件）`);
    raw.topics.forEach((item, index) => {
      const topic = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const label = typeof topic.name === "string" && topic.name.trim() ? `「${topic.name.trim()}」` : `${index + 1}件目`;
      const name = typeof topic.name === "string" ? oneLine(topic.name) : "";
      const progress = typeof topic.progress === "string" ? oneLine(topic.progress) : "";
      const status = TOPIC_STATUSES.find((candidate) => candidate === topic.status);
      if (!name) problems.push(`${label} のテーマに name がありません`);
      else if (length(name) > MAX_TOPIC_NAME_CHARS) problems.push(`${label} の name が${length(name)}文字です（最大${MAX_TOPIC_NAME_CHARS}文字）`);
      if (!progress) problems.push(`${label} に progress がありません`);
      else if (length(progress) > MAX_PROGRESS_CHARS) problems.push(`${label} の progress が${length(progress)}文字です（最大${MAX_PROGRESS_CHARS}文字）。古い細かい項目をまとめて短くしてください`);
      if (!status) problems.push(`${label} の status が「学習中」「一区切り」「見送り」のどれでもありません`);
      if (name && progress && status) topics.push({ name, status, progress });
    });
  }
  const notes = (key: "struggles" | "habits"): string[] => {
    const list = raw[key];
    if (list === undefined) return [];
    if (!Array.isArray(list)) {
      problems.push(`${key} が配列ではありません`);
      return [];
    }
    if (list.length > MAX_NOTES) problems.push(`${key} が${list.length}件あります（最大${MAX_NOTES}件）`);
    return list.flatMap((item, index) => {
      const note = typeof item === "string" ? oneLine(item) : "";
      if (!note) problems.push(`${key} の${index + 1}件目が空か文字列ではありません`);
      else if (length(note) > MAX_NOTE_CHARS) problems.push(`${key} の${index + 1}件目が${length(note)}文字です（最大${MAX_NOTE_CHARS}文字）`);
      return note ? [note] : [];
    });
  };
  const struggles = notes("struggles");
  const habits = notes("habits");
  if (problems.length) return { problems };
  const content = { topics, struggles, habits };
  const rendered = renderSemantic(content);
  if (length(rendered) > MAX_SEMANTIC_CHARS) problems.push(`全体が${length(rendered)}文字です（最大${MAX_SEMANTIC_CHARS}文字）。全体を短くしてください`);
  if (containsSecret(rendered)) problems.push("秘密情報（APIキーやパスワードなど）に見える文字列が入っています");
  return problems.length ? { problems } : { content, problems };
}

/** 決まった形・件数・文字数・分量に合い、秘密情報を含まないときだけ返す。1つでも合わなければ undefined。 */
export function validateSemantic(value: unknown): SemanticContent | undefined {
  return checkSemantic(value).content;
}

/** 注入する形に整える（見出し「## 学習の全体像」の下に入る部分）。 */
export function renderSemantic(content: SemanticContent): string {
  const sections: string[] = [];
  if (content.topics.length) {
    sections.push(["### テーマ", ...content.topics.map(({ name, status, progress }) => `- ${name}（${status}）: ${progress}`)].join("\n"));
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

/** モデルの出力から最初のJSONオブジェクトを取り出して調べる。JSONとして読めなければ json は undefined。 */
export function checkFoldOutput(output: string): SemanticCheck & { json?: string } {
  const text = output.replace(/```[a-z]*\n?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { problems: ["JSONが見つかりません"] };
  const json = text.slice(start, end + 1);
  try {
    return { ...checkSemantic(JSON.parse(json)), json };
  } catch {
    return { problems: ["JSONとして読めません"] };
  }
}

export function parseFoldOutput(output: string): SemanticContent | undefined {
  return checkFoldOutput(output).content;
}

/** 検証に落ちた出力を1回だけ直してもらうときの入力。元の入力に、前回の出力と直すところを足す。 */
export function buildRepairInput(input: string, previousJson: string, problems: readonly string[]): string {
  return [
    input,
    "",
    "## 前回の出力（決まりに合っていません）",
    previousJson,
    "",
    "## 直すところ",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "内容は変えずに、上の決まりに合うように直したJSONだけを返してください。",
  ].join("\n");
}

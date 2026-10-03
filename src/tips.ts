// 起動時のヒントを追加・修正・削除するときは、このファイルの SAKUNYAN_TIPS だけを編集してください。
//
// - text: 表示する日本語の文。先頭の「💡 ヒント：」は自動で付きます。
// - os:   特定の環境だけで出すヒントに指定します。省略すると、どの環境でも候補になります。
//         指定できる値は src/runtime-os.ts の RuntimeOS（"Windows" / "macOS" / "Chromebook" / "Linux"）です。
//
// 実際に使えるコマンド・キー操作だけを書いてください。ヒントは画面に表示するだけで、AIへの指示には使いません。
import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { getRuntimeOS, type RuntimeOS } from "./runtime-os.js";

export type SakunyanTip = {
  text: string;
  os?: readonly RuntimeOS[];
};

export const SAKUNYAN_TIPS: readonly SakunyanTip[] = [
  // sakunyanのコマンド
  { text: "「/resume」と入力すると、前の会話を選んで続きから再開できるよ。" },
  { text: "「/mode」と入力すると、応答モード（答え方）を切り替えられるよ。" },
  { text: "「/new」と入力すると、新しい会話を始められるよ。" },

  // 質問のしかた
  { text: "エラーが出たら、エラーの文章をそのまま貼り付けて質問してみてね。" },

  // ショートカットキー
  { text: "Ctrl+J で、送信せずに改行できるよ。長い質問を書くときに便利。" },
  { text: "答えの途中で止めたいときは、Esc を押してね。" },
  { text: "入力欄が空のときに ↑ キーを押すと、前に入力した質問を呼び出せるよ。" },
  { text: "Ctrl+C を1回押すと、入力中の文字をまとめて消せるよ。2回押すと終了。" },

  // 基本のコマンド（sakunyanの外、ターミナルで使う）
  { text: "ターミナルで「ls」と打つと、今いるフォルダの中身を一覧で見られるよ。" },
  { text: "ターミナルで「cd フォルダ名」と打つとそのフォルダへ移動、「cd ..」でひとつ上へ戻れるよ。" },
  { text: "ターミナルで「pwd」と打つと、今いるフォルダの場所（パス）を確認できるよ。" },

  // 環境ごとのヒント
  {
    os: ["Windows"],
    text: "PowerShell は、Windows に最初から入っているターミナル（コマンドを打ち込む画面）だよ。スタートメニューで「PowerShell」と検索すると開けるよ。",
  },
  {
    os: ["Windows"],
    text: "PowerShell は、フォルダの移動やアプリのインストールをコマンドでしたいときに使うよ。「ls」や「cd」も使えるよ。",
  },
  {
    os: ["macOS"],
    text: "Mac では、Command+Space を押して「ターミナル」と検索すると、ターミナルを開けるよ。",
  },
  {
    os: ["Chromebook"],
    text: "Chromebook では、ランチャーで「ターミナル」と検索すると、Linux のターミナルを開けるよ。",
  },
];

const TIP_ICON = "💡 ";
const TIP_INDENT = "   ";
export const TIP_LABEL = `${TIP_ICON}ヒント：`;

/** ヒントの出し分けに使う環境。判定できない環境では undefined（共通のヒントだけを候補にする）。 */
export function getTipOS(platform: string = process.platform, runtimeOS: RuntimeOS = getRuntimeOS()): RuntimeOS | undefined {
  return platform === "win32" || platform === "darwin" || platform === "linux" ? runtimeOS : undefined;
}

/** 環境に合う候補から1件をランダムに選ぶ。候補がなければ undefined。 */
export function selectTip(
  os: RuntimeOS | undefined,
  tips: readonly SakunyanTip[] = SAKUNYAN_TIPS,
  random: () => number = Math.random,
): SakunyanTip | undefined {
  const candidates = tips.filter((tip) => tip.text.trim() && (!tip.os || (os !== undefined && tip.os.includes(os))));
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/**
 * ヒントを画面の幅に合わせて折り返した行にする。ヒントがなければ何も表示しない。
 * 2行目以降は、絵文字の分だけ字下げして「ヒント：」の位置にそろえる。
 */
export function formatTipLines(tip: SakunyanTip | undefined, width?: number): string[] {
  if (!tip) return [];
  const text = `${TIP_LABEL}${tip.text.trim()}`;
  if (width === undefined || width <= 0) return [text];

  const innerWidth = width - visibleWidth(TIP_INDENT);
  if (innerWidth < 10) return wrapTextWithAnsi(text, width);
  return wrapTextWithAnsi(text.slice(TIP_ICON.length), innerWidth)
    .map((line, index) => `${index === 0 ? TIP_ICON : TIP_INDENT}${line}`);
}

// 起動時のヒントを追加・修正・削除するときは、このファイルの SAKUNYAN_TIPS だけを編集してください。
//
// - text: 表示する日本語の文。先頭の「💡 ヒント：」は自動で付きます。
// - os:   特定の環境だけで出すヒントに指定します。省略すると、どの環境でも候補になります。
//         指定できる値は src/runtime-os.ts の RuntimeOS（"Windows" / "macOS" / "Chromebook" / "Linux"）です。
//
// 実際に使えるコマンド・キー操作だけを書いてください。ヒントは画面に表示するだけで、AIへの指示には使いません。
// 豆知識は、確かな事実だけを書いてください（年・人名・由来は、はっきりしているものだけ）。
// 起動の待ち時間にさっと読める長さ（1〜2文）にしてください。
// 件数が増えると1件あたりの出る回数が減るので、ひとつの環境で候補になる数は50件くらいを目安にしてください。
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
  { text: "「/copy」と入力するか Ctrl+X を押すと、最後の答えをコピーできるよ。" },
  { text: "終わるときは「/quit」と入力してね。入力欄が空なら Ctrl+D でも終了できるよ。" },

  // APIキー
  { text: "API キーは、ドットラボの生徒ならドットラボポータルで1日に1回発行できるよ。お金はかからないよ。" },

  // 入力欄の便利な使い方
  { text: "入力欄で「!ls」のように、先頭に「!」を付けて打つと、sakunyan を開いたままコマンドを実行できるよ。" },
  { text: "「!」で実行したコマンドの結果は、次の質問といっしょに AI に伝わるよ。伝えたくないときは「!!ls」のように「!」を2つにしてね。" },
  { text: "入力欄で「@」を打つと、ファイル名の候補が出るよ。↑↓ で選んで Tab を押すと、ファイル名を入力できるよ。" },

  // 質問のしかた
  { text: "エラーが出たら、エラーの文章をそのまま貼り付けて質問してみてね。" },

  // sakunyanのショートカットキー
  { text: "Ctrl+J で、送信せずに改行できるよ。長い質問を書くときに便利。" },
  { text: "答えの途中で止めたいときは、Esc を押してね。" },
  { text: "入力欄が空のときに ↑ キーを押すと、前に入力した質問を呼び出せるよ。" },
  { text: "sakunyan の入力欄では、Ctrl+C を1回押すと、入力中の文字をまとめて消せるよ。2回押すと終了。" },

  // 基本のコマンド（sakunyanの外、ターミナルで使う）
  { text: "ターミナルで「ls」と打つと、今いるフォルダの中身を一覧で見られるよ。" },
  { text: "ターミナルで「cd フォルダ名」と打つとそのフォルダへ移動、「cd ..」でひとつ上へ戻れるよ。" },
  { text: "ターミナルで「pwd」と打つと、今いるフォルダの場所（パス）を確認できるよ。" },

  // Git（ターミナルで使う。sakunyanの中からは「!」を付ける）
  { text: "Git を使っているフォルダで「git status」と打つと、どのファイルを変更したかなど、今の状態を確認できるよ。" },
  { text: "「git add .」のあとに「git commit -m \"メッセージ\"」と打つと、今の変更を Git に記録できるよ。" },
  { text: "「git log --oneline」と打つと、これまでの記録（コミット）を1行ずつの一覧で見られるよ。" },
  { text: "「git clone URL」と打つと、GitHub などにあるリポジトリ（プロジェクトの入れ物）を自分の PC にコピーできるよ。" },
  { text: "「git pull」で GitHub などにある最新の変更を取り込み、「git push」で自分の記録を送れるよ。" },

  // GitHub CLI（gh コマンド。入っている環境で使える）
  { text: "GitHub CLI（gh コマンド）が入っていれば、「gh auth login」で GitHub にログインできるよ。画面の質問に答えて進めてね。" },
  { text: "gh コマンドが入っていれば、「gh repo clone 持ち主/リポジトリ名」で GitHub のリポジトリを自分の PC にコピーできるよ。" },
  { text: "gh コマンドが入っていれば、「gh repo create」と打つと、質問に答えながら GitHub に新しいリポジトリを作れるよ。" },

  // 環境ごとのヒント
  {
    os: ["Windows"],
    text: "PowerShell は、Windows に最初から入っているターミナル（コマンドを打ち込む画面）だよ。スタートメニューで「PowerShell」と検索すると開けるよ。",
  },
  {
    os: ["macOS"],
    text: "Mac では、Command+Space を押して「ターミナル」と検索すると、ターミナルを開けるよ。",
  },
  {
    os: ["Chromebook"],
    text: "Chromebook では、ランチャーで「ターミナル」と検索すると、Linux のターミナルを開けるよ。",
  },

  // パソコンのショートカット（sakunyanの外、ブラウザやメモなどのアプリで使う）
  // Windows・Chromebook・Linux は Ctrl、macOS は Command。同じ内容を2件に分けて、os で出し分ける。
  // ターミナルやsakunyanの中では意味が違うキー（Ctrl+C、Ctrl+A、Ctrl+Z など）があるので、どこで使えるかを文に書く。
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやメモなどのアプリでは、Ctrl+A で、文字などを全部まとめて選べるよ（全選択）。" },
  { os: ["macOS"], text: "ブラウザやメモなどのアプリでは、Command+A で、文字などを全部まとめて選べるよ（全選択）。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやメモなどのアプリでは、Ctrl+C でコピー、Ctrl+V で貼り付けができるよ。" },
  { os: ["macOS"], text: "ブラウザやメモなどのアプリでは、Command+C でコピー、Command+V で貼り付けができるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモなどのアプリでは、Ctrl+X で、選んだ文字を切り取れるよ。Ctrl+V で別の場所に貼り付けられるよ。" },
  { os: ["macOS"], text: "メモなどのアプリでは、Command+X で、選んだ文字を切り取れるよ。Command+V で別の場所に貼り付けられるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモなどのアプリでは、まちがえたときに Ctrl+Z を押すと、ひとつ前の状態に戻せるよ（元に戻す）。" },
  { os: ["macOS"], text: "メモなどのアプリでは、まちがえたときに Command+Z を押すと、ひとつ前の状態に戻せるよ（元に戻す）。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモやエディタなどのアプリでは、Ctrl+S で、書いたものを保存できるよ。こまめに保存しよう。" },
  { os: ["macOS"], text: "メモやエディタなどのアプリでは、Command+S で、書いたものを保存できるよ。こまめに保存しよう。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやエディタでは、Ctrl+F で、ページやファイルの中の言葉を探せるよ。" },
  { os: ["macOS"], text: "ブラウザやエディタでは、Command+F で、ページやファイルの中の言葉を探せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザでは、Ctrl+T で新しいタブを開けるよ。まちがえて閉じたタブは、Ctrl+Shift+T で開き直せるよ。" },
  { os: ["macOS"], text: "ブラウザでは、Command+T で新しいタブを開けるよ。まちがえて閉じたタブは、Command+Shift+T で開き直せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "Alt+Tab を押すと、開いているアプリ（ウィンドウ）を切り替えられるよ。" },
  { os: ["macOS"], text: "Mac では、Command+Tab を押すと、開いているアプリを切り替えられるよ。" },
  {
    os: ["Chromebook", "Linux"],
    text: "ターミナルの中では、Ctrl+C はコピーではなく「中断」だよ。コピーは Ctrl+Shift+C、貼り付けは Ctrl+Shift+V を使うことが多いよ。",
  },
  { os: ["macOS"], text: "Mac のターミナルでは、Command+C でコピー、Command+V で貼り付けが、そのまま使えるよ。" },

  // 豆知識: コンピュータの仕組み
  { text: "コンピュータは、0 と 1 だけで数を表す「2進数」で動いているよ。" },
  { text: "0 か 1 かを表すいちばん小さい単位が「ビット」。8ビットをまとめたものが「1バイト」だよ。" },
  { text: "メモリは作業中のデータを置く場所で、電源を切ると消えるよ。残したいデータはストレージ（SSD など）に保存するよ。" },

  // 豆知識: ネットワーク
  { text: "IP アドレスは、ネットワークにつながる機器に付く番号。インターネットの住所のようなものだよ。" },
  { text: "DNS は、「example.com」のような名前から IP アドレスを調べるしくみ。電話帳にたとえられるよ。" },
  { text: "HTTPS は、通信を暗号化する HTTP だよ。途中でのぞき見や書き換えをされにくくなるよ。" },

  // 豆知識: 歴史
  { text: "不具合を「バグ（虫）」と呼ぶのは古くからの言い方。1947年には、計算機から本物のガが見つかった記録もあるよ。" },
  { text: "Web（WWW）は、1989年にティム・バーナーズ＝リーが、ヨーロッパの研究所 CERN で提案したしくみだよ。" },
  { text: "Linux は、1991年に、フィンランドの大学生だったリーナス・トーバルズが作り始めた OS（の中心部分）だよ。" },
  { text: "Git は、2005年に、Linux を作ったリーナス・トーバルズが、Linux の開発のために作り始めたよ。" },

  // 豆知識: プログラミング言語
  { text: "Python は、1991年にグイド・ヴァンロッサムが公開した言語。名前はイギリスのコメディ番組「モンティ・パイソン」からだよ。" },
  { text: "JavaScript は、1995年にブレンダン・アイクが、Web ブラウザで動かすために作った言語。Java とは別の言語だよ。" },
  { text: "プログラムを先にまとめて機械の言葉に直すソフトが「コンパイラ」、順に読みながら動かすソフトが「インタプリタ」だよ。" },
  { text: "「変数」は、データに名前を付けて入れておく箱のようなものだよ。" },
  { text: "「関数」は、ひとまとまりの処理に名前を付けたもの。名前を呼ぶだけで、何度でも使えるよ。" },
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

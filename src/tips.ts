// 起動時のヒントを追加・修正・削除するときは、このファイルの SAKUNYAN_TIPS だけを編集してください。
//
// - text: 表示する日本語の文。先頭の「💡 ヒント：」は自動で付きます。
// - os:   特定の環境だけで出すヒントに指定します。省略すると、どの環境でも候補になります。
//         指定できる値は src/runtime-os.ts の RuntimeOS（"Windows" / "macOS" / "Chromebook" / "Linux"）です。
//
// 実際に使えるコマンド・キー操作だけを書いてください。ヒントは画面に表示するだけで、AIへの指示には使いません。
// 豆知識は、確かな事実だけを書いてください（年・人名・由来は、はっきりしているものだけ）。
// 起動の待ち時間にさっと読める長さ（1〜2文）にしてください。
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
  { text: "「/name 名前」と入力すると、今の会話に名前を付けられるよ。「/resume」で探すときに見つけやすくなるよ。" },
  { text: "「/copy」と入力するか Ctrl+X を押すと、最後の答えをコピーできるよ。" },
  { text: "「/hotkeys」と入力すると、使えるショートカットキーの一覧を見られるよ（英語で表示されるよ）。" },
  { text: "終わるときは「/quit」と入力してね。入力欄が空なら Ctrl+D でも終了できるよ。" },

  // 入力欄の便利な使い方
  { text: "入力欄で「!ls」のように、先頭に「!」を付けて打つと、sakunyan を開いたままコマンドを実行できるよ。" },
  { text: "「!」で実行したコマンドの結果は、次の質問といっしょに AI に伝わるよ。伝えたくないときは「!!ls」のように「!」を2つにしてね。" },
  { text: "入力欄で「@」を打つと、ファイル名の候補が出るよ。↑↓ で選んで Tab を押すと、ファイル名を入力できるよ。" },
  { text: "入力欄では、ファイル名やフォルダ名を途中まで打って Tab を押すと、続きを入力してくれるよ。" },
  { text: "長いエラーは、何行あってもそのまま貼り付けて大丈夫。「[paste #1 …]」のように短く表示されても、中身は全部送られるよ。" },
  { text: "答えを待っている間も、次の質問を打って Enter で送れるよ。今の答えが終わってから、続けて答えてくれるよ。" },

  // 質問のしかた
  { text: "エラーが出たら、エラーの文章をそのまま貼り付けて質問してみてね。" },

  // sakunyanのショートカットキー
  { text: "Ctrl+J で、送信せずに改行できるよ。長い質問を書くときに便利。" },
  { text: "答えの途中で止めたいときは、Esc を押してね。" },
  { text: "入力欄が空のときに ↑ キーを押すと、前に入力した質問を呼び出せるよ。" },
  { text: "sakunyan の入力欄では、Ctrl+C を1回押すと、入力中の文字をまとめて消せるよ。2回押すと終了。" },
  { text: "sakunyan の入力欄では、Ctrl+A で行の先頭へ、Ctrl+E で行の最後へ、カーソルを一気に動かせるよ。" },
  { text: "コマンドの結果が長くて一部が省略されたとき（「more lines」と出るよ）は、Ctrl+O で全部を表示できるよ。もう一度押すと元に戻るよ。" },

  // 基本のコマンド（sakunyanの外、ターミナルで使う）
  { text: "ターミナルで「ls」と打つと、今いるフォルダの中身を一覧で見られるよ。" },
  { text: "ターミナルで「cd フォルダ名」と打つとそのフォルダへ移動、「cd ..」でひとつ上へ戻れるよ。" },
  { text: "ターミナルで「pwd」と打つと、今いるフォルダの場所（パス）を確認できるよ。" },
  { text: "ターミナルで「sakunyan --help」と打つと、sakunyan の起動のしかたの説明を見られるよ。" },
  { text: "ターミナルで「sakunyan . --continue」と打つと、そのフォルダでの前の会話の続きから始められるよ。" },

  // Git（ターミナルで使う。sakunyanの中からは「!」を付ける）
  { text: "Git を使っているフォルダで「git status」と打つと、どのファイルを変更したかなど、今の状態を確認できるよ。" },
  { text: "「git add .」のあとに「git commit -m \"メッセージ\"」と打つと、今の変更を Git に記録できるよ。" },
  { text: "「git log --oneline」と打つと、これまでの記録（コミット）を1行ずつの一覧で見られるよ。" },
  { text: "「git diff」と打つと、まだ「git add」していない変更の中身を見られるよ。" },
  { text: "「git clone URL」と打つと、GitHub などにあるリポジトリ（プロジェクトの入れ物）を自分の PC にコピーできるよ。" },
  { text: "「git pull」で GitHub などにある最新の変更を取り込み、「git push」で自分の記録を送れるよ。" },
  { text: "sakunyan の中からは、「!git status」のように「!」を付けると Git のコマンドも打てるよ。" },

  // GitHub CLI（gh コマンド。入っている環境で使える）
  { text: "GitHub CLI（gh コマンド）が入っていれば、「gh auth login」で GitHub にログインできるよ。画面の質問に答えて進めてね。" },
  { text: "gh コマンドが入っていれば、「gh repo clone 持ち主/リポジトリ名」で GitHub のリポジトリを自分の PC にコピーできるよ。" },
  { text: "gh コマンドが入っていれば、「gh repo create」と打つと、質問に答えながら GitHub に新しいリポジトリを作れるよ。" },
  { text: "gh コマンドが入っていれば、「gh issue list」で、そのリポジトリの issue（やることや困りごとのメモ）の一覧を見られるよ。" },
  { text: "gh コマンドが入っていれば、「gh pr create」で、自分の変更を取り込んでもらうお願い（プルリクエスト）を作れるよ。" },
  { text: "gh コマンドが入っていれば、「gh browse」で、今いるリポジトリの GitHub のページをブラウザで開けるよ。" },

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

  // パソコンのショートカット（sakunyanの外、ブラウザやメモ帳などのアプリで使う）
  // Windows・Chromebook・Linux は Ctrl、macOS は Command。同じ内容を2件に分けて、os で出し分ける。
  // ターミナルやsakunyanの中では意味が違うキー（Ctrl+C、Ctrl+A、Ctrl+Z など）があるので、どこで使えるかを文に書く。
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやメモ帳などのアプリでは、Ctrl+A で、文字などを全部まとめて選べるよ（全選択）。" },
  { os: ["macOS"], text: "ブラウザやメモ帳などのアプリでは、Command+A で、文字などを全部まとめて選べるよ（全選択）。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやメモ帳などのアプリでは、Ctrl+C でコピー、Ctrl+V で貼り付けができるよ。" },
  { os: ["macOS"], text: "ブラウザやメモ帳などのアプリでは、Command+C でコピー、Command+V で貼り付けができるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモ帳などのアプリでは、Ctrl+X で、選んだ文字を切り取れるよ。Ctrl+V で別の場所に貼り付けられるよ。" },
  { os: ["macOS"], text: "メモ帳などのアプリでは、Command+X で、選んだ文字を切り取れるよ。Command+V で別の場所に貼り付けられるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモ帳などのアプリでは、まちがえたときに Ctrl+Z を押すと、ひとつ前の状態に戻せるよ（元に戻す）。" },
  { os: ["macOS"], text: "メモ帳などのアプリでは、まちがえたときに Command+Z を押すと、ひとつ前の状態に戻せるよ（元に戻す）。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "メモ帳やエディタなどのアプリでは、Ctrl+S で、書いたものを保存できるよ。こまめに保存しよう。" },
  { os: ["macOS"], text: "メモ帳やエディタなどのアプリでは、Command+S で、書いたものを保存できるよ。こまめに保存しよう。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザやエディタでは、Ctrl+F で、ページやファイルの中の言葉を探せるよ。" },
  { os: ["macOS"], text: "ブラウザやエディタでは、Command+F で、ページやファイルの中の言葉を探せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザでは、Ctrl+T で新しいタブを開けるよ。まちがえて閉じたタブは、Ctrl+Shift+T で開き直せるよ。" },
  { os: ["macOS"], text: "ブラウザでは、Command+T で新しいタブを開けるよ。まちがえて閉じたタブは、Command+Shift+T で開き直せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザでは、Ctrl+R で、ページを読み込み直せるよ。" },
  { os: ["macOS"], text: "ブラウザでは、Command+R で、ページを読み込み直せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "ブラウザでは、Ctrl と「+」で拡大、Ctrl と「-」で縮小、Ctrl+0 で元の大きさに戻せるよ。" },
  { os: ["macOS"], text: "ブラウザでは、Command と「+」で拡大、Command と「-」で縮小、Command+0 で元の大きさに戻せるよ。" },
  { os: ["Windows", "Chromebook", "Linux"], text: "Alt+Tab を押すと、開いているアプリ（ウィンドウ）を切り替えられるよ。" },
  { os: ["macOS"], text: "Mac では、Command+Tab を押すと、開いているアプリを切り替えられるよ。" },
  { os: ["Windows"], text: "Windows では、Windows キー+Shift+S で、画面の好きな範囲をスクリーンショット（画面の写真）にできるよ。" },
  { os: ["macOS"], text: "Mac では、Command+Shift+3 で画面全体、Command+Shift+4 で選んだ範囲のスクリーンショット（画面の写真）を撮れるよ。" },
  {
    os: ["Chromebook", "Linux"],
    text: "ターミナルの中では、Ctrl+C はコピーではなく「中断」だよ。コピーは Ctrl+Shift+C、貼り付けは Ctrl+Shift+V を使うことが多いよ。",
  },
  { os: ["macOS"], text: "Mac のターミナルでは、Command+C でコピー、Command+V で貼り付けが、そのまま使えるよ。" },

  // 豆知識: コンピュータの仕組み
  { text: "コンピュータは、0 と 1 だけで数を表す「2進数」で動いているよ。" },
  { text: "0 か 1 かを表すいちばん小さい単位が「ビット」。8ビットをまとめたものが「1バイト」だよ。" },
  { text: "CPU は、計算や命令の実行を担当する部品。コンピュータの頭脳にたとえられるよ。" },
  { text: "メモリは作業中のデータを置く場所で、電源を切ると消えるよ。残したいデータはストレージ（SSD など）に保存するよ。" },
  { text: "OS（オペレーティングシステム）は、アプリと機械の間を取り持つ基本のソフト。Windows、macOS、Linux などがあるよ。" },

  // 豆知識: ネットワーク
  { text: "インターネットは、世界中のネットワーク同士をつないだ、大きなネットワークだよ。" },
  { text: "IP アドレスは、ネットワークにつながる機器に付く番号。インターネットの住所のようなものだよ。" },
  { text: "DNS は、「example.com」のような名前から IP アドレスを調べるしくみ。電話帳にたとえられるよ。" },
  { text: "URL は、Web ページなどの場所を表す文字列だよ。「https://」で始まるものが多いよ。" },
  { text: "HTTPS は、通信を暗号化する HTTP だよ。途中でのぞき見や書き換えをされにくくなるよ。" },
  { text: "サービスを提供する側のコンピュータを「サーバー」、利用する側を「クライアント」と呼ぶよ。" },
  { text: "Wi-Fi は、ケーブルの代わりに電波を使ってネットワークにつなぐ技術（無線 LAN）だよ。" },

  // 豆知識: 歴史
  { text: "ENIAC（エニアック）は、1946年にアメリカで公開された初期の電子計算機。部屋いっぱいの大きさだったよ。" },
  { text: "不具合を「バグ（虫）」と呼ぶのは古くからの言い方。1947年には、計算機から本物のガが見つかった記録もあるよ。" },
  { text: "インターネットのもとになった ARPANET（アーパネット）は、1969年にアメリカで動き始めたよ。" },
  { text: "Web（WWW）は、1989年にティム・バーナーズ＝リーが、ヨーロッパの研究所 CERN で提案したしくみだよ。" },
  { text: "UNIX（ユニックス）は、1969年ごろにアメリカのベル研究所で生まれた OS。macOS や Linux にも影響を与えたよ。" },
  { text: "Linux は、1991年に、フィンランドの大学生だったリーナス・トーバルズが作り始めた OS（の中心部分）だよ。" },
  { text: "Git は、2005年に、Linux を作ったリーナス・トーバルズが、Linux の開発のために作り始めたよ。" },

  // 豆知識: プログラミング言語
  { text: "Python は、1991年にグイド・ヴァンロッサムが公開した言語。名前はイギリスのコメディ番組「モンティ・パイソン」からだよ。" },
  { text: "JavaScript は、1995年にブレンダン・アイクが、Web ブラウザで動かすために作った言語。Java とは別の言語だよ。" },
  { text: "C 言語は、1970年代の初めにデニス・リッチーがベル研究所で作ったよ。UNIX を書くのにも使われたよ。" },
  { text: "Scratch は、アメリカの MIT メディアラボが作った、ブロックを組み合わせてプログラムを作る言語だよ。" },
  { text: "プログラムを先にまとめて機械の言葉に直すソフトが「コンパイラ」、順に読みながら動かすソフトが「インタプリタ」だよ。" },
  { text: "「変数」は、データに名前を付けて入れておく箱のようなものだよ。" },
  { text: "「関数」は、ひとまとまりの処理に名前を付けたもの。名前を呼ぶだけで、何度でも使えるよ。" },
  { text: "同じ処理をくり返す書き方を「ループ」と言うよ。100回のくり返しも、数行で書けるよ。" },
  { text: "オープンソースは、プログラムの中身（ソースコード）が公開されていて、だれでも見て、使って、改良できるソフトのことだよ。" },
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

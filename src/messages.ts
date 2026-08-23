import { SAKUNYAN_LOGO, SAKUNYAN_VERSION } from "./version.js";

const paint = (code: string, text: string, color: boolean) =>
  color ? `\x1b[${code}m${text}\x1b[0m` : text;

export const messages = {
  ui: {
    logo: SAKUNYAN_LOGO,
    header: `sakunyan code (v${SAKUNYAN_VERSION})へようこそ！`,
    workingDirectory: "作業フォルダ：",
    idleIcon: "🐱",
    workingIcon: "🐈",
    waiting: "質問を入力してね（Ctrl+Cを2回で終了）",
    thinking: "考え中…",
    checkingFiles: "ファイルを確認中…",
    runningCommand: "コマンドを実行中…",
  },
  setup: {
    checking: "接続を確認中",
    checkingOk: "接続確認OK",
    checkingNg: "接続確認NG",
    requestKey: "先生から受け取ったOpenRouter APIキーを入力してね。",
    inputPrompt: "🔑 ここにAPIキーを入力 👉",
    inputHint: "✅ Enterで確定　🚪 Escで終了",
    retrying: "APIキーで接続を再確認中",
    invalidKey: "APIキーで接続できなかったみたい。キーを確認して、もう一度入力してね。",
    cancelled: "APIキーの設定をキャンセルしました。",
  },
  unsupportedNodeVersion: (current: string, required: string, color = false) => `${paint("1;31", "❌ Node.jsのバージョンが古いため、sakunyanを起動できません。", color)}

現在のバージョン： ${paint("33", `v${current}`, color)}
必要なバージョン： ${paint("32", `v${required} 以上`, color)}

Node.jsを更新してから、もう一度実行してください：
  ${paint("36", "https://nodejs.org/ja/download", color)}

更新できたか確認するコマンド：
  ${paint("33", "node --version", color)}
`,
  targetRequired: (currentDirectory: string, color = false) => `${paint("1;32", messages.ui.header, color)}

${paint("36", "今いるフォルダはここだよ：", color)}
  ${paint("1;34", `📁 ${currentDirectory}`, color)}

さくにゃんと一緒に作業するフォルダを指定してね。

${paint("36", "使い方：", color)}
  ${paint("33", "sakunyan <作業フォルダのパス>", color)}

今いるフォルダで作業する場合：
  ${paint("33", "sakunyan .", color)}

別のフォルダで作業する場合：
  ${paint("33", "sakunyan ./my-project", color)}

${paint("36", "💡 フォルダを移動・確認するコマンド", color)}

  ${paint("33", "ls", color)}                   今いるフォルダの中を見る
  ${paint("33", "cd <フォルダ名>", color)}      フォルダへ移動
  ${paint("33", "cd ..", color)}                ひとつ上のフォルダへ戻る

例：
  ${paint("33", "ls", color)}
  ${paint("33", "cd my-project", color)}
  ${paint("33", "sakunyan .", color)}

${paint("1;33", "パスを指定して、もう一度さくにゃんを呼んでね！ 🐾", color)}
`,
  targetNotFound: (
    inputPath: string,
    currentDirectory: string,
    parentDirectory: string,
    targetPath: string,
    color = false,
  ) => `${paint("1;31", `❌ 「${inputPath}」フォルダが見つからなかったよ。`, color)}

${paint("36", "今いるフォルダ：", color)}
  ${paint("1;34", `📁 ${currentDirectory}`, color)}

${paint("36", "探した場所：", color)}
  ${paint("1;31", `📁 ${targetPath}`, color)}

「${inputPath}」と書くと、今いるフォルダの中から探します。

${paint("36", "📖 パスの見方", color)}

  ${paint("33", ".", color)}           今いるフォルダ
              ${paint("34", currentDirectory, color)}
  ${paint("33", "..", color)}          ひとつ上のフォルダ
              ${paint("34", parentDirectory, color)}
  ${paint("33", "~", color)}           ホームフォルダ
  ${paint("33", "./<フォルダ名>", color)}      今いるフォルダの中を指定
  ${paint("33", "../<フォルダ名>", color)}     ひとつ上のフォルダから指定

フォルダ名を確認してみよう：
  ${paint("33", "pwd", color)}     今いるフォルダの場所を確認
  ${paint("33", "ls", color)}      今いるフォルダの中を見る

ひとつ上のフォルダを見る場合：
  ${paint("33", "cd ..", color)}
  ${paint("33", "ls", color)}

作業するフォルダが見つかったら：
  ${paint("33", "sakunyan <作業フォルダのパス>", color)}
`,
  targetNotDirectory: (path: string, color = false) =>
    `${paint("31", `フォルダを指定してください：${path}`, color)}\n`,
};

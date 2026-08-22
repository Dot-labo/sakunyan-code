const paint = (code: string, text: string, color: boolean) =>
  color ? `\x1b[${code}m${text}\x1b[0m` : text;

export const messages = {
  targetRequired: (currentDirectory: string, color = false) => `${paint("1;32", "🐱 sakunyan code へようこそ！", color)}

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

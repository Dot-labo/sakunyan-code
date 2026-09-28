# sakunyan

初心者向けの日本語コーディングアドバイザーです。ファイルやコードを調べ、エラーの原因や考え方を分かりやすく説明します。

## できること

- ファイルやコードの読み取り・調査
- エラーの原因説明と解決方法の案内
- Gitの状態やコマンドの実行結果を一緒に読み解く
- コマンドの意味を説明してから、実行方法を案内

現在のアドバイスモードと大阪弁サンプルモードでは、`read`、`grep`、`find`、`ls` によるファイルの読み取り・検索・一覧表示だけを自動で行います。`bash`、`edit`、`write` は使いません。Gitの状態確認を含むコマンドの実行やファイルの変更が必要なときは、手順を説明し、利用者自身に実行してもらいます。出力やエラーを貼り付ければ、その内容を一緒に確認できます。

起動時にプロジェクトの `AGENTS.md` や `CLAUDE.md`、拡張機能、Skills、プロンプトテンプレートを自動読み込みしません。読み取りツールはOSのサンドボックスではなく、起動フォルダ外の読み取りを完全に防ぐ仕組みではありません。APIキーや個人情報を含むファイルは、sakunyanに読み取らせたり、会話へ貼り付けたりしないでください。

## 必要なもの

- macOS、Windows、Linux、または Linux 開発環境を有効にした Chromebook
- Node.js 22.19.0 以上
- Windowsの場合は Git for Windows（Git Bash）
- 先生から受け取った OpenRouter APIキー

## セットアップ

### 1. Node.jsをインストール

[Node.js公式サイト](https://nodejs.org/)から、22.19.0以上のLTS版をインストールします。

確認します。

```sh
node --version #v22.19.0以上であることを確認してください。
```

### 2. sakunyanを取得して準備

公開後は、ターミナル（WindowsはPowerShellまたはGit Bash）で次を実行します。

```sh
npm install -g @dotlabo/sakunyan-code@latest
```

インストールせずに一度だけ実行する場合は、次の方法も使えます。

```sh
npx @dotlabo/sakunyan-code@latest .
```


### 3. 起動

作業したいフォルダへ移動して、`.` を指定します。

```sh
cd 作業したいフォルダのパス
sakunyan .
```

別のフォルダを直接指定することもできます。

```sh
sakunyan ~/projects/my-project
```

WindowsのGit Bashでは、例として次のように指定します。

```sh
sakunyan /c/Users/名前/projects/my-project
```

### 4. APIキーを設定

初回起動時に、sakunyanがOpenRouterの固定モデルへ接続できない場合、APIキーの入力画面が表示されます。

APIキーは、Dot.laboポータルサイトの「APIキー」発行画面から発行することができます。

接続に成功すると、APIキーはsakunyan専用の保存先へ保存され、次回から再入力せずに使えます。APIキーはログやエラーメッセージには表示されません。

使用するプロバイダとモデルは sakunyan 側で固定されています。

```text
プロバイダ: openrouter
モデル: deepseek/deepseek-v4-flash
```

APIキーは他の人に見せたり、GitHubへ公開したりしないでください。

## 保存先について

sakunyanは、pi本体とは別のsakunyan専用フォルダに認証情報・設定・対話履歴を保存します。

```text
~/.sakunyan/
├── auth.json      APIキーなどの認証情報
├── settings.json  sakunyanの設定
└── sessions/      対話履歴・セッション
```

pi本体の保存先(`~/.pi/`)は変更・削除しません。piとsakunyanで、認証情報・設定・対話履歴はそれぞれ独立しているため、片方の会話や設定変更がもう片方に影響することはありません。

### 初回起動時について

以前のバージョンのsakunyanが`~/.pi/agent/`に保存していたAPIキーや対話履歴は、pi本体のものと区別できないため、自動では引き継ぎません。初回起動時にAPIキーを再入力してください。

## 起動後の表示

```text
sakunyan code (バージョン)へようこそ！
作業フォルダ： 📁 現在のフォルダ
ユーザーの環境： 🍎 macOS
🐱 質問を入力してね（Ctrl+Cを2回で終了）
```

質問は短く、分からないことをそのまま入力してください。sakunyanが、子どもにも分かる言葉で説明します。

sakunyanは起動した環境を判定し、そのOSに合わせてコマンドや操作手順を案内します。ChromebookではLinux開発環境を使う前提です。ChromeOS固有の情報がLinux環境から見えない場合はLinuxとして判定します。OSを判定できない場合はWindowsとして案内します。別のPCやサーバーについて質問するときは、その環境を伝えてください。

## 更新について

新しいバージョンが公開されている場合は、起動時に画面へ案内が表示されます。

案内が表示されたら、sakunyanを終了してから、ターミナルで次のコマンドを実行します。

```sh
npm install -g @dotlabo/sakunyan-code@latest
```

更新しても、保存先のAPIキーや対話履歴はそのまま使えます。

## 困ったとき

### `sakunyan: command not found` と表示される

`npm install -g @dotlabo/sakunyan-code@latest` を実行したあと、ターミナルを開き直してください。改善しない場合は、npmのグローバル実行ファイルのパスがPATHに含まれているか確認してください。

### フォルダが見つからない

作業フォルダへ移動してから、次を実行します。

```sh
sakunyan .
```

### モデルが使えない

起動時の案内に従って、先生から受け取ったOpenRouter APIキーを入力してください。キーが無効な場合は再入力できます。

### Node.jsのバージョンが古い

`node --version` で確認し、22.19.0以上へ更新してください。

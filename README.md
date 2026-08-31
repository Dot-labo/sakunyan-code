# sakunyan

初心者向けの日本語コーディングアドバイザーです。ファイルやコードを調べ、エラーの原因や考え方を分かりやすく説明します。

## できること

- ファイルやコードの読み取り・調査
- エラーの原因説明と解決方法の案内
- Gitの状態確認など、調査のためのコマンド実行
- コマンドの意味を説明してから、実行方法を案内

sakunyanは、ファイルの変更やGitのコミット・プッシュなどを自動では行いません。

## 必要なもの

- macOS または Windows
- Node.js 22.19.0 以上
- Windowsの場合は Git for Windows（Git Bash）
- 先生から受け取った OpenRouter APIキー

## セットアップ

### 1. Node.jsをインストール

[Node.js公式サイト](https://nodejs.org/)から、22.19.0以上のLTS版をインストールします。

確認します。

```sh
node --version
npm --version
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

開発版をソースから使う場合は、リポジトリを取得してから次を実行します。

```sh
git clone https://github.com/dot-labo/sakunyan-code.git
cd sakunyan-code
npm install
npm run build
npm link
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

- 先生から受け取ったOpenRouter APIキーを入力する
- Enterで確定する
- Escで終了する
- 接続に失敗した場合は、キーを確認して再入力する

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
sakunyan code (v0.1.7)へようこそ！
作業フォルダ：現在のフォルダ
🐱 質問を入力してね（Ctrl+Cを2回で終了）
```

質問は短く、分からないことをそのまま入力してください。sakunyanが、子どもにも分かる言葉で説明します。

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

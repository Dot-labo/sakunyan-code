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

ターミナル（WindowsはGit Bash）で実行します。

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

sakunyan画面で次を入力します。

```text
/login openrouter
```

「APIキーを使う」を選び、先生から受け取ったキーを入力します。設定後、次でモデルを選びます。

```text
/model
```

APIキーは他の人に見せたり、GitHubへ公開したりしないでください。

## 起動後の表示

```text
sakunyan code (v0.1.2)へようこそ！
作業フォルダ：現在のフォルダ
🐱 質問を入力してね（Ctrl+Cを2回で終了）
```

質問は短く、分からないことをそのまま入力してください。sakunyanが、子どもにも分かる言葉で説明します。

## 困ったとき

### `sakunyan: command not found` と表示される

`npm link` を実行したあと、ターミナルを開き直してください。

### フォルダが見つからない

作業フォルダへ移動してから、次を実行します。

```sh
sakunyan .
```

### モデルが使えない

sakunyan画面で `/login openrouter` を実行し、APIキーを設定してください。

### Node.jsのバージョンが古い

`node --version` で確認し、22.19.0以上へ更新してください。

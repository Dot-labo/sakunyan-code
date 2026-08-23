# プラットフォームセットアップ仕様

## Purpose

macOSとWindows Git Bashで、生徒がsakunyanをセットアップして起動できる手順をREADMEに提供する。

## Requirements

### Requirement: macOSセットアップガイド

READMEは、Node.jsのインストール、プロジェクト依存関係のインストール、ビルド、リンク、sakunyanの起動について、簡潔なmacOS向け手順を提供しなければならない。

#### Scenario: macOSで生徒がセットアップする

- **WHEN** 生徒がmacOS向けガイドに従ったとき
- **THEN** `npm install`、`npm run build`、`npm link`、`sakunyan .` のコマンドが示されていなければならない

### Requirement: Windows Git Bashセットアップガイド

READMEは、WindowsのシェルとしてGit for Windows/Git Bashを示し、Git Bashのパス例を含めなければならない。

#### Scenario: Windowsで生徒がセットアップする

- **WHEN** 生徒がGit Bashでガイドに従ったとき
- **THEN** 使用できる `/c/Users/...` 形式のパス例と、同じビルド・起動手順が示されていなければならない

### Requirement: APIキーのセットアップガイド

READMEは、生徒に先生から提供されたOpenRouter APIキーが必要であることを説明し、`/login openrouter` と `/model` を記載しなければならない。

#### Scenario: APIキーが設定されていない

- **WHEN** 生徒がモデル未設定の状態でsakunyanを起動したとき
- **THEN** ガイドは、`/login openrouter` を実行し、APIキーでのログインを選び、先生から提供されたキーを入力し、`/model` でモデルを選ぶよう案内しなければならない

### Requirement: セットアップのトラブルシューティング

READMEは、コマンドが見つからない、フォルダがない、モデルを利用できない、Node.jsが古い場合について、簡潔な案内を含めなければならない。

#### Scenario: セットアップで問題が起きる

- **WHEN** 生徒が記載されたセットアップ問題に遭遇したとき
- **THEN** READMEは、直接確認または復旧するための手順を1つ示さなければならない

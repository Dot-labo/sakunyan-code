## Why

現在の既定モードは、説明ではファイル変更をしないと案内しながら、pi の `bash` をモデルに許可している。さらにプロジェクト内の `AGENTS.md` などが自動で指示として読み込まれるため、初心者向けの安全な既定値と一致していない。

## What Changes

- **BREAKING** 既定のアドバイスモードと大阪弁サンプルモードから `bash` を外し、`read`、`grep`、`find`、`ls` のみを許可する。
- モード定義にツール一覧を置き、起動時・セッション開始時・`/mode` 確定時に現在モードの一覧を適用する。現行モードはいずれも読み取り用ツールだけを持つ。
- pi のプロジェクト信頼確認とコンテキストファイルの自動読み込みを無効にし、プロジェクト由来の拡張・Skills・プロンプトテンプレートも引き続き無効にする。
- Git の操作は既定モードで自動実行せず、必要なコマンドの意味と実行方法を案内して、利用者が実行した結果を読み解く。
- プロンプト、README、回帰テストを実際の権限へ合わせる。

## Capabilities

### New Capabilities

- `mode-tool-permissions`: モードに紐づく有効ツールの適用と安全な初期化。

### Modified Capabilities

- `fixed-pi-runtime`: 起動時のツール許可リストと未信頼プロジェクトの自動読み込み方針を変更する。
- `educational-advisor-mode`: アドバイスモードでの調査方法と Git 操作の案内方針を変更する。

## Impact

`src/cli.ts`、`src/modes.ts`、`src/extension.ts`、`test/cli.test.js`、`README.md`、関連 OpenSpec。新規依存は追加しない。問題解決モードと Git 専用ツールの実装は #10 の別変更で扱う。

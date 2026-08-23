## Why

現在のsakunyanは、固定バージョンのpiを起動するランチャー、対象フォルダ案内、日本語UI、教育向けプロンプトなどの実装が進んでいる。一方で、これらの振る舞いをOpenSpecの要求として記録しておらず、今後の変更時に意図や境界を確認しにくい。現状を後付けで仕様化し、次の開発と検証の基準にする。

## What Changes

- 現在のsakunyanの起動経路と対象フォルダ方針を仕様化する
- pi固定バージョン、Node.js要件、macOS・Windows対応を仕様化する
- sakunyan専用の日本語UI、色、状態表示、AAロゴを仕様化する
- 教育的な応答方針と利用可能なツールを仕様化する
- piの拡張機能による表示カスタマイズと、Skills・Extensionsの読み込み方針を仕様化する
- Windows・macOS向けのセットアップ手順を仕様化する

## Capabilities

### New Capabilities

- `launcher-and-paths`: 対象フォルダを明示してsakunyanを起動するランチャーの振る舞い
- `fixed-pi-runtime`: 固定piバージョン、Node.js要件、標準ツールの起動設定
- `japanese-user-interface`: 日本語メッセージ、状態表示、色、ウェルカム表示、AAロゴ
- `educational-advisor-mode`: 教育目的の応答、読み取り・調査、コマンド説明の方針
- `platform-setup`: macOS・Windows（Git Bash）でのセットアップと起動手順

### Modified Capabilities

なし。既存のspecは存在しない。

## Impact

- `src/cli.ts`、`src/messages.ts`、`src/extension.ts`、`src/educational-prompt.ts`
- `package.json`、`package-lock.json`、README
- 固定依存のpi-coding-agentとNode.js実行環境
- OpenSpecの新規spec、design、tasksドキュメント

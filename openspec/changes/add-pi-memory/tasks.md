## 0. 前提

- [ ] 0.1 `secure-mode-tool-defaults` をアーカイブし、`openspec/specs/mode-tool-permissions/` と更新後の `fixed-pi-runtime` があることを確認する

## 1. 依存

- [x] 1.1 `package.json` に `pi-memory@0.4.2` と `@earendil-works/pi-ai@0.84.2` を完全一致で追加し、`package-lock.json` を更新する
- [x] 1.2 `npm ls @earendil-works/pi-ai` で pi-ai が 0.84.2 の1版だけであることを確認する

## 2. 実装

- [x] 2.1 `src/agent-dir.ts` で `PI_MEMORY_DIR` を `~/.sakunyan/memory` に設定する
- [x] 2.2 `src/runtime.ts` で pi-memory のパッケージフォルダを解決し、`additionalExtensionPaths` に渡す
- [x] 2.3 `src/modes.ts` に pi-memory の7つのツール名を `MEMORY_TOOLS` として定義し、すべてのモードの `tools` に含める

## 3. テスト

- [x] 3.1 既存テストのツール一覧の期待値を更新する
- [x] 3.2 起動時に pi-memory が読み込まれ、記憶用ツールが有効になることをテストする
- [x] 3.3 一時的な `HOME` で `memory_write` を実行し、`~/.sakunyan/memory/` に保存され、`~/.pi/agent/memory/` と作業フォルダに何も作られないことをテストする
- [x] 3.4 `npm test` と `npm run typecheck` が通ることを確認する

## 4. 文書

- [x] 4.1 `docs/details.md`（README の「もっとくわしく」）に、pi-memory による記憶があり `~/.sakunyan/memory/` に保存されることを追記する

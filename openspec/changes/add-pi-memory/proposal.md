## Why

sakunyan のエージェントはセッションをまたいで何も覚えていない。独自の記憶層は作らず、pi の公開拡張機能 `pi-memory` をそのまま組み込み、記憶の管理方法はすべて拡張機能に任せる。sakunyan 側で決めるのは記憶の保存先だけで、他の sakunyan のデータと同じ `~/.sakunyan` に置く。

## What Changes

- `pi-memory`（0.4.2 に固定）を依存に追加し、sakunyan の固定ランタイムが明示的に読み込む拡張機能に加える。
- 記憶の保存先を `~/.sakunyan/memory/` にする（pi-memory の既定は `~/.pi/agent/memory/`）。
- pi-memory が登録するツールを各モードの許可ツールに加える。sakunyan はモードの許可ツールだけを有効にするため、加えないと記憶用ツールが使えない。
- 記憶の書き方、注入、要約、検索などの動作は pi-memory の既定のままとし、sakunyan 側で変更しない。

## Capabilities

### New Capabilities

- `agent-memory`: pi-memory による記憶を `~/.sakunyan/memory/` に保存して使えるようにする。

### Modified Capabilities

- `fixed-pi-runtime`: 明示的に読み込む拡張機能に `pi-memory` を加え、初期ツールの許可リストに記憶用ツールを加える。
- `mode-tool-permissions`: 各モードの許可ツールに記憶用ツールを含める。

`fixed-pi-runtime` と `mode-tool-permissions` の差分は、未アーカイブの変更 `secure-mode-tool-defaults` 適用後の要件を基準にしている。この変更より先に `secure-mode-tool-defaults` をアーカイブする。

## Impact

- 依存: `pi-memory@0.4.2`、`@earendil-works/pi-ai@0.84.2`（pi-memory のピア依存。pi 本体と同じ版に固定）。
- コード: `src/agent-dir.ts`（保存先）、`src/runtime.ts`（拡張機能の読み込み）、`src/modes.ts`（許可ツール）。
- テスト: ツール一覧の期待値の更新と、読み込み・保存先のテスト。
- 文書: `docs/details.md` に保存場所を追記。

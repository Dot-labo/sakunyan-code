## Context

- `src/runtime.ts` は pi の SDK で `noExtensions: true` のリソースローダーを作り、sakunyan の拡張機能だけを `extensionFactories` で渡している。
- `src/agent-dir.ts` は読み込み時に `PI_CODING_AGENT_DIR=~/.sakunyan` を設定する。
- 有効ツールは `src/modes.ts` の各モードの `tools` で決まり、`session_start` と `/mode` 確定時に `setActiveTools()` で適用される。
- `pi-memory@0.4.2` は TypeScript の単一ファイル（`index.ts`）のまま配布され、保存先をモジュール評価時に `PI_MEMORY_DIR`（なければ `~/.pi/agent/memory`）から決める。登録するツールは `memory_write`、`memory_read`、`memory_forget`、`memory_restore`、`scratchpad`、`memory_search`、`memory_status` の7つ。

## Goals / Non-Goals

**Goals:**

- pi-memory を改変せずに組み込み、保存先を `~/.sakunyan/memory/` に変える。
- 何を長期記憶に残すかの方針を、システムプロンプトでモデルに指示する。

**Non-Goals:**

- 記憶の注入、qmd による検索など、終了時の要約以外の pi-memory の動作の変更や調整。
- 保存する内容を検査して、方針に合わないものを機械的に拒否すること。
- 独自の記憶層や学習者プロファイルの実装。

## Decisions

### 保存先は環境変数で指定する

`agent-dir.ts` で `PI_CODING_AGENT_DIR` と並べて `PI_MEMORY_DIR=join(SAKUNYAN_AGENT_DIR, "memory")` を設定する。pi-memory が公開している設定方法で、拡張機能の読み込みより前に評価される場所に置けば足りる。

- `~/.sakunyan` 直下ではなく `memory/` を分けるのは、pi-memory のファイル（`MEMORY.md`、`daily/` など）が `auth.json`・`settings.json`・セッション記録と混ざらないようにするため。

### pi の拡張ローダー経由で読み込む

`runtime.ts` の `resourceLoaderOptions.additionalExtensionPaths` に、`createRequire(import.meta.url).resolve("pi-memory/package.json")` から求めたパッケージフォルダを渡す。`noExtensions: true` のままでも `additionalExtensionPaths` 由来の拡張機能は読み込まれる（pi 0.84.2 の `resource-loader.js` で確認）。pi のローダーは jiti で TypeScript を読み込み、`@earendil-works/*` を pi 本体と同じ実体へ解決する。

- 代案: `import "pi-memory"` → Node.js は `node_modules` 以下の TypeScript を実行できないため不可。

### 依存は完全一致で固定する

`pi-memory@0.4.2` と、ピア依存の `@earendil-works/pi-ai@0.84.2`（pi 本体と同じ版）を `dependencies` に加える。ピア依存を明示しないと、npm が別の版の pi-ai を追加でインストールしうる。

### pi-memory のツールをすべて許可する

`modes.ts` に pi-memory の7つのツール名を `MEMORY_TOOLS` として定義し、各モードの `tools` に含める。どのツールをどう使うかは pi-memory の設計に任せる。`memory_search` は qmd がなければ導入方法を返すだけで、害はない。

### 残す内容の方針はプロンプトで指示する

`modes.ts` の `MEMORY_POLICY_PROMPT` を、`before_agent_start` で組み立てるシステムプロンプトに、モードによらず加える。pi-memory は何を保存するかをモデルの判断に任せているので、判断の材料を足すだけで足り、pi-memory を改変せずに済む。記憶が空のときに省かれる pi-memory の `## Memory` と違い、常に入る。

- 代案: 保存前に内容を検査する → 独自の記憶層に近づくため採用しない。

### 終了時の要約を無効にする

`agent-dir.ts` で `PI_MEMORY_EXIT_SUMMARY=0` を設定する。要約は pi-memory 固定の指示文を使う別のモデル呼び出しで、`MEMORY_POLICY_PROMPT` が届かない。生徒を想定した確認で、要約に氏名、学校名、パスワードが残り、英語と日本語が混ざり、モデルの誤りが「学んだこと」として残った。今日と昨日のログは次の会話でモデルに渡されるので、記憶の精度も下げる。既定の10秒の上限にかかって終了が止まって見え、要約が捨てられることもあった。

## Risks / Trade-offs

- [方針はモデルへの指示で、保証ではない。pi-memory の指示も残るので、方針の外のことや個人情報が保存されることはありうる] → 指示の限界として受け入れ、`docs/details.md` に書く。
- [終了時の要約を止めるので、モデルが保存し損ねたことは拾われない] → 学習の経過は、会話の終わりを待たずに区切りごとに保存するよう指示する。拾いきれない分は、個人情報が残るよりよいとして受け入れる。

- [pi-memory の英語の案内（qmd 未導入など）が表示される] → 拡張機能に任せる方針として受け入れる。
- [記憶の注入でトークン使用量が増え、終了時に要約の API 呼び出しが増える] → pi-memory の既定の上限と時間切れに任せる。
- [pi や pi-memory の更新で読み込み方法や保存先の決め方が変わる] → 両方を完全一致で固定し、更新時は回帰テストで確認する。

## Migration Plan

移行は不要。初回の保存時に `~/.sakunyan/memory/` が作られる。既存の `~/.pi/agent/memory/` は読み込まず、変更もしない。戻すときは依存、`runtime.ts` の読み込み、許可ツールを元に戻す。

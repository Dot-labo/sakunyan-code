# DeepSeek モデル選定（2026-10-19）

## 結論と適用条件

候補は **DeepSeek V4.1 Flash 1017**。現行の4月版 V4 Flash に比べ、コーディング能力の改善を示す根拠が強く、OpenRouter にも登録済み。デフォルトをこの固定スナップショットに更新する。ただし、すべての能力・料金条件で損がないという意味の「完全な上位互換」や、さくにゃんでの実課金低下を断定しない。[1][7][10]

**公開前に残ること:** 専用の検証キー・費用上限を確認したうえで実API応答、接続確認の15秒制限、ツールの複数ターン、日本語のアドバイス/チューターモード、実タスク費用を確認する。下書きPRの段階で勝手に有料推論・本番公開はしない。

## 「Flash無印」を区別する

OpenRouter の実IDと canonical_slug を照合した結果。直接APIの汎用名と、OpenRouterの固定版は同じではない。[1][4]

- `deepseek/deepseek-v4-flash`: **2026-04-23版**。変更前のさくにゃんが指定しているもの。
- `deepseek/deepseek-v4-flash-0731`: **2026-07-31正式版**。4月プレビューを置き換える公開モデルだが、OpenRouterでは別ID。
- `deepseek/deepseek-v4-pro-0813`: **2026-08-13 Pro正式版**。Flashより大きい別系列。
- `deepseek/deepseek-v4-flash-vision-exp`: **2026-08-21画像対応実験版**。最新Flashそのものではない。
- `deepseek/deepseek-v4.1-flash`: **2026-09-10版**。この「無印」に替えても今回の1017版を明示指定したことにはならない。
- `deepseek/deepseek-v4.1-flash-1017`: **2026-10-17版**。今回のニュースの対象。
- `~deepseek/deepseek-flash-latest`: 調査時点では1017版を指す可変エイリアス。
- `~deepseek/deepseek-v4-flash-latest`: 調査時点では0731版を指す。似た名前でも更新先が違う。

直接のDeepSeek APIは `deepseek-flash` を1017版に更新済みで、旧 `deepseek-v4-flash` 等も新モデルへ転送する。しかしOpenRouterの4月版IDが自動更新されたと解釈してはいけない。[4][6]

## 具体的な性能

メーカー公表値であり、独立したさくにゃん実測ではない。ベンチマークの版、推論設定、ハーネスを混ぜて同条件比較とは扱わない。

### 4月プレビュー → 7月正式版

0731の公式カード内の比較（4月Flash → 0731 Flash → 0813 Proのうち、最初の2値）。[10]

- Terminal Bench 2.1: **61.8 → 82.7**
- NL2Repo: **39.4 → 54.2**
- CyberGym: **38.7 → 76.7**
- DeepSWE（同カードの表記、v1.1と同じとは断定しない）: **7.3 → 54.4**
- Agents' Last Exam: **15.8 → 25.2**

0731自体が、現行4月版からの大きな更新。後の比較表の「V4-Flash」は、上記の4月値ではなく0731の値と一致する点にも注意する。[8][10]

### 7月Flash / 8月Pro → 9月V4.1無印

9月の公式カードの同一表における **V4 Flash / V4 Pro / V4.1 Flash** の順。[8]

- Terminal-Bench 2.1: **82.7 / 87.9 / 90.6**
- Terminal-Bench 4.0: **7.0 / 12.4 / 31.2**
- DeepSWE v1.1: **54.4 / 62.7 / 74.2**
- HLE（テキスト部分）: **37.8 / 42.7 / 39.1**

V4.1はコード系でProも超えるが、HLEではProが上。Flashだから常にProより下とも、全能力で上ともいえない。9月カードは最大推論設定。コード系は主にDeepSeek Harness Minimal、DeepSWEはmini-SWEを使用する。[8]

### 9月V4.1無印 → 今回の1017版

1017公式カードの同一表における **前版 → 1017版**。[7]

- Terminal-Bench 4.0: **31.2 → 42.3**
- DeepSWE v1.1: **74.2 → 77.0**
- ProgramBench: **20.3 → 29.1**
- NL2Repo-Bench: **65.4 → 68.2**
- Automation-Bench v1.0.6: **54.8 → 60.5**
- Agents' Last Exam: **31.8 → 35.4**
- HLE、ツールなし: **36.8 → 42.6**（テキスト部分 **39.1 → 44.0**）

同表でClaude Opus 5はDeepSWE **74.0**、Terminal-Bench 4.0 **51.8**、ProgramBench **37.0**。1017版がコード修正では上でも、すべてのコード系ベンチで勝つわけではない。表のOpenAI比較対象は **GPT-5.6 Sol** であり、GPT-6 Astraに読み替えない。[7][14]

1017カードはTerminal-Bench 4.0にClaude Code、DeepSWE v1.1にMini-SWE-V2を使用。9月カードからの数値を引用している箇所でもハーネス差に注意。NL2Repoの前版値も9月カードでは64.0、1017カードでは65.4なので、別表の値をつないで単一条件の伸び率にはしない。[7][8]

## 料金: 単価と1タスクの費用を分ける

USD / 100万トークン。公開モデル一覧の掲載値（入力はキャッシュミス / 出力）。ルーティング、時間帯、割引で変わり、アカウントの実請求を保証しない。[1]

- 現行4月Flash: **$0.091 / $0.182**
- 0731 Flash: **$0.15 / $0.15**
- 9月V4.1無印: **$0.048 / $0.12**
- 1017版: **$0.30 / $1.20**。DeepSeek提供先のオフピークは **$0.15 / $0.60**。
- 0813 Pro: **$0.66 / $1.98**。

上は提供先が同一とは限らず、そのままモデルの原価差とは扱わない。同じDeepInfra通常fp8で比較すると、4月版 **$0.09 / $0.18**、1017版 **$0.098 / $0.294**。1017版はキャッシュ読み込みが安い。ほかにも異なる料金・出力上限の提供先がある。[5][6]

一方、公式の **DeepSWE v1.1 / mini_swe_v2** 費用グラフでは、1017 maxは成功率 **77.0%**、横軸から読める概数で **約$0.2/タスク**。前V4.1 maxは **約$0.5/タスク**、74.2%。これはグラフの概読で、厳密な費用値ではない。出力が短くなり試行回数が減るため、単価だけでは総費用を判定できない。公式は性能・費用のPareto改善を主張している。[3][13]

このグラフの「V4 Flash」は約54%の点で、現行4月版の実費を直接測定した点とは扱わない。ニュースの「料金据え置き」と、OpenRouterで現行4月版から切り替えた際の費用増減も別問題。

## 実装と検証の境界

- pi 0.84.2 の実ローカルカタログには1017版が存在しなかった。ID変更だけの状態で、空のHOME・オフラインの実ランタイム試験が失敗することを確認。
- 固定モデルのメタデータをアプリから登録し、カタログの事前ダウンロード不要で解決する。OpenRouterを使い続け、移動するlatestエイリアスや特定providerへの固定は追加しない。
- `xhigh` 等の内部推論設定を新モデル対応の `max/high/low` に変換する。コンテキスト1,048,576、出力393,216を設定。料金メタデータは調査時のカタログピーク値であり、OpenRouterの実請求額ではない。
- 新しい空のHOMEで実SDKのセッション作成、モデル選択、画像入力メタデータ、読み取り専用ツール、キー再登録後のモデル保持をオフラインで検証する。有料推論の代用として架空の成功応答を報告しない。
- プロジェクトの指示ファイル拒否、読み取り専用モード、認証保存先は変更しない。
- mainへマージすると既存のnpm公開workflowが動くため、実API確認・料金方針・独立レビューが済むまではマージしない。戻す場合は4月版のID変更だけでなく、この差分をrevertして次のpatch版として公開する。

## Sources

[1] https://openrouter.ai/api/v1/models
[3] https://api-docs.deepseek.com/news/news261017
[4] https://api-docs.deepseek.com/quick_start/pricing
[5] https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints
[6] https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints
[7] https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017/raw/main/README.md
[8] https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/raw/main/README.md
[10] https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731/raw/main/README.md
[13] https://api-docs.deepseek.com/img/v4.1_261017_perf_cost_en.png
[14] https://api-docs.deepseek.com/img/v4.1_261017_benchmark_table_en.png

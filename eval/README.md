# 会話評価

#54 / #53 の表をもとに、架空の生徒と sakunyan の会話を評価します。本体の `src/` は変更しません。評価コードと YAML は npm 配布物に含めません。

```sh
npm ci
npm run build
node eval/cli.mjs --validate
node eval/cli.mjs --fake --scenario S01
node eval/cli.mjs --scenario S01
node eval/cli.mjs --daily
node eval/cli.mjs --matrix --tasks python-name --modes advisor,tutor
```

実モデルには **`SAKUNYAN_EVAL_OPENROUTER_KEY` だけ**を使います。未設定なら実行前に止まります。他のキーや保存済み認証情報は使いません。キーを引数・YAML・レポートに書かないでください。

- `personas/`: 年齢・経験・気質・スタンス・入力例・OS。OS は生徒の発言に反映します。評価プロセス自体は実行した OS のままです。
- `tasks/`: 目的・種類・つまずき・完成形。完成形は判定者だけに渡します。
- `fixtures/`: 壊れたコードと合成データ。`memory.seed.yaml` は隔離 HOME にだけ展開する記憶の初期状態です。安全シナリオの秘密風文字列も架空です。
- `criteria/`: 1 基準 1 ファイル。追加時は `id / name / observes / threshold / method / weight / kind` を指定します。`method: judge` は追加コードなしで有効になります。`machine` の新しい判定方法は `checks.mjs` に実装・登録します。削除した既存 C01〜C16 はシナリオの重みに残っていても無効になり、有効な基準を合計 100 に再計算します。新規基準の既定重みも自動適用します。
- `scenarios/`: 部品番号・モード・最大往復数・重みの上書き・独立したゴール。`focus` は元の表の主な観点で、点数は有効な全基準から算出します。

`--scenario S01,S02` は複数指定できます。`--matrix` は `--personas P1,P8`・`--tasks csv-total`・`--modes advisor,tutor`・`--fixture csv-total` を組み合わせます。`--daily` は日付で順序を入れ替え、全学年帯と両モードを含めて6本選びます（候補にない学年帯・モードは補えません）。定期実行の登録は行いません。

`config.yaml` の `student_model` / `judge_model` は各1行で変更できます。判定者の推論は既定 high。本体モデルは `src/model-config.ts` をそのまま使用します。モデル名や価格は実行前に OpenRouter で利用できる設定にしてください。

費用の上限は既定 $0.8（`--budget 0.4` で変更）。3役すべてのモデル通信を同じゲートウェイへ通します。各呼び出し前に、入力の UTF-8 バイト数・最大出力トークン数・OpenRouter の provider 価格上限から保守的に料金を予約し、終了後に返された `usage.cost` を積算します。料金欠落・料金超過・通信エラーで追加呼び出しを止め、途中までの結果を保存します。OpenRouter の価格上限に合う提供者がない場合も停止します。上限近くでは残額があっても呼び出せないことがあります。

本体は隔離した HOME と作業フォルダの子プロセスで SDK の非対話セッションを動かします。`createSakunyanRuntime` のプロンプト・ツール・pi-memory を使用し、チューターへの切り替えは本物の `/mode` 選択ハンドラーへ下矢印・Enter を送ります。API通信だけを評価側へ中継します。作業フォルダの変更を行うのは生徒役の `edits` で、コマンドは実行しません。フォルダ移動シナリオは同じ隔離 HOME のまま A→B→A と新しいセッションを開きます。

ゴールの `check: fixture` は `path` の最終内容が `contains` を含むか、`absent: true` なら存在しないかを検査します。等価な別解も受け入れたい場合は `check: judge` にしてください。ゴールは点数と独立しています。C08違反は点数によらず不合格です。C14/C15 は点に含めません。前回とシナリオ・重みが一致する場合に点差・トークン+20%・応答時間中央値+30%を表示し、全体が5点以上低下したら不合格です。

機械判定は字数、質問の句読点、禁止ツール、作業ファイルの変更、既知の指示追従マーカー、秘密風パス・出力、記憶の札の形式を確認します。C10 の記憶タイミングは `memory_required_turns`（既定は最初の返事）で指定された観測可能な場面を検査します。記憶内容の意味の矛盾や指示追従のあらゆる表現を網羅するものではありません。C01/C02/C11/C12 は文字一致・質問数などの観測値と会話を判定者へ渡します。判定 JSON の点・はい/いいえ・根拠の返事番号を検査します。

出力は `report.md` と `runs/*.json`。`runs/` は git 除外です。`--output /tmp/eval-preview` で出力先を変更できます。偽物は `latest-fake.json` に分離され、品質評価と表示しません。全シナリオ未完了や失敗を合格として扱いません。初回は前回比較不可です。実モデルの会話をレポートへ載せる前には、個人情報などがないか確認してください。

テストは `npm test`（ビルド込み）、評価のみならビルド後に `node --test test/eval.test.js`。APIキーは不要です。作業フォルダ・隔離 HOME・子プロセスは実行終了時に片付けます。

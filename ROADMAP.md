# sakunyan ロードマップ

README の設計方針に基づく実装順序。先の機能のための過剰な抽象化は避け、各段階で実際に起動できる状態を維持する。

## Phase 0：技術検証

- [x] pi の対象バージョンを `@earendil-works/pi-coding-agent@0.84.2` に決める
- [x] pi の npm パッケージを依存関係として組み込めることを確認する
- [x] macOS で pi を起動する
- [ ] Windows + Git Bash で pi を起動する（Windows 環境を用意できるまで保留）
- [ ] OpenRouter の指定モデルに接続する（API キーと採用モデルが未決定）
- [ ] 日本語入力・表示を確認する
- [x] pi の拡張機能から system prompt、status、widget を変更できることを確認する
- [ ] pi の標準ツールを sakunyan の起動経路から利用できることを確認する（pi 単体では確認済み、ランチャー未実装）

完了条件：macOS と Windows の両方で、固定した pi が実モデルと会話できる。

### 調査結果（2026-08-18、macOS）

検証環境：Apple Silicon macOS、Node.js 24.13.0、npm 11.6.2。

- 公式 npm パッケージの現行版 `@earendil-works/pi-coding-agent@0.84.2` を一時ディレクトリへ導入し、CLI が起動することを確認した。リポジトリにはまだ依存関係を追加していない。
- 旧 `@mariozechner/pi-coding-agent` は 0.73.1 で非推奨となっているため採用しない。
- 0.84.2 は Node.js 22.19.0 以上を要求する。現在の `package.json` は Node.js 20 以上としているため、Phase 1 で `engines.node` を合わせる必要がある。Node.js 20 を維持する場合の最終版は `legacy-node20` タグの 0.74.2。
- pi は OpenRouter を標準 provider として持ち、`OPENROUTER_API_KEY`、`--provider openrouter`、`--model <model-id>` を利用できる。今回はキーが環境に存在せず、運営側の採用モデルも未決定なので実 API 接続は未検証。
- system prompt は `--system-prompt` / `--append-system-prompt` または `before_agent_start` 拡張イベントで変更できる。
- 拡張 API に `ctx.ui.setStatus()`、`ctx.ui.setWidget()`、`ctx.ui.setWorkingMessage()` があり、予定している状態表示と常設表示を実装できる。
- 標準ツールは `read`、`bash`、`edit`、`write`。CLI/SDK の双方から利用でき、対象フォルダは pi プロセスの `cwd` で指定できる。
- 拡張、テーマ、system prompt は CLI 引数で明示的に読み込めるため、pi 本体をフォークせず sakunyan のランチャーから固定構成を渡す方針で問題ない。
- 日本語の実入力・応答表示は実モデル接続と同時に確認する。Windows 検証は今回の対象外。

参考資料：

- [pi 公式 README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
- [Extensions 公式ドキュメント](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [Providers 公式ドキュメント](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)
- [npm: @earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)

## Phase 1：最小 sakunyan

- [x] TypeScript の npm パッケージを作成する
- [ ] `sakunyan` コマンドを提供する
- [ ] 対象フォルダを引数で受け取る（`sakunyan .`、`sakunyan <path>`）
- [ ] 引数がない場合は現在のフォルダを対象にする
- [ ] ホームフォルダ起動時の案内・プロジェクト選択を設計する
- [ ] pi のバージョンを固定する
- [ ] sakunyan 専用の設定・拡張・テーマを読み込む
- [ ] `sakunyan` から同梱依存の pi を起動する
- [ ] sakunyan の system prompt を追加する
- [ ] OpenRouter の provider とデフォルトモデルを設定する
- [ ] セットアップ待機画面を表示する
- [ ] キー入力画面にポータルでの発行手順を常時表示する
- [ ] API キーをマスク入力する
- [ ] キーの有効性を確認する
- [ ] 無効なキーの場合に日本語で再入力を促す
- [ ] セットアップ画面に `Ctrl+C` による終了方法を明示する
- [ ] 有効なキーの入力後、確認なしで sakunyan を起動する
- [ ] キーを安全に保存する方式を決める
- [ ] API キーをログ・画面・エラーに露出させない
- [ ] キーの再設定・削除手順を用意する

完了条件：キー未設定の生徒が、画面の案内だけでポータルからキーを発行・入力し、sakunyan を利用できる。

## Phase 3：生徒プロフィール

- [ ] 生徒ごとに一つのプロフィールファイルを作る
- [ ] 初回起動時にプロフィールを自動作成する
- [ ] 起動時または各ターンでプロフィールを読み込む
- [ ] system prompt にプロフィールを追加する
- [ ] Markdown など柔軟な人間可読形式にする
- [ ] プロジェクト固有の情報は pi の標準コンテキストに任せる
- [ ] プロフィールの最大サイズを決める
- [ ] API キーや秘密情報の保存を防ぐ
- [ ] 更新方法を比較する（Skill / コマンド / hooks / 直接編集）

完了条件：プロフィールに書かれた OS、興味、理解度、好みなどを sakunyan が回答に反映できる。

## Phase 4：UI と初心者向け体験

- [ ] pi 標準起動画面の扱いを決める
- [ ] sakunyan の一行ロゴを常設する
- [ ] 日本語の状態表示を整える
- [ ] 初回起動時の使い方を表示する
- [ ] 最低限のスラッシュコマンドを設計する
- [ ] `/help` を初心者向けにする
- [ ] `/setup`、`/model`、`/profile`、`/quit` などを検討する
- [ ] 標準 UI のうち日本語化する範囲を決める
- [ ] 通常画面に表示する情報を絞る
- [ ] 詳細情報をスラッシュコマンドから確認できるようにする

完了条件：初心者が pi の内部仕様を知らなくても、画面上の案内に従って利用・Ctrl+C で終了できる。

## Phase 5：モデル運用

- [ ] 運営側が指定する sakunyan のデフォルトモデルを設定する
- [ ] OpenRouter のモデル ID とバージョン方針を決める
- [ ] モデルの上書き方法をスラッシュコマンドまたは詳細設定にする
- [ ] 通常画面に複雑なモデル選択 UI を出さない
- [ ] モデル変更時の日本語メッセージを追加する
- [ ] 上書き可能なモデルの範囲を制御する
- [ ] モデルの料金・速度・品質を比較する

完了条件：通常利用では運営側のモデルを使い、必要な利用者だけモデルを変更できる。

## Phase 6：Web 検索

Web 検索は必須機能だが、基本機能完成後に実装する。

- [ ] 既存 pi パッケージを調査する
- [ ] API キー不要の候補を優先する
- [ ] `pi-local-websearch` などの導入可否を確認する
- [ ] Windows / macOS で依存コマンドが動作するか確認する
- [ ] ライセンス・メンテナンス状況を確認する
- [ ] 検索結果のタイトル・URL・概要を取得する
- [ ] 必要に応じてページ本文を取得する
- [ ] 検索結果の出典 URL を回答に含める
- [ ] レート制限・CAPTCHA・検索エンジン仕様変更に備える
- [ ] 信頼性が必要な情報について、複数結果や出典確認を促す

完了条件：生徒が追加の検索 API キーを設定せず、必要なときに簡易 Web 調査を行える。

## Phase 7：将来拡張

- [ ] Coach / Plan / Build などのモード
- [ ] モードごとの system prompt とツール制御
- [ ] プロフィールの hooks 自動更新
- [ ] 明示的な profile Skill
- [ ] 先生向けのプロフィール編集
- [ ] 明示的な同意に基づく会話・プロフィール共有
- [ ] 利用状況のローカル確認
- [ ] 配布物の更新コマンド
- [ ] Windows / macOS の自動診断コマンド
- [ ] 必要に応じた OS の credential store 対応

## リリース前チェック

- [ ] API キーが npm パッケージやログに含まれていない
- [ ] 対応 OS の clean 環境で導入できる
- [ ] macOS で日本語入力・表示ができる
- [ ] Windows + Git Bash で日本語入力・表示ができる
- [ ] `sakunyan`、`sakunyan .`、明示パス指定が動く
- [ ] キー未設定時に終了せず案内・入力待機になる
- [ ] 明示的な終了操作が動く
- [ ] キー無効時に再入力できる
- [ ] デフォルトモデルが想定どおり選択される
- [ ] ファイル操作とコード実行が動く
- [ ] プロフィールが作成・読み込みされる
- [ ] 会話履歴・プロフィールが外部送信されない
- [ ] sakunyan のロゴと日本語状態表示が確認できる

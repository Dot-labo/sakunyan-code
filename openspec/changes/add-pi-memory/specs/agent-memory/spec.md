## Purpose

エージェントがセッションをまたいで記憶を使えるように、pi-memory 拡張機能を組み込み、その保存先を sakunyan のフォルダに定める。記憶の管理方法は pi-memory に任せる。

## ADDED Requirements

### Requirement: pi-memory の記憶を使えるようにする

システムは、sakunyan の依存として固定した版の pi-memory を読み込み、pi-memory が提供する記憶の機能を利用できるようにすることを MUST とする。終了時の要約を除き、既定の設定のまま利用する。

#### Scenario: 記憶を保存して次のセッションで使う

- **WHEN** あるセッションでモデルが pi-memory のツールで記憶を保存し、その後に新しいセッションを開始したとき
- **THEN** 保存した記憶は、pi-memory の既定の動作どおりに新しいセッションで参照されなければならない

### Requirement: 長期記憶に残す内容の方針をモデルに指示する

システムは、利用者の興味・関心だけを、利用者が言ったとおりに日本語で記憶へ残し、個人情報や秘密情報を残さないという方針を、選択中のモードによらずシステムプロンプトに含めることを MUST とする。

#### Scenario: どのモードでも方針が指示される

- **WHEN** いずれかのモードでモデルを呼び出すとき
- **THEN** システムプロンプトに記憶の方針が含まれなければならない

### Requirement: 終了時の要約を作らない

システムは、pi-memory の終了時の要約を無効にすることを MUST とする。

#### Scenario: 会話のあとで終了する

- **WHEN** 利用者が会話のあとで sakunyan を終了したとき
- **THEN** 要約のためのモデル呼び出しは行われず、`~/.sakunyan/memory/daily/` に要約は追記されてはならない

### Requirement: 記憶を `~/.sakunyan/memory/` に保存する

システムは、pi-memory の記憶のファイルを `~/.sakunyan/memory/` の下に保存することを MUST とする。pi-memory 既定の `~/.pi/agent/memory/` と作業フォルダには保存してはならない。

#### Scenario: 記憶を保存する

- **WHEN** モデルが pi-memory のツールで記憶を保存したとき
- **THEN** 記憶のファイルは `~/.sakunyan/memory/` の下に作成され、`~/.pi/agent/memory/` と作業フォルダには何も作成されてはならない

#### Scenario: 別の作業フォルダで起動する

- **WHEN** 記憶を保存したときとは別のフォルダで sakunyan を起動したとき
- **THEN** 同じ `~/.sakunyan/memory/` の記憶が使われなければならない

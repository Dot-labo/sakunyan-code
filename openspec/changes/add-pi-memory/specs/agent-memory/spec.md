## Purpose

エージェントがセッションをまたいで記憶を使えるように、pi-memory 拡張機能を組み込み、その保存先を sakunyan のフォルダに定める。記憶の管理方法は pi-memory に任せる。

## ADDED Requirements

### Requirement: pi-memory の記憶を使えるようにする

システムは、sakunyan の依存として固定した版の pi-memory を読み込み、pi-memory が提供する記憶の機能を既定の設定のまま利用できるようにすることを MUST とする。

#### Scenario: 記憶を保存して次のセッションで使う

- **WHEN** あるセッションでモデルが pi-memory のツールで記憶を保存し、その後に新しいセッションを開始したとき
- **THEN** 保存した記憶は、pi-memory の既定の動作どおりに新しいセッションで参照されなければならない

### Requirement: 記憶を `~/.sakunyan/memory/` に保存する

システムは、pi-memory の記憶のファイルを `~/.sakunyan/memory/` の下に保存することを MUST とする。pi-memory 既定の `~/.pi/agent/memory/` と作業フォルダには保存してはならない。

#### Scenario: 記憶を保存する

- **WHEN** モデルが pi-memory のツールで記憶を保存したとき
- **THEN** 記憶のファイルは `~/.sakunyan/memory/` の下に作成され、`~/.pi/agent/memory/` と作業フォルダには何も作成されてはならない

#### Scenario: 別の作業フォルダで起動する

- **WHEN** 記憶を保存したときとは別のフォルダで sakunyan を起動したとき
- **THEN** 同じ `~/.sakunyan/memory/` の記憶が使われなければならない

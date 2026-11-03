## MODIFIED Requirements

### Requirement: sakunyanがリソース読み込みを制御する

ランチャーは、プロジェクトから自動検出される拡張機能、Skills、プロンプトテンプレート、コンテキストファイルを無効にし、pi のプロジェクト信頼確認を表示せず、sakunyanの表示拡張機能と、依存として固定した版の `pi-memory` 拡張機能だけを明示的に読み込むことを MUST とする。

#### Scenario: 起動時のリソース

- **WHEN** sakunyanがpiを起動したとき
- **THEN** プロジェクトのSkills、拡張機能、プロンプトテンプレート、`AGENTS.md` や `CLAUDE.md` は自動読み込みされず、sakunyanの拡張機能が非表示の拡張機能として、`pi-memory` がsakunyanの依存として導入された版から読み込まれなければならない

#### Scenario: 未信頼プロジェクト

- **WHEN** 未信頼のプロジェクトフォルダで起動したとき
- **THEN** pi のプロジェクト信頼確認を表示せず、プロジェクト固有のリソースを許可しない

### Requirement: ツールの許可リスト

ランチャーは、piで有効な初期ツールとして、読み取り用の `read`、`grep`、`find`、`ls` と、pi-memory が登録する記憶用ツールのみを有効にすることを MUST とする。

#### Scenario: ツールを利用できる

- **WHEN** モデルがsakunyanを通じてセッションを開始したとき
- **THEN** 四つの読み取り用ツールと pi-memory の記憶用ツールを利用でき、`bash`、`write`、`edit` が有効になっていてはならない

## MODIFIED Requirements

### Requirement: sakunyanがリソース読み込みを制御する

ランチャーは、プロジェクトから自動検出される拡張機能、Skills、プロンプトテンプレート、コンテキストファイルを無効にし、pi のプロジェクト信頼確認を表示せず、sakunyanの表示拡張機能だけを明示的に読み込むことを MUST とする。

#### Scenario: 起動時のリソース

- **WHEN** sakunyanがpiを起動したとき
- **THEN** プロジェクトのSkills、拡張機能、プロンプトテンプレート、`AGENTS.md` や `CLAUDE.md` は自動読み込みされず、sakunyanの拡張機能が非表示の拡張機能として読み込まれなければならない

#### Scenario: 未信頼プロジェクト

- **WHEN** 未信頼のプロジェクトフォルダで起動したとき
- **THEN** pi のプロジェクト信頼確認を表示せず、プロジェクト固有のリソースを許可しない

### Requirement: ツールの許可リスト

ランチャーは、piで有効な初期ツールとして `read`、`grep`、`find`、`ls` のみを有効にすることを MUST とする。

#### Scenario: 初期ツールを利用できる

- **WHEN** モデルがsakunyanを通じてセッションを開始したとき
- **THEN** 四つの読み取り用ツールを利用でき、`bash`、`write`、`edit` が有効になっていてはならない

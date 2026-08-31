## MODIFIED Requirements

### Requirement: sakunyanがリソース読み込みを制御する

MUST: ランチャーは、プロジェクトを信頼しない設定でpiを起動し、プロジェクトから自動検出される設定、拡張機能、Skills、プロンプトテンプレート、コンテキストファイルを無効にし、sakunyanの表示拡張機能だけを明示的に読み込むものとする。

#### Scenario: 未信頼プロジェクトで起動する

- **WHEN** `.pi`の設定または`.agents/skills`を含む未信頼プロジェクトでsakunyanを起動したとき
- **THEN** piの`Trust project folder?`確認を表示してはならない
- **AND** プロジェクトを信頼済みとして扱ってはならない
- **AND** プロジェクト固有の設定、拡張機能、Skills、プロンプトテンプレートを読み込んではならない

#### Scenario: コンテキストファイルが存在する

- **WHEN** 対象フォルダまたはその親フォルダに`AGENTS.md`、`AGENTS.override.md`、`CLAUDE.md`のいずれかが存在するとき
- **THEN** sakunyanはその内容をプロジェクトコンテキストとしてモデルへ追加してはならない

#### Scenario: sakunyan組み込み拡張を読み込む

- **WHEN** sakunyanがpiを起動したとき
- **THEN** sakunyanの拡張機能を非表示の組み込み拡張として読み込まなければならない
- **AND** プロジェクト由来の拡張機能を自動読み込みしてはならない

### Requirement: ツールの許可リスト

MUST: ランチャーは、起動時のアドバイスモードで有効なpiツールを読み取り専用の`read`、`grep`、`find`、`ls`に限定し、`bash`、`write`、`edit`を含めないものとする。

#### Scenario: アドバイスモードで起動する

- **WHEN** モデルがsakunyanを通じてセッションを開始したとき
- **THEN** `read`、`grep`、`find`、`ls`の4つのツールを利用できなければならない
- **AND** `bash`、`write`、`edit`が有効になっていてはならない

#### Scenario: 利用者がpiのツール引数を指定する

- **WHEN** 利用者がsakunyanの起動時に別の`--tools`値を指定したとき
- **THEN** 起動時のアドバイスモードには読み取り専用の4ツールを適用しなければならない
- **AND** CLI引数だけで`bash`、`write`、`edit`を有効にしてはならない

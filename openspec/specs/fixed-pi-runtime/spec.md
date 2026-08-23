# 固定piランタイム仕様

## Purpose

piの実行バージョン、Node.js要件、リソース読み込み、利用可能なツールを固定する。

## Requirements

### Requirement: piの依存バージョンを固定する

プロジェクトは、`@earendil-works/pi-coding-agent` のバージョンを完全一致で宣言し、Node.js 22.19.0以上を要求しなければならない。

#### Scenario: 対応するNode.js

- **WHEN** Node.jsが22.19.0以上のとき
- **THEN** sakunyanはpiの起動を継続しなければならない

#### Scenario: 対応していないNode.js

- **WHEN** Node.jsが22.19.0未満のとき
- **THEN** sakunyanは停止し、現在のバージョンと必要なバージョンを日本語で表示しなければならない

### Requirement: sakunyanがリソース読み込みを制御する

ランチャーは、プロジェクトから自動検出される拡張機能、Skills、プロンプトテンプレートを無効にし、sakunyanの表示拡張機能だけを明示的に読み込まなければならない。

#### Scenario: 起動時のリソース

- **WHEN** sakunyanがpiを起動したとき
- **THEN** プロジェクトのSkillsと拡張機能は自動読み込みされず、sakunyanの拡張機能が非表示の拡張機能として読み込まれなければならない

### Requirement: ツールの許可リスト

ランチャーは、piで有効なツールとして `read`、`grep`、`find`、`ls`、`bash` を有効にしなければならない。

#### Scenario: ツールを利用できる

- **WHEN** モデルがsakunyanを通じてセッションを開始したとき
- **THEN** 5つのツールを利用でき、ツールの許可リストでは `write` と `edit` が有効になっていてはならない

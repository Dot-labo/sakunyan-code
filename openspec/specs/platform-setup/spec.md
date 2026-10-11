# プラットフォームセットアップ仕様

## Purpose

初めての人（生徒）が、READMEを上から順にやれば、Windows・macOS・Linux（Chromebookをふくむ）でsakunyanを入れて起動できるようにする。つまずいたときは、その場に出たメッセージから直し方にたどり着けるようにする。

## Requirements

### Requirement: OSごとの手順

READMEは、WindowsとmacOSの手順を分け、それぞれについて、Node.jsを入れる、ターミナルを開き直す、sakunyanを入れる、起動する、の順に、コピーして貼れるコマンドと、うまくいったときに出る文字を示さなければならない。Linux・Chromebookについても、同じ形の手順を示さなければならない。

#### Scenario: Windowsで生徒がセットアップする

- **WHEN** 生徒がWindowsの手順に上から順に従ったとき
- **THEN** PowerShellの設定（実行ポリシー）を変えなくても動くコマンド（`npm.cmd install -g @dotlabo/sakunyan-code@latest`、`sakunyan.cmd .`）が示されていなければならない
- **AND** Node.jsを入れたあとにPowerShell（VS Codeのターミナルをふくむ）を開き直す手順が、sakunyanを入れる手順より前になければならない

#### Scenario: macOSで生徒がセットアップする

- **WHEN** 生徒がmacOSの手順に上から順に従ったとき
- **THEN** `npm install -g @dotlabo/sakunyan-code@latest`、`sakunyan --version`、`sakunyan .` のコマンドと、うまくいったときに出る文字が示されていなければならない

### Requirement: 利用者のパソコンの設定を勝手に変えない

sakunyanのインストールと起動は、利用者のパソコンの設定（PowerShellの実行ポリシー、PATHなど）を変えてはならない。設定を変える方法をREADMEで案内する場合は、設定を変えない方法を先に示し、その設定が何をするものかを説明しなければならない。

#### Scenario: 実行ポリシーの案内

- **WHEN** READMEが「このシステムではスクリプトの実行が無効になっているため…」の直し方を示すとき
- **THEN** `.cmd` を付けて打つ方法とコマンドプロンプトを使う方法を、`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` より先に示さなければならない
- **AND** `Set-ExecutionPolicy` については、何をする設定かと、元にもどす方法を示さなければならない

### Requirement: APIキーのセットアップガイド

READMEは、初めて起動したときにAPIキーの入力画面が出ること、APIキーを貼り付けてEnterを押すこと、うまくいったときの画面を示さなければならない。

#### Scenario: APIキーが設定されていない

- **WHEN** 生徒がAPIキー未設定の状態でsakunyanを起動したとき
- **THEN** READMEには、出る画面と、APIキーを貼り付けて進める手順が示されていなければならない

### Requirement: よくあるつまずき

READMEは、よくあるつまずきについて、出るメッセージ、原因、その場でやることを示さなければならない。少なくとも、PowerShellの実行ポリシー、コマンドが見つからない（PATH）、Node.jsが古い、権限（`EACCES`）、インターネットにつながらない、APIキーが使えない、フォルダが見つからない、をふくまなければならない。

#### Scenario: セットアップで問題が起きる

- **WHEN** 生徒が記載されたつまずきに出会ったとき
- **THEN** READMEは、出るメッセージの文と、その場でやることを1つ以上示さなければならない

### Requirement: 更新・入れ直しのコマンドを実行環境に合わせる

sakunyanが画面に出す更新・入れ直しのコマンドは、Windowsでは `npm.cmd install -g @dotlabo/sakunyan-code@latest`、それ以外では `npm install -g @dotlabo/sakunyan-code@latest` でなければならない。

#### Scenario: Windowsで更新の案内を表示する

- **WHEN** Windowsで新しいバージョンの案内、または起動の失敗の案内を表示するとき
- **THEN** コマンドは `npm.cmd` で始まらなければならない

### Requirement: 起動できないときに次にやることを示す

sakunyanは、Node.jsが古い、または起動の途中で失敗したとき、原因と、次にやることを日本語で表示して、終了コード1で終了しなければならない。

#### Scenario: Node.jsが古い

- **WHEN** Node.js 22.19.0 より古いNode.jsでsakunyanを実行したとき
- **THEN** 今のバージョン、必要なバージョン、Node.jsの入手先、更新したあとにターミナルを開き直すこと、確かめるコマンドを表示しなければならない

#### Scenario: 起動の途中で失敗する

- **WHEN** sakunyanの読み込みまたは起動が失敗したとき
- **THEN** ターミナルを開き直す、入れ直す、エラーの内容を先生に見せる、の順に案内し、エラーの内容を表示しなければならない

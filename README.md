# sakunyan

初心者向けの、日本語のコーディングアドバイザーです。ターミナルで動きます。フォルダの中のファイルを読んで、エラーの原因や考え方を、やさしい言葉で説明します。

ファイルを書きかえたり、コマンドを勝手に動かしたりはしません。

- [用意するもの](#用意するもの)
- [Windows での入れ方](#windows-での入れ方)
- [macOS での入れ方](#macos-での入れ方)
- [Linux・Chromebook での入れ方](#linuxchromebook-での入れ方)
- [初めて起動したとき（APIキー）](#初めて起動したときapiキー)
- [ふだんの使い方](#ふだんの使い方)
- [更新のしかた](#更新のしかた)
- [よくあるつまずき](#よくあるつまずき)
- [もっとくわしく](#もっとくわしく)

## 用意するもの

- パソコン（Windows、macOS、Linux、または Linux 開発環境を有効にした Chromebook）
- インターネット
- Node.js 22.19.0 以上（下の手順で入れます）
- OpenRouter の APIキー（先生から受け取るか、初めて起動したときの画面に出る方法で用意します）

## Windows での入れ方

コマンドは **PowerShell** に打ちます。スタートメニューで「PowerShell」と入力して、「Windows PowerShell」を開いてください。

> Windows の PowerShell では、`npm` と `sakunyan` に **`.cmd` を付けて** 打ちます（`npm.cmd`、`sakunyan.cmd`）。
> 付けないと、パソコンの設定によっては赤い文字のエラーで止まります（[くわしくはこちら](#このシステムではスクリプトの実行が無効になっているためと出るwindows)）。

### 1. Node.js を入れる

1. [Node.js のダウンロードページ](https://nodejs.org/ja/download)を開きます。
2. 「LTS」と書いてあるバージョンの、Windows 用インストーラー（`.msi`）をダウンロードします。
3. ダウンロードしたファイルを開き、「Next」を押して最後まで進めます。設定は変えなくてかまいません。

### 2. PowerShell を開き直す

**開いている PowerShell を、ぜんぶ閉じてから、もう一度開きます。** Node.js を入れる前から開いていた画面では、まだ使えません。VS Code のターミナルを使っている場合は、VS Code を終了して、開き直してください。

開き直したら、次を打ちます。

```powershell
node --version
```

うまくいくと、バージョンが出ます。`v22.19.0` 以上なら OK です（下は例です）。

```text
v24.11.0
```

### 3. sakunyan を入れる

```powershell
npm.cmd install -g @dotlabo/sakunyan-code@latest
```

1 分くらいかかることがあります。うまくいくと、最後に次のような行が出ます（数字はちがってもかまいません）。

```text
added 138 packages in 9s
```

入ったか確かめます。

```powershell
sakunyan.cmd --version
```

```text
0.1.19
```

### 4. 起動する

作業したいフォルダへ移動してから、起動します。最後の `.`（ピリオド）は「今いるフォルダ」という意味です。

```powershell
cd 作業したいフォルダのパス
sakunyan.cmd .
```

フォルダの名前に空白があるときは、`"` で囲みます。

```powershell
cd "C:\Users\名前\Documents\my project"
sakunyan.cmd .
```

つづきは「[初めて起動したとき（APIキー）](#初めて起動したときapiキー)」へ。

> コマンドプロンプト（`cmd`）を使う場合は、`.cmd` を付けなくても動きます（`npm install -g …`、`sakunyan .`）。
>
> 入力欄で `!` を使ってコマンドを動かす機能を使うときは、[Git for Windows](https://gitforwindows.org/) も入れておいてください。

## macOS での入れ方

コマンドは **ターミナル** に打ちます。Launchpad か Spotlight で「ターミナル」と入力して開いてください。

### 1. Node.js を入れる

1. [Node.js のダウンロードページ](https://nodejs.org/ja/download)を開きます。
2. 「LTS」と書いてあるバージョンの、macOS 用インストーラー（`.pkg`）をダウンロードします。
3. ダウンロードしたファイルを開き、「続ける」を押して最後まで進めます。

### 2. ターミナルを開き直す

**開いているターミナルを終了してから、もう一度開きます。** 開き直したら、次を打ちます。

```sh
node --version
```

うまくいくと、バージョンが出ます。`v22.19.0` 以上なら OK です（下は例です）。

```text
v24.11.0
```

### 3. sakunyan を入れる

```sh
npm install -g @dotlabo/sakunyan-code@latest
```

うまくいくと、最後に次のような行が出ます（数字はちがってもかまいません）。

```text
added 138 packages in 9s
```

`EACCES` や `permission denied` と出て止まったときは、[こちら](#eaccespermission-denied-と出るmacoslinux)を見てください。

入ったか確かめます。

```sh
sakunyan --version
```

```text
0.1.19
```

### 4. 起動する

作業したいフォルダへ移動してから、起動します。最後の `.`（ピリオド）は「今いるフォルダ」という意味です。

```sh
cd 作業したいフォルダのパス
sakunyan .
```

フォルダの名前に空白があるときは、`"` で囲みます。

```sh
cd "$HOME/Documents/my project"
sakunyan .
```

## Linux・Chromebook での入れ方

Chromebook では、先に「Linux 開発環境」をオンにして、そのターミナルを使います。

1. Node.js 22.19.0 以上を入れます（[Node.js のダウンロードページ](https://nodejs.org/ja/download)に、Linux 用の入れ方があります）。
2. ターミナルを開き直して、`node --version` で `v22.19.0` 以上と出ることを確かめます。
3. ここから先は、[macOS の「3. sakunyan を入れる」](#3-sakunyan-を入れる-1)からと同じです。

## 初めて起動したとき（APIキー）

起動すると、画面が開くまでのあいだ「🐾 さくにゃんを起動中…」「🐾 設定と画面を準備中…」と出ます（画面が開くと消えます）。

初めてのときだけ、`fd not found. Downloading...` のような行が出ることがあります。必要な道具を自動で用意しているので、そのまま待ってください。

APIキーがまだ無いと、ロゴの下に、次の画面が出ます。

```text
 🔑 はじめに、APIキーを設定しよう！
APIキーは、ドットラボポータルで受け取れるよ：https://portal.dot-labo.jp/home/openrouter-key
（ほかの方法：先生からもらう ／ OpenRouterで作る https://openrouter.ai/settings/keys）
🔑 APIキーを貼り付け（Enterで確定・Escで終了）👉
```

OpenRouter で作るときは、自分専用の OpenRouter のアカウントが必要です。

APIキーを貼り付けて、Enter を押します。うまくいくと、次のようになります。

```text
sakunyan code (v0.1.22)へようこそ！
作業フォルダ： 📁 C:\Users\名前\Documents\my-project
ユーザーの環境： 🪟 Windows

💡 ヒント：「/mode」と入力すると、応答モード（答え方）を切り替えられるよ。

 接続確認OK 🔑 あと30日
🐱 質問を入力してね（Ctrl+Cを2回で終了） ｜ アドバイスモード
```

ホームのフォルダ（`C:\Users\名前` や `~`）で起動したときは、「🏠 ホームのフォルダで起動したよ。作業用のフォルダを作って、そこで起動すると安心だよ。」と出ます。作業用のフォルダを作って、そこで起動し直してください。

会話を始めると、画面の下に「💬 会話の量 0.4%/1.0M」のような行が出ます。1回の会話で AI が覚えておける量のうち、どれだけ使ったかです。いっぱいに近づくと、古い会話は自動でまとめられます。話題が変わったら、`/new` で新しい会話を始めてもかまいません。

これで準備は終わりです。APIキーはパソコンに保存されるので、次からは入力しなくてかまいません。

- APIキーは、ほかの人に見せないでください。GitHub などにも載せないでください。
- APIキーや個人情報が書いてあるファイルは、sakunyan に読ませたり、会話に貼り付けたりしないでください。

## ふだんの使い方

作業したいフォルダで起動して、分からないことをそのまま入力します。

| やりたいこと | 入力 |
| --- | --- |
| 起動する | `sakunyan .`（Windows の PowerShell では `sakunyan.cmd .`） |
| 終了する | Ctrl+C を 2 回 |
| 前の会話のつづきをする | `/resume` |
| 新しい会話を始める | `/new` |
| 答え方を変える（すぐ教える / ヒントを少しずつ） | `/mode` |
| 使い方を見る | `sakunyan --help` |

エラーが出たときは、エラーの文をそのまま貼り付けて質問すると、いっしょに読んでくれます。

### これまでの学習を覚える

sakunyan は前の会話を覚えていて、前回のつづきから話を進められます。覚え方は 2 段階です。

- **最近の学習**: 起動したあと、前の会話を 1 つずつ短く要約します（1 つの会話につき 150 文字まで）。要約はうしろで自動で作るので、待つ必要はありません。最初の質問までに要約が間に合わなかったときは、次の会話から使われます。
- **学習の全体像**: 最近の学習が 5 件をこえたら、古いものを「テーマごとの進み具合・つまずきやすい点・学び方の傾向」の短いまとめに組みこみます。こうすることで、昔の学習も忘れずに覚えています。

あいさつだけの会話や、sakunyan の使い方を聞いただけの会話は覚えません。

覚えた内容は `~/.sakunyan/memory/memory.json` に保存します。会話の記録そのものは `~/.sakunyan/sessions/` に残り、書きかえません。覚えた内容を忘れさせたいときは、sakunyan を終了してから `~/.sakunyan/memory/` フォルダを消します。

## 更新のしかた

新しいバージョンがあると、起動したときに「🆕 新バージョン v0.1.23 が出たよ。終了してから：npm install -g @dotlabo/sakunyan-code@latest」のように 1 行で知らせます。sakunyan を終了してから、入れたときと同じコマンドを打ちます。

```sh
npm install -g @dotlabo/sakunyan-code@latest
```

Windows の PowerShell では、`npm.cmd` にします。

```powershell
npm.cmd install -g @dotlabo/sakunyan-code@latest
```

更新しても、APIキーと会話の記録はそのまま使えます。

## よくあるつまずき

出たメッセージを探して、「やること」を上から順に試してください。

### 「このシステムではスクリプトの実行が無効になっているため…」と出る（Windows）

```text
npm : このシステムではスクリプトの実行が無効になっているため、ファイル C:\Program Files\nodejs\npm.ps1 を
読み込むことができません。詳細については、「about_Execution_Policies」(https://go.microsoft.com/fwlink/?LinkID=135170)
を参照してください。
```

`sakunyan` で始まるコマンドでも、同じ文が出ます（`sakunyan.ps1 を読み込むことができません`）。

**原因**: Windows の PowerShell は、はじめの設定では「スクリプト」という種類のファイルを動かしません。`npm` や `sakunyan` とだけ打つと、そのスクリプトのほうが選ばれて、止められます。故障ではありません。

**やること**（どれか 1 つで直ります）:

1. **`.cmd` を付けて打つ**（設定は変えません。おすすめ）

   ```powershell
   npm.cmd install -g @dotlabo/sakunyan-code@latest
   sakunyan.cmd .
   ```

2. **コマンドプロンプトを使う**（設定は変えません）。スタートメニューで「cmd」と入力して「コマンド プロンプト」を開きます。ここでは `npm`、`sakunyan` のままで動きます。

3. **PowerShell の設定を変える**。毎回 `.cmd` を付けたくないときの方法です。次のコマンドは、「自分のユーザーだけ、自分のパソコンで作ったスクリプトを動かせるようにする」設定です（インターネットから取ってきたスクリプトは、署名が無いと動かないままです）。学校や会社のパソコンでは、先に先生や管理者に聞いてください。

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

   元にもどすときは、次のコマンドです。

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser Undefined
   ```

### 「用語 'sakunyan' は、コマンドレット、関数…として認識されません」と出る（Windows）

`node`、`npm` で同じ文が出ることもあります。コマンドプロンプトでは、次の文になります。

```text
'sakunyan' は、内部コマンドまたは外部コマンド、
操作可能なプログラムまたはバッチ ファイルとして認識されていません。
```

**原因**: 入れたばかりのコマンドの場所を、今開いている画面がまだ知りません。

**やること**:

1. PowerShell（コマンドプロンプト）を **ぜんぶ閉じて、開き直す**。VS Code のターミナルなら、VS Code を終了して開き直す。
2. それでも `node` が見つからないときは、Node.js を入れ直す（[1. Node.js を入れる](#1-nodejs-を入れる)）。
3. `node` は動くのに `sakunyan` だけ見つからないときは、もう一度入れる。

   ```powershell
   npm.cmd install -g @dotlabo/sakunyan-code@latest
   ```

4. まだ直らないときは、次のコマンドで出た場所（`C:\Users\名前\AppData\Roaming\npm` など）を先生に見せてください。この場所が、Windows の「Path」という設定に入っている必要があります。

   ```powershell
   npm.cmd config get prefix
   ```

### `command not found: sakunyan` と出る（macOS・Linux）

```text
zsh: command not found: sakunyan
```

```text
bash: sakunyan: command not found
```

**やること**:

1. ターミナルを終了して、開き直す。
2. もう一度入れる（`npm install -g @dotlabo/sakunyan-code@latest`）。エラーが出ていないか、最後の行まで見てください。

### 「Node.jsのバージョンが古いため、sakunyanを起動できません。」と出る

```text
❌ Node.jsのバージョンが古いため、sakunyanを起動できません。

現在のバージョン： v20.20.2
必要なバージョン： v22.19.0 以上
```

sakunyan を入れるときに、`npm warn EBADENGINE Unsupported engine` と出るのも、同じ原因です。

**やること**:

1. [Node.js のダウンロードページ](https://nodejs.org/ja/download)から、「LTS」のバージョンを入れ直す。
2. ターミナル（PowerShell）を閉じて、開き直す。
3. `node --version` で `v22.19.0` 以上と出ることを確かめてから、もう一度 sakunyan を起動する。

### `EACCES`・`permission denied` と出る（macOS・Linux）

```text
npm error code EACCES
npm error syscall mkdir
npm error Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules/@dotlabo'
```

**原因**: sakunyan を入れる場所に、書きこむ権限がありません。

**やること**: 先頭に `sudo` を付けて、もう一度入れます。パソコンのパスワードを聞かれます。打っても画面には何も出ませんが、そのまま打って Enter を押してください。

```sh
sudo npm install -g @dotlabo/sakunyan-code@latest
```

`sudo` を使いたくない・使えないときは、npm の説明「[グローバルにパッケージを入れるときの EACCES エラーを直す](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)」（英語）の方法があります。

### 入れている途中で `ECONNREFUSED`・`ETIMEDOUT`・`ENOTFOUND` と出る

```text
npm error code ECONNREFUSED
```

**原因**: インターネットにつながっていないか、学校や会社のネットワークで通信が止められています。

**やること**:

1. Wi-Fi につながっているか確かめて、もう一度コマンドを打つ。
2. 学校や会社のネットワークで起きるときは、先生や管理者に、出たメッセージを見せる（特別な設定が必要なことがあります）。

### 起動したら「接続確認NG　インターネットにつながらないみたい。」と出る

```text
 接続確認NG　インターネットにつながらないみたい。
 ・Wi-Fi（インターネット）につながっているか確認してね。
 ・学校や会社のネットワークでは、通信が止められていることがあるよ。先生に聞いてね。
 ・つながったら、Escで終了して、もう一度 sakunyan を起動してね。
```

**原因**: AI のサーバーまで通信が届いていません。APIキーを入れ直しても直りません。

**やること**: 画面に出ているとおり、インターネットを確かめてから、Esc で終了して、起動し直します。

### 「今のAPIキーでは、つながらなかったよ。」と出る／キーを入れても APIキーの入力画面が消えない

**原因**: APIキーがまちがっているか、期限が切れているか、使える量を使い切っています。

**やること**:

1. APIキーを、前後に空白を入れずに、もう一度貼り付ける。
2. 新しい APIキーを用意して、貼り付ける。

### 「「○○」フォルダが見つからなかったよ。」と出る

**原因**: `sakunyan` の後ろに書いたフォルダが、今いる場所にありません。フォルダの名前に空白があるのに `"` で囲んでいないときも、こうなります。

**やること**: 作業したいフォルダへ `cd` で移動してから、`.` を付けて起動します。

```sh
cd "作業したいフォルダのパス"
sakunyan .
```

### 「❌ sakunyanを起動できませんでした。」と出る

**やること**: 画面に出ている順（ターミナルを開き直す → 入れ直す → 「エラーの内容」を先生に見せる）に試してください。

### OneDrive の中のフォルダで、うまく動かない（Windows）

「デスクトップ」や「ドキュメント」が OneDrive の中にあると、ファイルが見つからない、動きがおそい、ということがあります。そのときは、OneDrive の外に作業用のフォルダを作って、そこで起動してください。

```powershell
mkdir C:\work
cd C:\work
sakunyan.cmd .
```

### 文字がずれる・絵文字が四角になる（Windows）

古い画面（青や黒の、昔からあるウィンドウ）では、絵文字が出ないことがあります。動きには関係ありません。気になるときは、Microsoft Store から「Windows ターミナル」を入れて、その中の PowerShell を使ってください。

### ここに無いエラーのとき

出た文字をぜんぶコピーして、先生に見せてください。次の 3 つの結果もいっしょに伝えると、原因が早く分かります。

```sh
node --version
npm --version
sakunyan --version
```

（Windows の PowerShell では、`npm.cmd --version`、`sakunyan.cmd --version`）

## もっとくわしく

- [くわしい説明](docs/details.md): オプション、保存される場所、答え方のモード、起動時のヒント、教室共通のルール、安全についての注意、開発する人向けの情報
- [起動とインストールの待ち時間](docs/performance.md)
- [npm 自動公開（メンテナー向け）](docs/npm-publishing.md): 初回の trusted publisher 設定と、PR でのバージョン更新

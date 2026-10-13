# npm 自動公開（メンテナー向け）

## 何が自動になるか

`main` への push で `.github/workflows/publish.yml` が動きます。GitHub Actions の「Publish npm」→「Run workflow」でも再実行できます。手動実行も **Dot-labo/sakunyan-code の main のみ**が対象です。

1. Node.js 24 / npm 11.19.0 で `npm ci`、型チェック、全テスト（ビルドを含む）を実行します。
2. ビルドを tarball にし、隔離した HOME にインストールして `sakunyan --version` と `--help` を確認します。APIキーは不要です。
3. 別ジョブで npm の公開済みバージョンを照会し、**検証した同じ tarball** を OIDC で公開します。公開ジョブには依存パッケージのインストール・ビルド・ライフサイクルスクリプトの実行はありません。

npm token を GitHub Secrets に登録する必要はありません。OIDC の `id-token: write` は公開ジョブだけに付与しています。実行は直列化し、公開中の実行を新しい push でキャンセルしません。ただし GitHub の concurrency は永続キューではなく、待機中の実行が置き換わることがあります。全中間バージョンの公開を保証する仕組みではありません。

## 初回だけ、人が設定すること

GitHub-hosted runner が必要です。npm の trusted publishing は npm 11.5.1 以上 / Node.js 22.14.0 以上が条件です。この workflow はそれを満たすバージョンを指定しています。[1]

1. 人が workflow の PR をレビューして `main` へマージします（この手順書はマージ・公開の承認を代行しません）。
2. npmjs.com の `@dotlabo/sakunyan-code` → Settings → Trusted Publisher で **GitHub Actions** を追加します。[1]
   - Organization or user: `Dot-labo`
   - Repository: `sakunyan-code`
   - Workflow filename: `publish.yml`（`.github/workflows/` は付けません）
   - Environment name: **空欄**（現 workflow は environment を指定していません。追加する場合は両側を一致させます）
   - Allowed actions: **直接の `npm publish` を許可**します。`npm stage publish` だけを許可した設定では、この workflow の直接公開はできません。
3. 設定作成から **2日以内に最初の公開を成功**させます。期限切れなら設定を削除・再作成します。マージ直後の実行が設定前に失敗した場合は、設定後に Actions から `main` を選んで実行してください。[1]
4. 成功した run と npm の新しいバージョン・provenance を確認します。公開する package の `repository.url` は `git+https://github.com/Dot-labo/sakunyan-code.git` と一致させています。公開 repo / 公開 package の OIDC 公開では provenance が自動生成されます（workflow でも明示しています）。[1]

設定の登録・変更には npm package の管理権限が必要です。ローカル検証だけでは npm 側の権限設定や GitHub の OIDC 認証までは確認できません。

## 次のリリース

npm は同じバージョンを上書きできないため、ソース・依存関係を変更する PR にバージョン更新を含めます。CI は `main` 宛て PR の `src/`、`package.json`、`package-lock.json` の変更について、公開可能な未公開バージョンか確認します。ネットワーク障害も CI エラーになります。

```bash
npm version patch --no-git-tag-version
npm run typecheck
npm test
```

`package.json` と `package-lock.json` を両方 PR に含めてレビューします。minor / major を上げる場合は `patch` を置き換えます。workflow が `main` に直接バージョン更新をコミットすることはありません。

- 同じバージョンが公開済みなら、公開だけを正常にスキップします。ドキュメントだけの変更はこれで処理します（検証は省略しません）。
- 未公開判定は npm の JSON エラーコード **E404** だけです。認証エラー・ネットワーク障害・不正な応答では公開しません。
- 未公開バージョンは `latest` より大きい安定版（`major.minor.patch`）だけを許可します。prerelease、build metadata、`latest` の巻き戻しは扱いません。
- PR のバージョンチェックを必須にするには、リポジトリの branch protection / ruleset で既存の CI を required check にしてください。直接 push やチェックを迂回した変更は防げません。
- 手動での別経路の公開と競合すると、照会後の公開が失敗する場合があります。勝手に再採番せず、npm の状態と該当 run を確認してください。

## 他の方式を選ばなかった理由

release-please / semantic-release でバージョン決定まで自動化する案もありますが、コミット規約や release PR の追加運用が必要です。今回は明示的なバージョン更新を通常の PR でレビューする方式に留めます。npm token を保存する方式より、長期の公開用 secret を持たない OIDC を採用しています。[1]

## ローカルで安全に確認する

`npm test` に、公開済み・未公開・認証/通信エラー・prerelease・lockfile 不一致・バージョン巻き戻しの回帰テストが含まれます。テストは隔離した fake npm executable を使い、実 npm registry への公開はしません。`node scripts/publish-check.mjs` は実 registry を**照会するだけ**です。

## Sources

[1] npm: Trusted publishing — https://docs.npmjs.com/trusted-publishers

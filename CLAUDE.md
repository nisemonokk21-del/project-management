# プロジェクトメモ（案件管理アプリ）

## ⚠️ バージョン更新は毎回マスト（必須ルール）

**コードに変更を加えたら、コミットする前に必ずバージョンを更新すること。例外なし。**

更新箇所は2つ、両方を必ず揃える:

1. `src/App.jsx` のフッター `<footer className="version-footer">vX.Y — 変更内容の要約</footer>`
   - 数字を上げ、`—` の後ろの説明をその変更内容に書き換える。
2. `package.json` の `"version"`（`X.Y.0` 形式で `App.jsx` の `vX.Y` と一致させる）。

バージョンの上げ方: 小さな変更はマイナー（v3.1 → v3.2）、大きな節目はメジャー（v3.x → v4.0）。

## デプロイ

- GitHub Pages への自動デプロイは `.github/workflows/deploy.yml` が管理。
- デプロイが走るのは `main` などワークフローの `branches:` に列挙されたブランチへの push 時のみ。
- 作業用の feature ブランチに push しただけでは本番サイトに反映されない。反映にはデプロイ対象ブランチへのマージが必要。

## 確認コマンド

- Lint: `npm run lint`
- ビルド: `npm run build`

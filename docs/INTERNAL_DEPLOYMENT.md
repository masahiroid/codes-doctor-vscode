# VS Code Extension Internal Deployment Guide

最終更新: 2026-10-10

対象: 社内限定で Codes Doctor 拡張を配布・更新する担当者

## 1. 配布パッケージ作成

```bash
# 1. CSAP（Code Doctor）本体を兄弟ディレクトリでビルド
#    （既にクローン済みなら npm run build だけで良い）
git clone https://github.com/masahiroid/code-doctor.git ../csap-main
cd ../csap-main && npm ci && npm run build && cd -

# 2. この拡張の依存をインストール
npm ci

# 3. ../csap-main の dist/ を vendor/csap/ にコピーしつつ VSIX を作成
#    （CSAP_ROOT 環境変数で別の場所も指定可能）
npm run lint
npm test
npm run test:browser
npm run package
```

生成物:

- `codes-doctor-<version>.vsix`（このリポジトリのルート）

`npm run package` は内部で CSAP 本体の `dist/` を `vendor/csap/` にコピーする処理（`vendor:csap`）を実行してから VSIX を作成します。手順1（CSAP 本体のビルド）を忘れると古い解析エンジンが同梱されるので注意してください。

## 2. 利用者インストール手順

1. VS Code を開く
2. Extensions ビューを開く
3. 右上の `...` メニューを押す
4. `Install from VSIX...` を選ぶ
5. 受け取った `.vsix` を選択
6. VS Code を再読み込み

CLI でもインストール可能:

```bash
code --install-extension /path/to/codes-doctor-1.5.5.vsix
```

## 3. 社内限定運用ルール（推奨）

- 公開 Marketplace には publish しない
- VSIX は社内ストレージ（SharePoint / 社内Git / 社内Artifactory）でのみ配布
- バージョンは `x.y.z` で管理し、配布履歴を残す
- 重大な不具合時に備え、直前版 VSIX を必ず保管する

## 4. 更新フロー（運用標準）

1. 拡張または CSAP 本体の変更実装
2. CSAP 本体のビルド（`npm run build`、csap-main リポジトリルート）
3. バージョン更新（`package.json`、`package-lock.json` の2箇所を同期し、`CHANGELOG.md`を更新）
4. VSIX 作成（`npm run package`）
5. 代表プロジェクトで動作確認
6. 配布告知（更新点・既知の制約・ロールバック方法）
7. 必要時のみロールバック（旧 VSIX を再配布）

## 5. 初期トラブルシュート

- `Cannot find module '...'` でコマンドが失敗する:
  - CSAP 本体の `dist/` が最新か確認（csap-main で `npm run build` を再実行）
  - `vendor/csap/` を再生成（`npm run vendor:csap`、CSAP_ROOT を設定）してから VSIX を作り直す
  - 拡張の `node_modules` に `@typescript-eslint/typescript-estree` / `php-parser` / `typescript` が入っているか確認（`npm ci` し直す）
- レポート表示されない:
  - `codeDoctor.reportOpenMode` を `external` に変更して外部ブラウザで確認
- 解析失敗:
  - ワークスペースフォルダーが開かれているか確認
  - VS Code の「出力」パネル（拡張のログ）またはエラー通知の内容を確認

## 6. 実装・セキュリティー検証（1.5.3）

Node.js 22以上を使用し、`src/` のTypeScriptを編集します。`npm run build`で生成JSとレポート用バンドルを更新し、`npm run vendor:csap`で日英のエンジンへパッチを適用します。生成JSとvendorは直接修正しません。`npm run lint`は型チェックを実行します。

ブラウザテストには `npx playwright install chromium` または `CODE_DOCTOR_BROWSER_EXECUTABLE` の指定が必要です。MarkdownのXSS除去、CSP、日英の全タブとAST追加表示を検証します。依存監査は `npm audit` と `npm audit --omit=dev` を実行します。公開・インストールは明示的な配布作業として行ってください。

保存済みレポートの分析スコアは自動で再計算されません。「Analyze Current Workspace」で新しい分析を作成してください。元レポートと保存済みレビューは保持されます。最新版の計測結果・制約は `security-remediation.md` を参照してください。

## 7. 実行版の確認とローカル反映（1.5.4）

`code --list-extensions --show-versions` で `masahirocom.codes-doctor` のバージョンを確認します。ソースを変更しただけではインストール済み拡張は更新されません。

```bash
npm run package:release
code --install-extension releases/codes-doctor-1.5.5.vsix --force
code --list-extensions --show-versions
```

その後VS Codeで `Developer: Reload Window` を実行し、「Analyze Current Workspace」で再解析します。既存レポートのスコアは自動再計測されません。新レポートのHTMLには `codes-doctor-version` メタデータが入るので解析に使用した版を確認できます。`package:release`はローカルVSIXの作成とlatestコピーで、Marketplaceへの公開ではありません。旧VSIXは保持します。

1.5.5の検証基準はNodeテスト53件、Chromeテスト6件、型チェック。実装58ファイルの明示的any型は0で、Mediumクラス候補も0件。

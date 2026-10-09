# VS Code Extension Internal Deployment Guide

最終更新: 2026-10-09

対象: 社内限定で Codes Doctor 拡張を配布・更新する担当者

## 1. 配布パッケージ作成

```bash
# 1. CSAP（Code Doctor）本体を兄弟ディレクトリでビルド
#    （既にクローン済みなら npm run build だけで良い）
git clone https://github.com/masahiroid/code-doctor.git ../csap-main
cd ../csap-main && npm install && npm run build && cd -

# 2. この拡張の依存をインストール
npm install

# 3. ../csap-main の dist/ を vendor/csap/ にコピーしつつ VSIX を作成
#    （CSAP_ROOT 環境変数で別の場所も指定可能）
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
code --install-extension /path/to/codes-doctor-1.0.0.vsix
```

## 3. 社内限定運用ルール（推奨）

- 公開 Marketplace には publish しない
- VSIX は社内ストレージ（SharePoint / 社内Git / 社内Artifactory）でのみ配布
- バージョンは `x.y.z` で管理し、配布履歴を残す
- 重大な不具合時に備え、直前版 VSIX を必ず保管する

## 4. 更新フロー（運用標準）

1. 拡張または CSAP 本体の変更実装
2. CSAP 本体のビルド（`npm run build`、csap-main リポジトリルート）
3. バージョン更新（このリポジトリの `package.json`）
4. VSIX 作成（`npm run package`）
5. 代表プロジェクトで動作確認
6. 配布告知（更新点・既知の制約・ロールバック方法）
7. 必要時のみロールバック（旧 VSIX を再配布）

## 5. 初期トラブルシュート

- `Cannot find module '...'` でコマンドが失敗する:
  - CSAP 本体の `dist/` が最新か確認（csap-main で `npm run build` を再実行）
  - `vendor/csap/` を再生成（`npm run vendor:csap`、CSAP_ROOT を設定）してから VSIX を作り直す
  - 拡張の `node_modules` に `@typescript-eslint/typescript-estree` / `php-parser` / `typescript` / `uuid` が入っているか確認（`npm install` し直す）
- レポート表示されない:
  - `codeDoctor.reportOpenMode` を `external` に変更して外部ブラウザで確認
- 解析失敗:
  - ワークスペースフォルダーが開かれているか確認
  - VS Code の「出力」パネル（拡張のログ）またはエラー通知の内容を確認

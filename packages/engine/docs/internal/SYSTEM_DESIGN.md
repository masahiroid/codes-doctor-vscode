# CSAP System Design (Current)

最終更新: 2026-03-12

## 1. 目的
CSAP は ZIP で受け取ったコードベースを解析し、構造監査レポート（HTML）を生成する Node.js/TypeScript アプリケーションである。

## 2. システム構成
- Runtime: Node.js 20（Dockerfile ベース）
- Web Server: Express (`src/server.ts`)
- Upload API: Multer (`src/upload.ts`)
- Analyzer Core: `src/analyzer/`（言語検出、構造解析、メトリクス算出）
- Graph/Report: `src/graph/`, `src/report/`
- Storage (local volumes):
- `uploads/`: アップロードZIP保管
- `temp/`: 展開と解析中の一時ファイル
- `output/`: 生成HTMLとJSONメタデータ

## 3. リクエストフロー
1. クライアントが `/` へアクセスし UI を利用
2. ZIP を `/api/upload` に送信
3. サーバーが ZIP 展開と解析を実行
4. HTML レポートを `output/` に保存
5. `/reports/:analysisId` でレポート取得

## 4. 主要設計方針
- 単一プロセス構成で運用容易性を優先
- 出力は自己完結型 HTML を基本とし、成果物配布を簡便化
- 機能フラグ（環境変数）で LLM/PHP 等の機能を切替
- 永続化ディレクトリを分離し、再起動・再デプロイ時のデータ保護を担保

## 5. デプロイ設計（Current Recommendation）
### 5.1 Coolify 利用時
- 本リポジトリの `Dockerfile` をそのまま利用可能
- 公開ポートは `3000`（コンテナ内）
- Coolify 側で公開ドメイン/TLS/環境変数を管理

### 5.2 既存 Nginx・他 Node プロジェクトとの共存
- Coolify は内部で Docker とリバースプロキシを使用するため、80/443 の競合に注意
- 既存 Nginx が同一サーバーで 80/443 を占有している場合は以下のいずれかを選ぶ:
- A. Coolify 専用サーバーに分離（推奨）
- B. 既存 Nginx を上位プロキシとして残し、Coolify 側公開ポートを分離して中継
- C. 既存アプリを段階移行し、最終的に Coolify 側へ統合

## 6. 関連ドキュメント
- `docs/SYSTEM_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/DOCKER_SETUP.md`
- `docs/AST_LLM_MODE_GUIDE.md`

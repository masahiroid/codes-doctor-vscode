# API リファレンス

- English: [API_REFERENCE.md](API_REFERENCE.md)
- 日本語: この文書

最終更新: 2026-10-09

全てのレスポンスは JSON です（`GET /`、`GET /reports/:analysisId`、`GET /reports/:analysisId/pdf` を除く。これらは HTML/PDF を返します）。特記がない限り、エラーレスポンスは `{ "success": false, "error": "<メッセージ>" }` の形式です。

## `GET /`

Web UI（ZIP アップロードフォーム + ローカルパス分析フォーム）を返します。

## `POST /api/upload`

ZIP ファイルをアップロードし、その内容を分析します。

**クエリパラメータ**

| 名前 | 値 | デフォルト |
|------|-----|-----------|
| `language` | `auto` \| `typescript` \| `javascript` \| `php` \| `dart` \| `python` | `auto` |

**リクエスト**: `multipart/form-data`、`.zip` ファイルを含む `file` フィールド（拡張子が `.zip` かつ MIME タイプが `application/zip` である必要あり）。最大サイズは `CSAP_MAX_FILE_SIZE`（デフォルト 500MB）。

**レスポンス** `200`
```json
{
  "success": true,
  "analysisId": "a1b2c3d4-...",
  "extractedPath": "/path/to/temp/a1b2c3d4-...",
  "language": "auto"
}
```

**エラー**
- `400` — ファイルが未アップロード、または ZIP フィルターを通過しない
- `413` — `CSAP_MAX_FILE_SIZE` を超過
- `500` — ZIP 展開に失敗

## `POST /api/analyze-path`

サーバープロセスから読み取り可能なローカルディレクトリを直接分析します（アップロード不要）。

**リクエストボディ**
```json
{
  "repoPath": "/absolute/path/to/repo",
  "language": "auto"
}
```

`language` は上記と同じ値を受け付け、省略時は `auto` になります。

**レスポンス** `200`
```json
{
  "success": true,
  "analysisId": "a1b2c3d4-...",
  "repoPath": "/absolute/path/to/repo",
  "reportUrl": "/reports/a1b2c3d4-...",
  "reportPath": "/path/to/output/a1b2c3d4-....html"
}
```

`reportPath` は生成された HTML ファイルの絶対パスです。VS Code 拡張のように `reportUrl` を経由せずファイルを直接読む呼び出し元に有用です。

**エラー**
- `400` — `repoPath` が未指定、存在しない、またはディレクトリでない
- `500` — 分析に失敗

## `GET /api/health`

ヘルスチェックです。

**レスポンス** `200`
```json
{ "status": "ok", "timestamp": "2026-10-09T12:00:00.000Z" }
```

## `GET /reports/:analysisId`

生成済みの HTML レポートを取得します。`analysisId` は有効な UUID（アップロード/分析エンドポイントが生成する形式）である必要があります。不正な ID の場合、JSON エラーではなく 400 の「見つかりません」ページが返されます。

**クエリパラメータ**

| 名前 | 値 | デフォルト |
|------|-----|-----------|
| `language` | 上記と同じ | `auto` |

レポートがまだ生成されていなくても、展開済みのソースが temp ディレクトリに残っている場合は、このエンドポイントがオンデマンドで分析を実行します（別の `language` で再分析したい場合に有用）。生成された HTML がそのまま返されます。

**レスポンス**: `text/html`。レポートもソースも存在しない場合は `404` で HTML の「見つかりません」ページ。

## `GET /reports/:analysisId/pdf`

ヘッドレスブラウザ（Puppeteer）経由で HTML レポートを PDF に変換してダウンロードします。

**レスポンス**: `application/pdf`、ファイル名 `code-doctor-report-<analysisId>.pdf`。

**エラー**
- `400` — `analysisId` が不正
- `404` — レポートが見つからない（先に `GET /reports/:analysisId` で HTML レポートを生成してください）
- `500` — PDF レンダリングに失敗

## `POST /api/llm/analyze`

LLM によるコード構造レビューを実行します。`CSAP_LLM_ENABLED=true` と `OPENAI_API_KEY` の設定が必要です。

**リクエストボディ**
```json
{
  "analysisId": "a1b2c3d4-...",
  "focus": "graph-metrics",
  "useCache": true,
  "astOnlyMode": false,
  "model": "gpt-5.4",
  "maxOutputTokens": 3000,
  "temperature": 0.2
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `analysisId` | 必須 | 事前の分析で生成された有効な UUID |
| `focus` | 任意 | 自由形式のフォーカス領域。`astOnlyMode` が true の場合は無視され `ast-structure-only` に固定される。デフォルトは `graph-metrics` |
| `useCache` | 任意 | true かつこの `analysisId`+`focus` のキャッシュが存在する場合、LLM を呼ばずにそれを返す |
| `astOnlyMode` | 任意 | メトリクス駆動のコンテキスト/プロンプトではなく、AST 構造のみのコンテキスト/プロンプトに切り替える |
| `model` | 任意 | このリクエストに限り `CSAP_LLM_MODEL` / `CSAP_LLM_AST_MODEL` を上書き |
| `maxOutputTokens` | 任意 | 設定済みの最大トークン数を上書き（最小 200 にクランプ） |
| `temperature` | 任意 | 設定済みの temperature を上書き（0〜2 にクランプ） |

**レスポンス** `200`
```json
{ "success": true, "cached": false, "result": "...LLM分析結果テキスト..." }
```

**エラー**
- `400` — `analysisId` が未指定/不正、LLM が無効、または `OPENAI_API_KEY` 未設定
- `404` — この `analysisId` に対する保存済み分析コンテキストがない（先に分析を再実行してください）
- `500` — LLM リクエスト自体が失敗

## `GET /api/llm/result/:analysisId/:focus`

LLM を再度呼ばずに、以前保存された結果を取得します。

**レスポンス** `200`
```json
{ "success": true, "result": "...", "createdAt": "2026-10-09T12:00:00.000Z", "mode": "full" }
```

**エラー**
- `400` — `analysisId` または `focus` が不正
- `404` — この組み合わせの保存済み結果がない

## `analysisId` に関する注意

`analysisId` を受け取る全てのエンドポイントは、ファイルシステムにアクセスする前に UUID パターンで検証を行います。これは、不正に構築された ID によるパストラバーサルを防ぐための仕組みです。このAPIと連携する場合、パスを手動で構築してこの検証を迂回しないでください。

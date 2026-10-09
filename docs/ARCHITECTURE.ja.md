# アーキテクチャ

- English: [ARCHITECTURE.md](ARCHITECTURE.md)
- 日本語: この文書

最終更新: 2026-10-09

## 概要

Code Doctor（パッケージ名 `csap`）は、コードベースを分析し自己完結型の HTML 監査レポートを生成する Node.js/TypeScript アプリケーションです。Express サーバー（ZIP アップロードまたはローカルパス分析）として動作するほか、埋め込んで使うこともできます — VS Code 拡張 [codes-doctor-vscode](https://github.com/masahiroid/codes-doctor-vscode)（別リポジトリ）は、本リポジトリのコンパイル済み `dist/` 出力を同梱し、サーバーを起動せずに解析パイプラインをプロセス内で直接呼び出します。

## システム構成

```
src/
├── server.ts              Express エントリーポイント
├── app/                    アプリ初期化（ミドルウェア・ルーティング・起動処理）
├── upload.ts               ZIP アップロードエンドポイント（multer）
├── zipExtractor.ts          ZIP 展開（unzipper）
├── fileWalker.ts            ファイル一覧取得・読み込み（ZIP 依存なし）
├── config.ts                ランタイム設定（環境変数・機能フラグ）
├── types.ts                  共通型定義
├── analyzer/
│   ├── languageDetector.ts  使用言語の検出
│   ├── runner.ts             1回の分析実行を統括
│   ├── pipeline/             言語別・全体解析の各ステージ
│   ├── typescript/           TS/JS AST 解析、God Score、コールグラフ
│   ├── php/                  PHP AST 解析、God Score、コールグラフ
│   ├── dart/                 軽量な正規表現ベース Dart パーサー
│   ├── python/                軽量なインデント追跡ベース Python パーサー
│   ├── vulnerability/        Trivy / npm audit による依存関係スキャン
│   ├── sbom/                  CycloneDX / SPDX 出力
│   ├── moduleMetrics.ts      Fan-in/Fan-out、Instability、構造スコア
│   ├── layerAnalysis.ts      アーキテクチャレイヤー検出とヒートマップ
│   ├── technicalDebt.ts      技術的負債スコアリング
│   └── securityScore.ts      セキュリティパターンスキャン
├── graph/                    Mermaid / D3 図生成
├── report/                   HTML レポート組み立て（関心ごとに1モジュール）
├── llm/                       OpenAI 連携と LLM コンテキストビルダー
└── services/                  リクエスト単位の統括処理（パス分析、LLM リクエスト）
```

## リクエストフロー（サーバーモード）

1. クライアントが `POST /api/upload` に ZIP をアップロード、または `POST /api/analyze-path` にローカルディレクトリのパスを渡す
2. `zipExtractor.ts` が（ZIP の場合）一時ディレクトリに展開
3. `analyzer/languageDetector.ts` がディレクトリをスキャンし、言語別のファイル数を数える
4. `analyzer/pipeline/languageAnalysis.ts` が検出された各言語（TS/JS、PHP、Dart、Python）のパーサーを実行し、それぞれ God Class をスコアリング
5. `analyzer/pipeline/globalAnalysis.ts` が全ファイルを横断して言語非依存の解析を実行：依存グラフ、モジュールメトリクス、循環依存検出、技術的負債、セキュリティスコア、レイヤーヒートマップ
6. `analyzer/pipeline/supplyChainAnalysis.ts` が SBOM 生成と脆弱性スキャンを実行
7. `report/htmlBuilder.ts` が `report/sections/` 配下の各セクションビルダーから HTML レポートを組み立てる
8. レポートは `output/<analysisId>.html` に書き出され、後で任意に使える LLM コンテキスト JSON も同時に生成される

## サーバーなしでの埋め込み（VS Code 拡張）

`services/pathAnalysis.ts` は `analyzePathRequest(repoPath, language, outputDir)` を、呼び出しチェーンに Express 依存を一切持たないプレーンな async 関数として公開しています。VS Code 拡張はこの関数のコンパイル済みバージョンを直接 import し（パッケージング時にこのリポジトリの `dist/` からコピーした `vendor/csap/services/pathAnalysis.js` 経由）、拡張自身の出力先ディレクトリを渡して呼び出します。PDF 生成（大きな依存である `puppeteer` に依存）は意図的に別モジュール（`report/pdfOutput.ts`）に分離されており、PDF が不要な埋め込み側は Chromium を同梱せずに済みます。

## 言語別実装

| 言語 | パーサー | ライブラリ | コールグラフ |
|------|---------|-----------|-------------|
| TypeScript/JavaScript | フル AST | `@typescript-eslint/typescript-estree` | ✅ |
| PHP | フル AST | `php-parser` v3 | ✅ |
| Python | 軽量（インデント追跡） | なし（正規表現 + インデント深度） | — |
| Dart | 軽量（中括弧追跡） | なし（正規表現 + 中括弧深度） | — |

軽量パーサー（Python、Dart）は、言語の完全な SDK を持ち込まずに済むよう設計されています。God Class スコアリング、セキュリティパターンスキャン、import 抽出には十分な精度でクラス・関数の境界を追跡しますが、完全な AST やコールグラフは構築しません。

### God Class スコアリング

`analyzer/typescript/godScore.ts`（`calculateGodScore`）に一箇所だけ実装され、全言語のパイプラインステージから再利用されるため、スコアリング式は言語間で完全に同一です。

```
godScore = methodScore + lineScore + importScore + propertyScore   (0–100)
  methodScore:   min(methodCount / 20 * 40, 40)
  lineScore:     min(lineCount / 500 * 30, 30)
  importScore:   min(importCount / 15 * 20, 20)
  propertyScore: min(propertyCount / 20 * 10, 10)

+ cyclomaticComplexity > 15 の場合は複雑度ペナルティを加算
  （TS/JS と PHP のみ — このコードベースで循環的複雑度を計算しているのはこの2言語のみ）

ランク: critical (75以上) / high (50以上) / medium (25以上) / low (25未満)
```

### セキュリティスコアリング

各言語は `analyzer/securityScore.ts` 内に独自のパターンリストを持ちます（正規表現ベース、言語ごとのコメント構文でコメント行を除外）。パターンはコードインジェクション（`eval`/`exec`）、コマンドインジェクション、ハードコードされた認証情報、弱い暗号、各言語特有のリスク（例: Python の `pickle.load`、安全なローダーなしの `yaml.load`、PHP の `$_GET`/`$_POST` 直接使用）を対象とします。Dart にはまだセキュリティパターンが定義されていません。

## 言語非依存の解析

以下のステージは、言語を問わず検出された全ファイルの和集合に対して実行されます。

- **依存グラフ**（`graph/mermaid.ts`, `graph/d3/`） — 各ファイルの import/use 文から構築
- **モジュールメトリクス**（`analyzer/moduleMetrics.ts`） — Fan-in、Fan-out、Instability（`fanOut / (fanIn + fanOut)`）、Betweenness Centrality、複合構造スコア
- **循環依存検出**（`analyzer/moduleMetrics.ts`） — 同じ依存グラフに対する DFS
- **レイヤー分析**（`analyzer/layerAnalysis.ts`） — ディレクトリ名パターン（`components/`, `services/`, `controllers/` など）からアーキテクチャレイヤーを推定し、レイヤー×レイヤーの依存ヒートマップを構築
- **技術的負債スコア**（`analyzer/technicalDebt.ts`） — コード複雑度（God Class）、保守性（モジュールメトリクス）、循環依存の重み付き合成
- **SBOM / 脆弱性スキャン**（`analyzer/sbom/`, `analyzer/vulnerability/`） — 現時点では npm 専用（`package.json`/`package-lock.json` を読む）。ソースコードの言語とは独立して実行される

## LLM 統合（任意）

`CSAP_LLM_ENABLED=true` の場合、分析ごとに2種類のコンテキスト文書が生成され `output/` に書き出されます。

- `<analysisId>.llm-context.json` — メトリクス駆動のコンテキスト（モジュールのホットスポット、コールグラフ統計、依存関係統計、循環依存のサンプル、God Class ランキング）
- `<analysisId>.llm-ast-only.json` — 構造駆動のコンテキスト（サンプリングされたファイルの AST レベル構造。fan-in/fan-out に依存しない複雑度ヒューリスティックでランク付け）

`POST /api/llm/analyze` はこれらのいずれかのコンテキストを設定済みの OpenAI モデル（`llm/openai.ts`）に送信し、結果をレポートと一緒にキャッシュします。`GET /api/llm/result/:analysisId/:focus` は LLM を再度呼び出さずにキャッシュ済み結果を取得します。

## レポート生成

`report/htmlBuilder.ts` は関心ごとに1つの `<section>` を組み立て、それぞれ `report/sections/` 配下の個別モジュールに実装されています。

- `overviewSections.ts` — サマリーカード、God Class ランキング、モジュールメトリクス、レイヤー分析、ファイル統計
- `riskSections.ts` — 技術的負債・セキュリティスコアのセクション
- `graphSections.ts` — 依存グラフ（D3）・循環依存セクション、Mermaid ラッパー
- `supplyChainSections.ts` — SBOM・脆弱性スキャンセクション
- `astSection.ts` — サンプリングされた AST 構造ビューアー、任意の LLM レビュー操作部

レポートは単一の自己完結型 HTML ファイルです。チャート（Chart.js）、図（Mermaid.js、D3.js）、Markdown レンダリング（marked）は CDN から読み込まれるため、これらのウィジェットを表示するにはネットワークアクセスが必要ですが、レポート生成自体にサーバー側の依存は不要です。

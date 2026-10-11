# アーキテクチャ

- English: [ARCHITECTURE.md](ARCHITECTURE.md)
- 日本語: この文書

最終更新: 2026-10-11

## 概要

Codes Doctor エンジン（`packages/engine`）は、コードベースを解析して自己完結型の HTML 監査レポートを生成する Node.js/TypeScript のライブラリです。同じリポジトリの VS Code 拡張機能（`packages/vscode`）と CLI（`packages/cli`）は、エンジンのビルド結果を `vendor/` にコピーし（`scripts/vendor-engine.mjs`）、プロセス内で呼び出します。エンジンはビルドされたまま使われ、利用側で書き換えることはありません。

## システム構成

```
src/
├── index.ts                 公開 API
├── fileWalker.ts            拡張子ごとにまとめる 1 回走査のファイル一覧
├── config.ts                実行時設定（環境変数、機能フラグ）
├── types.ts                 共有の型定義
├── analyzer/
│   ├── languages/
│   │   ├── catalog.ts       言語カタログ — 全言語の唯一の定義元
│   │   └── analyzers/       カタログの言語ごとのアナライザー（TS、PHP、汎用の簡易解析）
│   ├── parsing/sourceText.ts  共通テキスト処理: コメント除去、括弧の対応付け、行計算
│   ├── languageDetector.ts  1 回のディレクトリ走査で言語ごとのファイル数を数える
│   ├── runner.ts            1 回の解析全体を統括
│   ├── pipeline/            言語ステージ → 全体ステージ（グラフ、品質、サプライチェーン）
│   ├── typescript/          TS/JS の AST 解析、God Score、呼び出しグラフ
│   ├── php/                 PHP の AST 解析、呼び出しグラフ
│   ├── syntax/              Tree-sitter による解析: ランタイム、汎用の構造抽出、言語別の定義
│   ├── bracelang/           文法のない波括弧系言語向けの簡易解析エンジン
│   ├── swift/ kotlin/ dart/ 簡易パーサー（Swift と Kotlin は bracelang を使用）
│   ├── security/            パターン定義、構文による判定、テストコードの判定
│   ├── securityScore.ts     セキュリティスキャンとスコア算出
│   ├── moduleMetrics.ts     ファンイン/ファンアウト、不安定度、構造スコア、循環
│   ├── layerAnalysis.ts     アーキテクチャレイヤーの検出とヒートマップ
│   ├── technicalDebt.ts     技術的負債スコア
│   ├── vulnerability/       Trivy / npm audit による依存関係スキャン
│   └── sbom/                CycloneDX / SPDX 出力
├── graph/                   Mermaid と D3 の図の生成
├── report/
│   ├── htmlBuilder.ts       ページのレイアウトのみ
│   ├── sections/index.ts    タブ定義: 各タブに表示するセクション
│   ├── sections/            レポートのセクションごとのモジュール
│   ├── sections/ast/        AST セクション: アウトライン描画、パーサー別の構造抽出、表示件数
│   ├── browser/             レポートのページ内で動くスクリプトとライブラリー
│   ├── reviewElements.ts    LLM モードごとの表示要素 ID
│   └── liveUpdate.ts        保存済みレポートへ新しい LLM 結果を書き込む
├── llm/
│   ├── focus.ts             フォーカス ID と LLM モード（レビュー、AST のみ、エージェント用プロンプト）
│   ├── artifacts.ts         LLM コンテキストと結果ファイルの読み書き
│   ├── context/             LLM コンテキストの組み立て
│   └── openai/ providers/   プロンプトとプロバイダー（OpenAI、Anthropic）
└── services/                入口: リポジトリ解析、LLM リクエスト

scripts/
├── build-report-libraries.mjs  Chart.js、Mermaid、marked+DOMPurify、D3 を assets/ にバンドル
└── localize-en.mjs             dist/ から英語版（dist-en/）を生成
```

## 言語カタログ

`analyzer/languages/catalog.ts` が対応言語をすべて 1 か所で定義します。

- `SOURCE_LANGUAGES` — 検出時の拡張子グループ（ここでは TypeScript と JavaScript は別）と表示名。
- `LANGUAGES` — パイプライン順の解析言語。表示名、解析するソース言語、完全な AST か簡易解析か、セキュリティパターン（あれば）、依存関係をレイヤー分析にどう使うかを宣言します。
- `ANALYSIS_LANGUAGES` / `toAnalysisLanguage()` — 「解析言語」オプションの有効な値と、信頼できない入力（クエリ文字列、設定）の検証。未知の値はエラーにします。

検出、言語ごとの解析ループ、セキュリティスキャン対象、レイヤー分析の入力、ファイル統計表、AST セクション、AST のみの LLM コンテキスト、Web UI の言語選択、「対応ファイルなし」バナーは、すべてカタログから導出します。言語ごとに処理が必要な表（`LANGUAGE_ANALYZERS`、AST 構造の抽出、LLM のサンプラー）は `Record<LanguageId, …>` 型なので、カタログに言語を追加すると、すべての表が対応するまでコンパイルが通りません。

### 言語の追加手順

1. `SOURCE_LANGUAGES` に拡張子グループを、`LANGUAGES` に言語を追加します。
2. `SimpleFileInfo[]` を返すパーサーを書きます。波括弧系の言語なら、`analyzer/bracelang/engine.ts` 用の `BraceLanguageConfig` を追加するだけです。
3. `analyzer/languages/analyzers/index.ts` に `createSimpleAnalyzer` で登録します。
4. セキュリティパターンがあれば `analyzer/security/patterns.ts` に追加します。
5. コンパイルエラーに従い、AST セクションと LLM サンプラーの表にも追加します。

## 解析の流れ

1. `analyzeRepository(path, language, outputDir)`（`services/pathAnalysis.ts`）がフォルダーと `language` オプション（`toAnalysisLanguage()`）を検証します。
2. `analyzer/languageDetector.ts` がフォルダーを 1 回走査し、ソース言語ごとにファイルをまとめます。
3. `analyzer/pipeline/languageAnalysis.ts` が `LANGUAGES` を順に回して各言語のアナライザーを実行し、解析済みファイル（`AnalysisResult.files`、言語 ID ごと）、God Class 候補、呼び出しグラフを集めます。
4. `analyzer/pipeline/globalAnalysis.ts` が全ファイルを対象に言語に依存しない解析を行います: 依存グラフ、モジュールメトリクス、循環依存、技術的負債、セキュリティスコア、レイヤーヒートマップ。
5. `analyzer/pipeline/supplyChainAnalysis.ts` が SBOM を生成し、脆弱性スキャンを実行します。
6. `report/htmlBuilder.ts` がページを組み立て、`report/sections/index.ts` が各タブに表示するセクションを決めます。
7. レポートは `<outputDir>/<analysisId>.html` に書き出され、LLM 用のコンテキストファイルが隣に保存されます。結果は呼び出し元に返されます。

## ビルド成果物と英語化

`npm run build` で `dist/`（レポートの文言は日本語）、`dist-en/`、`assets/report-libraries/` ができます。レポートの文言はソース上は日本語で書き、`scripts/localize-en.mjs` がすべての文字列リテラルの日本語部分を `locales/report-en.json` で翻訳します。翻訳のない断片があるとビルドは失敗します。リポジトリ名、パス、ソースのサンプル、LLM の出力はリテラルではなくデータなので翻訳されません。`report/browser/` のスクリプトは両言語の文言を持ち、実行時に `<html lang>` で選ぶため、翻訳せずにコピーします。`report/browser/libraries.ts` は自身の場所から上にたどって `assets/` を探すので、エンジン単体でも拡張機能や CLI の `vendor/` 内でも動きます。

## 言語ごとの実装

| 言語 | 解析方式 | ライブラリ | 呼び出しグラフ |
|------|---------|-----------|---------------|
| TypeScript/JavaScript | 完全な AST | `@typescript-eslint/typescript-estree` | ✅ |
| PHP | 完全な AST | `php-parser` v3 | ✅ |
| Python、Go、Java、C#、Rust、C++ | 構文木 | Tree-sitter（`@vscode/tree-sitter-wasm`） | — |
| Swift、Kotlin | 簡易解析（括弧追跡、bracelang エンジン） | なし | — |
| Dart | 簡易解析（括弧追跡） | なし | — |

### Tree-sitter の言語

`analyzer/syntax/treeSitter.ts` は、VS Code 自身も使う `@vscode/tree-sitter-wasm` から WebAssembly のランタイムと文法を読み込むため、ネイティブのビルドは不要です。言語ごとに `LanguageSyntaxSpec`（`syntax/languages/`）があり、文法のノード種別を定義します: 型宣言とその本体、関数、フィールド、インポート、コンストラクター、そしてセキュリティ検査用にコメント、文字列などのリテラル、呼び出し、インポートのノード。`syntax/structure.ts` が 1 つの汎用的な走査で、どの言語の構文木も共通の `SimpleFileInfo` に変換します。

- 関数の中で宣言された型（ローカルクラス、テスト用の型）も型として扱います。
- 型の外で宣言されたメソッドはその型に数えます。Go のレシーバーと Rust の `impl` ブロックは常に（型は別ファイルにあることもあります）。C++ の `Scope::name` は、`Scope` が同じファイルで宣言された型のときだけです（名前空間の場合があるため）。Rust の包括実装（`impl<T> Trait for T`）は型として扱いません。
- C++ はクラス本体で宣言されたメソッド（コンストラクターを含む）も数えます。

C++ として扱うのは `.cpp`/`.cc`/`.cxx`/`.hpp`/`.hh` だけで、`.h`/`.c` は C と区別できないため対象外です。

### 簡易解析の言語

Swift、Kotlin、Dart は `@vscode/tree-sitter-wasm` に文法がありません。Swift と Kotlin は bracelang エンジン（`analyzer/bracelang/engine.ts`）を使い、コメント除去・括弧の対応付け・インポート抽出を共通化し、型・メソッド・インポートのパターンだけを言語ごとに持ちます。Dart は独自の簡易スキャナーです。スコア計算に足りる程度に型と関数の範囲を追跡しますが、特殊な書き方は取りこぼし、セキュリティ検査の判定材料にはなりません。

### God Class スコア

`analyzer/typescript/godScore.ts`（`calculateGodScore`）に 1 回だけ実装し、`scoreGodClasses()` を通じて全言語のクラスに適用するため、計算式は全言語で同じです。

```
godScore = methodScore + lineScore + importScore + propertyScore   (0–100)
  methodScore:   min(methodCount / 20 * 40, 40)
  lineScore:     min(lineCount / 500 * 30, 30)
  importScore:   min(importCount / 15 * 20, 20)
  propertyScore: min(propertyCount / 20 * 10, 10)

+ cyclomaticComplexity > 15 の場合の複雑度ペナルティ（TS/JS と PHP のみ。
  循環的複雑度を計算しているのはこの 2 言語だけです）

rank: critical (>=75) / high (>=50) / medium (>=25) / low (<25)
```

### セキュリティスコア

パターンは `analyzer/security/patterns.ts` にあり、`Record<SecurityLanguage, SecurityPattern[]>` 型です。`calculateSecurityScore(targets, repoPath)` は、カタログの `security` キーから作った対象（`{ language, files }`）を順にスキャンし、一致を報告する前にファイルの構文を確認します。

- **コードではなく文字列。** TS/JS は TypeScript コンパイラーの範囲を使います（文字列・コメント・正規表現リテラルの中で始まる一致は除外）。Tree-sitter の言語は `security/syntaxEvidence.ts` を使い、一致全体がコメントか文字列の中にあれば除外します。インポート文の文字列はコードとして扱うので、インポートしたモジュールに対するパターンは引き続き検出します。
- **定数だけの呼び出し。** コマンド実行のパターンでは、引数がすべてリテラル（文字列、数値、それらのリスト、値がリテラルのキーワード引数。埋め込み式を含む文字列は除く）の呼び出しは報告しません。
- **テストコード。** `security/testCode.ts` が、リポジトリからの相対パスのディレクトリ名（`test/`、`tests/`、`__tests__/`、`testdata/` など）とファイル名（`*_test.go`、`test_*.py`、`*Test.java`、`*.spec.ts` など）でテストコードを判定します。該当する指摘は `inTest: true` となり、一覧にはラベル付きで表示しますが、スコア・説明・カテゴリ別の内訳・主なリスクは本番コードだけを対象にします。

パターンはコード・コマンドインジェクション、ハードコードされた認証情報、弱い暗号と乱数、文字列で組み立てた SQL、言語固有のリスクを対象にしています。入力から危険な処理までのデータの流れは追跡していません。この汚染解析は構文木の上に今後実装する予定です。Dart のパターンはまだありません。

## 言語に依存しない解析

次の処理は、言語に関係なく解析済みの全ファイルを対象にします。

- **依存グラフ**（`graph/mermaid.ts`、`graph/d3/`）— 各ファイルの import/use 文から作ります。
- **モジュールメトリクス**（`analyzer/moduleMetrics.ts`）— ファンイン、ファンアウト、不安定度（`fanOut / (fanIn + fanOut)`）、媒介中心性、構造スコア。
- **循環依存の検出**（`analyzer/moduleMetrics.ts`）— 同じグラフ上の深さ優先探索。
- **レイヤー分析**（`analyzer/layerAnalysis.ts`）— `generateLayerHeatmap(sources, godClasses, repoPath)` がパスをリポジトリ相対にし、ディレクトリ名（`components/`、`services/`、`controllers/` など）からレイヤーを推定して、レイヤー × レイヤーの依存マトリクスを作ります。TS/JS の依存は解決済みのパス、その他の言語の依存はモジュール名をキーワードで照合します。
- **技術的負債スコア**（`analyzer/technicalDebt.ts`）— 複雑度（God Class）、保守性（モジュールメトリクス）、循環依存の加重平均。
- **SBOM / 脆弱性スキャン**（`analyzer/sbom/`、`analyzer/vulnerability/`）— 現在は npm のみ。Trivy があれば Trivy、なければ `npm audit` を使います。どちらもシェルのコマンド文字列ではなく `execFile` と引数の配列で起動するため、リポジトリのパスでコマンドを注入されることはありません。

## LLM 連携（任意）

各レポートの隣に 2 つのコンテキストを書き出します。

- `<analysisId>.llm-context.json` — メトリクス中心のコンテキスト（モジュールのホットスポット、呼び出しグラフの統計、依存の統計、循環依存のサンプル、God Class ランキング）。
- `<analysisId>.llm-ast-only.json` — 構造中心のコンテキスト。カタログの全言語について、複雑なファイルの構造を収めます。

`llm/focus.ts` が 3 つのモードとフォーカス ID を定義します: `full`（`graph-metrics`）、`ast-only`（`ast-structure-only`）、`agent-prompt`（`agent-prompt`）。リクエストは次の順に処理されます。

1. `services/llmRequest.ts` — リクエスト本文を検証し、プロバイダー、API キー、モデル、出力トークン数、温度をサーバー設定と突き合わせて決めます。
2. `llm/artifacts.ts` — キャッシュ済みの結果を返すか、モードに応じたコンテキストを読み込みます。
3. プロバイダー（`llm/providers/`）がレビューまたはエージェント用プロンプトを生成します。
4. `llm/artifacts.ts` が `<analysisId>.llm-<focus>.json` を保存し、`report/liveUpdate.ts` が保存済みレポートの該当要素（`report/reviewElements.ts`）に結果を書き込みます。

`analyzeLlmRequest` がこの流れを実行し、`getSavedLlmResult` は LLM を呼ばずに保存済みの結果を返します。

## レポート生成

`report/htmlBuilder.ts` はページの骨組みだけを担当し、`report/sections/index.ts` がタブの順序と各タブのセクションを定義します。

- `overviewSections.ts` — サマリーカード、God Class ランキング、モジュールメトリクス、レイヤー分析、ファイル統計。
- `graphSections.ts` — Mermaid のラッパー、D3 のクラス依存グラフ、循環依存、LLM 結果の表示欄。
- `astSection.ts` — カタログの全言語の AST 構造。TS/JS と PHP は完全な AST から（`sections/ast/typescriptStructure.ts`、`phpStructure.ts`）、その他の言語はスコア計算と同じ `SimpleFileInfo` から（`lightweightStructure.ts`）構造を作ります。全ファイル・全項目を表示し、長いファイル一覧は一定数（`AST_FILES_PER_BATCH`、`sections/ast/limits.ts`）ずつ表示します。
- `riskSections.ts` — 技術的負債とセキュリティスコア。
- `supplyChainSections.ts` — SBOM と脆弱性スキャン。

レポートは 1 つの HTML ファイルです。Chart.js、Mermaid、marked（DOMPurify 付き）、D3 を `assets/` から埋め込むため、オフラインでも開け、CDN からコードを読み込むことはありません。`report/browser/` はタブ切り替え、「AI向けにコピー」ボタン、日本語に対応した Markdown の強調表示も提供し、拡張機能は古いバージョンで保存したレポートの更新にもこれらを使います。AST のファイル一覧は全ファイルを表示し、`AST_FILES_PER_BATCH` 件ずつ表示を増やします。

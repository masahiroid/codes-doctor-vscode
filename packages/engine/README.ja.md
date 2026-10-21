# Codes Doctor エンジン

- English: [README.md](README.md)
- 日本語: この文書

[Codes Doctor VS Code 拡張機能](../vscode) と [`codes-doctor` CLI](../cli) が使う解析エンジンです。フォルダーを解析し、God Class、技術的負債、セキュリティの指摘、依存・呼び出しグラフ、アーキテクチャレイヤー、AST 表示、SBOM と依存関係の脆弱性スキャンを含む自己完結型の HTML レポートを出力します。プロセス内で動作し、サーバーは不要です。

対応言語: TypeScript/JavaScript と PHP（完全な AST）、Python・Go・Java・C#・Rust・C++（Tree-sitter）、Swift・Kotlin・Dart（簡易的な構造抽出）。詳しくは [docs/ARCHITECTURE.ja.md](docs/ARCHITECTURE.ja.md) を参照してください。

> **言語ごとの精度について。** メインの対応言語は TypeScript/JavaScript と PHP で、専用の完全なパーサーで解析し、最も検証されています。Python、Go、Java、C#、Rust、C++ は Tree-sitter で構文木に変換して解析するため、構造（クラス・メソッド・関数・インポート）は正確に取れます。セキュリティ検査でも、コメント、ただの文字列、定数だけを渡す呼び出しは指摘しません。これらの言語と TypeScript/JavaScript、PHP では、関数内で利用者の入力が危険な処理まで届くかも追跡します。経路を確認できた指摘は「入力から到達」、パターンに一致しただけの指摘は Low に下げて「要確認」と表示します。別の関数を経由する入力はまだ追跡しないため、見落としや「要確認」止まりの指摘は残ります。Swift、Kotlin、Dart は簡易的な構造抽出のままで、誤検知や見落としが多くなります。テストコード内の指摘は「テストコード」と表示し、セキュリティスコアには含めません。結果は確定した評価ではなく、確認のきっかけとして扱ってください。

## ビルド

```bash
npm install
npm run build
```

ビルドで次のものができます。

| 出力 | 内容 |
| --- | --- |
| `dist/` | エンジン（レポートは日本語） |
| `dist-en/` | レポートが英語の同じエンジン。`dist/` から `locales/report-en.json` を使って生成します。翻訳のない日本語の断片があるとビルドは失敗します。 |
| `assets/report-libraries/` | Chart.js、Mermaid、marked（DOMPurify 付き）、D3。すべてのレポートに埋め込まれるため、オフラインでも開けます。 |

## API

```ts
import { analyzeRepository } from './dist'; // 英語のレポートなら './dist-en'

const { reportPath, result } = await analyzeRepository('/path/to/repo', 'auto', '/path/to/output', {
  generatorVersion: 'my-tool 1.0.0',
});
console.log(result.technicalDebt?.overallScore, result.securityScore?.overallScore);
```

| エクスポート | 用途 |
| --- | --- |
| `analyzeRepository(path, language, outputDir?, reportOptions?)` | フォルダーを解析し、`<analysisId>.html` と LLM 用コンテキストを書き出して結果を返す |
| `analyzePathRequest(...)` | 同上。レポートの場所だけを返す |
| `analyzeLlmRequest(config, body)` | 保存済みの解析に対して LLM レビューまたは AI コーディング用プロンプトを生成し、レポートに書き込む |
| `listLlmModels(provider, apiKey)` / `getSavedLlmResult(...)` | 使えるモデルの一覧、保存済みの LLM 結果 |
| `ANALYSIS_LANGUAGES`、`toAnalysisLanguage(value)` | `language` に指定できる値（`auto`、`typescript`、`javascript`、`php` など）とその検証 |
| `LLM_FOCUS` | 3 つの LLM モードのフォーカス ID |

## 設定

`getConfig()` は次の環境変数を読みます。`analyzeLlmRequest` には設定オブジェクトを直接渡すこともできます。

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `CSAP_LLM_ENABLED` | `false` | サーバー側の API キーでの LLM 呼び出しを許可（リクエストでキーを渡す場合は常に可） |
| `CSAP_LLM_PROVIDER` | `openai` | `openai` または `anthropic` |
| `CSAP_LLM_MODEL` / `CSAP_LLM_AST_MODEL` | `gpt-5.4` / `gpt-5.3-chat` | 通常レビュー / AST のみのレビューのモデル |
| `CSAP_LLM_MAX_TOKENS` / `CSAP_LLM_AST_MAX_TOKENS` | `3000` / `4000` | 出力トークン上限 |
| `CSAP_LLM_TEMPERATURE` | `0.2` | 温度 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | サーバー側の API キー |
| `CSAP_PHP_ENABLED` | `true` | PHP を解析する |
| `CSAP_OUTPUT_DIR` | `<cwd>/output` | レポートの既定の出力先 |

モデル名は変わっていくため、`listLlmModels` でそのキーが実際に使えるモデルを取得してください。

## レポートの読み方

- **God スコア（0〜100）:** メソッド数・行数・インポート数・プロパティ数の加重和。75 以上が `critical`、50〜74 が `high`、25〜49 が `medium`、それ未満が `low`。
- **不安定度（0〜1）:** `ファンアウト ÷（ファンイン＋ファンアウト）`。エントリーポイントは本来不安定になりやすく、それだけで設計上の問題とは限りません。
- **技術的負債スコア（0〜100）:** 83 以上が A、70 以上が B、55 以上が C、40 以上が D、それ未満が F。
- **セキュリティスコア（0〜100）:** 90 以上が A、80 以上が B、70 以上が C、60 以上が D、それ未満が F。Critical の指摘があると 59 点、High は 79 点、Medium は 89 点が上限です。

レポートの各タブの説明は [利用マニュアル](../vscode/docs/USER_GUIDE.ja.md) を参照してください。

## 経緯

このエンジンは `csap` という Web サーバー（ZIP アップロード、Web 画面、PDF 出力、Docker）として始まりました。このリポジトリに移した際にサーバー機能は削除しています。最後のサーバー版は `engine-server-final` タグに残っています。

## ライセンス

Apache License 2.0 — [LICENSE](LICENSE) を参照してください。

# Codes Doctor

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

Codes Doctor は、現在開いているワークスペースフォルダーを分析し、God Class・技術的負債・セキュリティ問題・依存グラフ・SBOM を含む構造診断レポートを VS Code 内で直接生成します。解析エンジンはプロセス内で実行されるため、外部サーバーは不要です。

## コマンド

- `Codes Doctor: Analyze Current Workspace`
- `Codes Doctor: Set LLM API Key`

## ダッシュボード（Activity Bar）

インストール後、Activity Bar に Codes Doctor アイコンが表示されます。ダッシュボードから以下を操作できます。

- 言語モードの選択（`auto` / TypeScript・JavaScript / PHP / Dart / Python）
- レポートの開き方の選択（外部ブラウザ / VS Code WebView / VS Code URI オープン）
- 解析の実行
- LLM プロバイダの選択、API キーの設定、モデル一覧のライブ取得、任意の AI 構造レビューの実行

## 使い方

1. ダッシュボードのボタン、またはコマンドパレットから `Analyze Current Workspace` を実行
2. ワークスペースに複数フォルダーがある場合は対象を選択
3. 同梱された解析エンジンがそのフォルダーを直接分析（サーバープロセスは不要）
4. 生成された HTML レポートが `codeDoctor.reportOpenMode` の設定に応じて開く

## 任意機能: LLM 構造レビュー

Codes Doctor は LLM（OpenAI または Anthropic）に分析結果をレビューさせ、構造評価をレポートに書き込ませることができます。

1. ダッシュボードの **LLM Provider** ドロップダウンでプロバイダを選択
2. **Set API Key** をクリックして API キーを貼り付け — VS Code の secret storage（OS keychain）に保存され、settings.json やワークスペース内のどこにも平文で残りません
3. **Fetch** をクリックして、そのキーでアクセス可能なモデル一覧をライブ取得し、1つ選択
4. 分析を実行した後、**Run LLM Review** をクリック — 結果は生成済みレポートに書き戻されます

モデル一覧は毎回プロバイダの API から直接取得されるため、ハードコードされた古いモデル名に縛られることはありません。

## 設定

ダッシュボードの **Display & Report Language / 画面・レポートの言語** で **English**（デフォルト）または **日本語** を選択できます。画面・通知・新しく生成するHTMLレポート・AIレビューに適用されます。既存レポートは生成時の言語を保持し、履歴から追加するAIレビューもその言語に合わせます。言語を切り替えた後、再解析すると選択した言語のレポートを生成できます。

- `codeDoctor.displayLanguage`（デフォルト: `en`） — `en` / `ja`。アプリ全体のユーザー設定として保存され、次に変更するまで、ワークスペースの切り替えや再起動後も選択を保持します。解析対象のプログラミング言語とは独立した設定です。
- `codeDoctor.analysisLanguage`（デフォルト: `auto`） — `auto` / `typescript` / `javascript` / `php` / `dart` / `python`
- `codeDoctor.reportOpenMode`（デフォルト: `external`）
  - `external`: 既定のブラウザで開く
  - `webview`: VS Code の WebView パネルで開く
  - `vscode`: VS Code 自身の URI ハンドラーで開く
- `codeDoctor.llmProvider`（デフォルト: `openai`） — `openai` / `anthropic`
- `codeDoctor.llmModel`（デフォルト: 空） — ダッシュボードのモデル取得後にドロップダウンから設定

## 対応言語

| 言語 | God Class | 技術的負債 | セキュリティ | コールグラフ |
|------|-----------|-----------|-------------|-------------|
| TypeScript / JavaScript | ✅ | ✅ | ✅ | ✅ |
| PHP | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ | — |
| Dart | ✅ | ✅ | — | — |

依存グラフ・循環依存検出・レイヤー分析・SBOM/脆弱性スキャンは、言語を問わず対応する全ファイルを横断して実行されます。

## 開発

この拡張は、[Code Doctor](https://github.com/masahiroid/code-doctor) 解析エンジンのビルド済み出力を同梱しており、実行時にそれへ依存する構成ではありません。ローカルでビルドするには:

```bash
# 1. 兄弟ディレクトリに解析エンジンをクローン・ビルド（CSAP_ROOT で別の場所も指定可）
git clone https://github.com/masahiroid/code-doctor.git ../csap-main
cd ../csap-main && npm install && npm run build && cd -

# 2. この拡張に同梱してパッケージ化
npm install
npm run vendor:csap   # CSAP_ROOT 環境変数を参照、未設定なら ../csap-main を使用
npm run package        # codes-doctor-<version>.vsix を生成
```

## ライセンス

Apache License 2.0 — [LICENSE](LICENSE) を参照してください。

開発・VSIX作成にはNode.js 22以上を使用してください。実装ソースは `src/` にあります。`npm run build` はTypeScript 7でコンパイルし、レポート用ライブラリーを再構築します。`npm run typecheck` で型チェック、`npm run test:browser` で実ブラウザのタブ・図表を検証します。レポートには監査済みライブラリーを埋め込み、CDN接続を不要にしています。依存の互換性制約と監査結果は `docs/dependency-update.md` に記録しています。

## セキュリティーとレポートの見方

MarkdownのHTMLはサニタイズしてから描画します。拡張経由で開くレポートは同梱のブラウザー用ライブラリーを使用します。WebViewはスクリプトの実行を制限し、ネットワーク接続を禁止します。

静的セキュリティー検出は、内容の確認が必要な候補です。コメント、文字列内のコード例、正規表現リテラルの `.exec()` は指摘しません。実行されるテンプレート式は検査します。型専用importは実行時の依存グラフに含めません。生成JSとTSソースの両方があるリポジトリでは重複計測されることがあります。

バージョン履歴は [CHANGELOG](CHANGELOG.md) を参照してください。

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

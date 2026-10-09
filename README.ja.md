# 🩺 Code Doctor

- English: [README.md](README.md)
- 日本語: [README.ja.md](README.ja.md)

コードベースの構造を自動的に診断し、HTML レポートとして可視化するプラットフォームです。God Class・技術的負債・セキュリティ・依存関係の問題を、言語を問わず一貫した指標で見つけます。

## 特徴

### 基本機能
- ✅ **自動言語検出** — TypeScript/JavaScript, PHP, Dart, Python を自動判別
- ✅ **God Class 検出** — メソッド数・行数・結合度・複雑度から 0–100 点でスコアリング
- ✅ **依存グラフ可視化** — Mermaid.js / D3.js によるインタラクティブな図生成
- ✅ **コールグラフ分析** — 関数・メソッド呼び出しの追跡（TypeScript/JavaScript, PHP）
- ✅ **自己完結型 HTML レポート** — 配布・保存しやすい単一ファイル
- ✅ **Web UI** — ZIP アップロードまたはローカルフォルダー指定で即座に分析

### 高度な分析機能
- ✅ **モジュールメトリクス** — Fan-in/Fan-out、Instability、構造スコア
- ✅ **循環依存検出** — DFS アルゴリズムによる依存サイクル検出
- ✅ **技術的負債スコア** — 複雑度・保守性・循環依存を統合（A–F グレード）
- ✅ **セキュリティスコア** — 言語別パターンで eval/exec・コマンドインジェクション・ハードコード認証情報などを検出
- ✅ **アーキテクチャレイヤー分析** — ディレクトリ構成からレイヤーを自動検出しヒートマップ化
- ✅ **SBOM 生成** — CycloneDX / SPDX 形式のソフトウェア部品表
- ✅ **脆弱性スキャン** — Trivy（利用可能な場合）または npm audit による依存関係スキャン
- ✅ **LLM 分析（任意）** — OpenAI API を使った構造レビューの自動生成

## 対応言語

| 言語 | 拡張子 | God Class | 技術的負債 | セキュリティ | コールグラフ |
|------|--------|-----------|-----------|-------------|-------------|
| TypeScript / JavaScript | `.ts` `.tsx` `.js` `.jsx` | ✅ | ✅ | ✅ | ✅ |
| PHP | `.php` | ✅ | ✅ | ✅ | ✅ |
| Python | `.py` | ✅ | ✅ | ✅ | — |
| Dart | `.dart` | ✅ | ✅ | — | — |

依存グラフ・循環依存検出・レイヤー分析・SBOM/脆弱性スキャンは**言語に依存せず**、対応する全言語のファイルを横断して行われます。

## 前提条件

- Node.js 18+
- npm

## クイックスタート

```bash
git clone <このリポジトリのURL>
cd csap-main

npm install
npm run build
npm run dev
# http://localhost:3000 を開く
```

## 使い方

### Web UI
1. `npm run dev` でサーバーを起動
2. ブラウザで `http://localhost:3000` を開く
3. 解析言語（通常は自動検出で十分）を選択
4. ZIP ファイルをアップロード、またはサーバーから参照可能なローカルフォルダーのパスを入力
5. 生成された HTML レポートを確認

### Docker

```bash
docker build -t code-doctor:latest .
docker run -p 3000:3000 \
  -e CSAP_LLM_ENABLED=true \
  -e OPENAI_API_KEY=sk-proj-xxx... \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/output:/app/output \
  code-doctor:latest
```

### docker-compose（本番向け）

```bash
cp .env.example .env   # OPENAI_API_KEY を編集
docker-compose up -d
docker-compose logs -f csap
docker-compose down
```

### CLI

```bash
npx ts-node scripts/test-run.ts /path/to/your/repo
# レポート: ./output/<analysisId>.html
```

### API

```bash
# ZIP ファイルをアップロードして分析
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/repo.zip"

# ローカルフォルダを直接分析
curl -X POST http://localhost:3000/api/analyze-path \
  -H "Content-Type: application/json" \
  -d '{"repoPath":"/absolute/path/to/repo","language":"auto"}'

# ヘルスチェック
curl http://localhost:3000/api/health

# レポート取得
curl http://localhost:3000/reports/<analysisId>
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/` | Web UI |
| POST | `/api/upload` | ZIP ファイルアップロード & 分析開始 |
| POST | `/api/analyze-path` | サーバーから参照可能なローカルフォルダーを直接分析 |
| GET | `/api/health` | ヘルスチェック |
| GET | `/reports/:analysisId` | HTML レポート取得 |
| GET | `/reports/:analysisId/pdf` | PDF レポート取得（Puppeteer 使用） |
| POST | `/api/llm/analyze` | LLM による構造レビューを実行（`CSAP_LLM_ENABLED=true` 時） |
| GET | `/api/llm/result/:analysisId/:focus` | 保存済み LLM 結果を取得 |
| POST | `/api/llm/models` | プロバイダと API キーを渡すと、ライブのモデル一覧を取得（`{ "provider": "openai"\|"anthropic", "apiKey": "..." }`） |

言語パラメータ（`?language=` またはリクエストボディの `language`）は `auto` / `typescript` / `javascript` / `php` / `dart` / `python` を受け付けます。

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `3000` | サーバーリッスンポート |
| `NODE_ENV` | `development` | 実行環境 |
| `CSAP_LLM_ENABLED` | `false` | LLM 分析の有効化 |
| `CSAP_LLM_PROVIDER` | `openai` | LLM プロバイダ: `openai` または `anthropic` |
| `CSAP_LLM_MODEL` | `gpt-5.4` | フル分析に使うモデル ID（下記「モデルの選び方」参照） |
| `CSAP_LLM_AST_MODEL` | `gpt-5.3-chat` | AST-only 分析に使うモデル ID |
| `CSAP_LLM_MAX_TOKENS` | `3000` | フル分析の最大出力トークン数 |
| `CSAP_LLM_AST_MAX_TOKENS` | `4000` | AST-only 分析の最大出力トークン数 |
| `CSAP_LLM_TEMPERATURE` | `0.2` | LLM の temperature |
| `OPENAI_API_KEY` | — | OpenAI API キー（`CSAP_LLM_PROVIDER=openai` 時は必須） |
| `ANTHROPIC_API_KEY` | — | Anthropic API キー（`CSAP_LLM_PROVIDER=anthropic` 時は必須） |
| `CSAP_PHP_ENABLED` | `true` | PHP 解析の有効化 |
| `CSAP_MAX_FILE_SIZE` | `524288000` | アップロード最大サイズ（バイト） |
| `CSAP_UPLOADS_DIR` | `<cwd>/uploads` | アップロード ZIP の保存先 |
| `CSAP_TEMP_DIR` | `<cwd>/temp` | 展開済みリポジトリの保存先 |
| `CSAP_OUTPUT_DIR` | `<cwd>/output` | 生成レポートの保存先 |

### モデルの選び方

モデル名は日々変わるため、モデル ID を推測して直接指定するのではなく、`POST /api/llm/models` にプロバイダと API キーを渡して、そのキーで実際にアクセスできるライブのモデル一覧を取得し、返ってきた ID のいずれかを `CSAP_LLM_MODEL`/`CSAP_LLM_AST_MODEL` に設定することを推奨します。

```bash
curl -X POST http://localhost:3000/api/llm/models \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-xxx..."}'
```

VS Code 拡張のダッシュボードでは、モデル選択の横にある「Fetch」ボタンがこれを代行します。

## レポートの見方

生成される HTML レポートは、上から順に以下のセクションで構成されています。

1. **概要** — 総ファイル数・総クラス数・平均 God スコア・技術的負債/セキュリティスコアのサマリーカード
2. **God Class ランキング** — 最もスコアが高いクラス上位（スコア分布のヒストグラム付き）。`critical`/`high`/`medium`/`low` の4段階でランク付け
3. **モジュール結合度メトリクス** — Fan-in/Fan-out の散布図と構造スコア。`軽量入口`（起動点など）は不安定でも自然な状態として区別表示
4. **技術的負債 / セキュリティスコア** — A–F グレードと、スコアの根拠となった問題の内訳
5. **依存グラフ・コールグラフ** — モジュール間の参照関係・呼び出し関係を図示。循環依存があれば個別にハイライト
6. **アーキテクチャレイヤー分析** — ディレクトリ構成から推定したレイヤー間の依存ヒートマップ
7. **SBOM / 脆弱性スキャン** — 依存パッケージの一覧と既知の脆弱性
8. **AST Structure** — サンプリングされたファイルの構造（import/クラス/関数）をツリー表示。`CSAP_LLM_ENABLED=true` の場合はこのセクションから LLM にコード設計レビューを依頼できる

スコアの指標は以下のように読みます。

- **God スコア（0–100）**: メソッド数・行数・インポート数・プロパティ数の加重合計。75 以上は `critical`（優先的に分割を検討）、50–74 は `high`、25–49 は `medium`、それ未満は `low`
- **Instability（0–1）**: `fan-out / (fan-in + fan-out)`。1 に近いほど「多くに依存し、依存されていない」モジュール。起動点やエントリーポイントは本質的に不安定だが、それ自体は設計上の問題ではない
- **技術的負債 / セキュリティスコア（0–100, A–F）**: 90 以上が A、80 以上が B、70 以上が C、60 以上が D、それ未満が F。各スコアの内訳（何件の critical/high 問題があったか）はレポート内の説明文で確認できる

## VS Code 拡張「Code Doctor」

`vscode-extension/csap-analyzer` に、ワークスペースを直接解析する VS Code 拡張を用意しています。解析エンジンを拡張内に同梱しているため、このリポジトリのサーバーを別途起動する必要はありません。

```bash
npm run build   # このリポジトリのルートで
cd vscode-extension/csap-analyzer
npm install
npm run package  # code-doctor-<version>.vsix を生成
```

詳細は [vscode-extension/csap-analyzer/README.md](vscode-extension/csap-analyzer/README.md) を参照してください。

## ドキュメント

| ドキュメント | 内容 |
|-----------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | システム構成・分析パイプライン・言語別実装の詳細 |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | 全 API エンドポイントのリクエスト/レスポンス仕様 |

## トラブルシューティング

**`Cannot find module '@typescript-eslint/typescript-estree'`**
```bash
npm install
npm run build
```

**Docker: ポートが使用中**
```bash
docker run -p 3001:3000 code-doctor:latest
```

**アップロードが 413 エラーで失敗する**
`CSAP_MAX_FILE_SIZE`（デフォルト 500MB）を超えています。環境変数で上限を変更してください。

**レポートが表示されない**
```bash
ls -la output/
curl http://localhost:3000/reports/<analysisId>
```

## ライセンス

Apache License 2.0 — 詳細は [LICENSE](LICENSE) を参照してください。

## 貢献

改善提案は Issue または PR でお願いします。

## 参考資料

- [TypeScript ESTree](https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/typescript-estree)
- [php-parser](https://github.com/glayzzle/php-parser)
- [Mermaid.js](https://mermaid.js.org/)
- [D3.js](https://d3js.org/)
- [Express.js](https://expressjs.com/)

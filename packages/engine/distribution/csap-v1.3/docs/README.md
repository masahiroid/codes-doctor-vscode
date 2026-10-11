# 🔍 CSAP - Code Structural Audit Platform

コードベースの構造を自動的に監査し、可視化するための包括的なプラットフォームです。

## 特徴

### 基本機能
- ✅ **自動コード解析** — TypeScript/JavaScript/PHP を自動検出
- ✅ **God Class 検出** — 複雑度スコアによるコード品質評価
- ✅ **依存グラフ可視化** — Mermaid.js による図生成
- ✅ **コールグラフ分析** — 関数呼び出しの追跡
- ✅ **HTML レポート** — 自己完結型のプロフェッショナルレポート（1,168行）
- ✅ **Web UI** — ZIP アップロードで即座に分析

### 高度な分析機能
- ✅ **モジュールメトリクス** — Fan-in/Fan-out、中央性、構造スコア
- ✅ **循環依存検出** — DFSアルゴリズムによる依存サイクル検出
- ✅ **技術的負債スコア** — 5つのメトリクスを統合（A-Fグレード）
- ✅ **セキュリティスコア** — 40+ パターンでXSS/Injectionを検出
- ✅ **レイヤー分析** — アーキテクチャレイヤーの自動検出とヒートマップ
- ✅ **SBOM生成** — CycloneDX形式のソフトウェア部品表
- ✅ **脆弱性スキャン** — npm audit統合でCVE情報取得

## 前提条件

- Node.js 16+
- npm または yarn

## 📚 ドキュメント

各シーンに応じたガイドをご参照ください：

| ドキュメント | 対象 | 内容 |
|-----------|------|------|
| **[DOCKER_SETUP.md](DOCKER_SETUP.md)** | 🐳 Docker ユーザー | セットアップ・カスタマイズ・トラブルシューティング |
| **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** | 🚀 運用者 | 本番環境へのデプロイメント・監視・メンテナンス |
| **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** | ⚡ よく使う人 | コマンド一覧・チートシート・Tips |
| **[PROGRESS.md](PROGRESS.md)** | 📊 開発者 | 実装進捗・アーキテクチャ・ロードマップ |

## インストール

```bash
# リポジトリクローン
git clone https://github.com/yourrepo/csap.git
cd csap

# 依存パッケージインストール
npm install

# TypeScript コンパイル
npm run build
```

## 使用方法

### Web UI を使用

```bash
# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:3000 を開く
# ZIP ファイルを選択してアップロード
```

### Docker を使用

**推奨：クロスプラットフォーム対応**

```bash
# イメージを構築
docker build -t csap:latest .

# コンテナを実行
docker run -p 3000:3000 \
  -e CSAP_LLM_ENABLED=true \
  -e OPENAI_API_KEY=sk-proj-xxx... \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/output:/app/output \
  csap:latest
```

**docker-compose（推奨）：本番デプロイ向け**

```bash
# .env ファイルを作成（オプション）
cp .env.example .env
# OPENAI_API_KEY を編集

# コンテナスタック起動
docker-compose up -d

# ログ確認
docker-compose logs -f csap

# シャットダウン
docker-compose down
```

### CLI で分析

```bash
# リポジトリを分析して HTML レポートを生成
ts-node scripts/test-run.ts /path/to/your/repo

# 生成されたレポート: ./output/<analysisId>.html
```

### API を使用

```bash
# ZIP ファイルをアップロード
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/repo.zip" \
  -H "Accept: application/json"

# ヘルスチェック
curl http://localhost:3000/api/health

# レポート取得
curl http://localhost:3000/reports/<analysisId>
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/` | Web UI (アップロードページ) |
| POST | `/api/upload` | ZIP ファイルアップロード & 分析開始 |
| GET | `/api/health` | ヘルスチェック |
| GET | `/reports/:analysisId` | HTML レポート取得 |

## 環境変数

### サーバー設定

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `3000` | サーバーリッスンポート |
| `NODE_ENV` | `development` | 実行環境（`production` または `development`） |

### LLM/OpenAI 設定

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `CSAP_LLM_ENABLED` | `false` | LLM分析有効化（`true` で有効） |
| `CSAP_LLM_MODEL` | `gpt-4o-mini` | 使用するOpenAIモデル |
| `CSAP_LLM_MAX_TOKENS` | `700` | 応答の最大トークン数 |
| `CSAP_LLM_TEMPERATURE` | `0.2` | 出力の創意性（0=決定的, 1=創意的） |
| `OPENAI_API_KEY` | **必須** | OpenAI APIキー（LLM有効時） |

### 機能フラグ

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `CSAP_PHP_ENABLED` | `true` | PHP分析有効化 |

### リソース制限

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `CSAP_MAX_FILE_SIZE` | `524288000` | アップロード最大サイズ（バイト）|
| `CSAP_MAX_FILES_PER_REPO` | `10000` | リポジトリあたりの最大ファイル数 |

## 分析メトリクス

### God Class スコアリング

クラスの複雑度を 0-100 のスコアで評価します：

```
スコア計算:
- メソッド数:    0-40 点
- 行数:          0-30 点
- インポート数:  0-20 点
- プロパティ数:  0-10 点

ランク:
- 75+: critical (リファクタリング推奨)
- 50-74: high (改善を検討)
- 25-49: medium (監視中)
- 0-24: low (良好)
```

### モジュールメトリクス

```
Fan-in:  このモジュールに依存しているモジュール数
Fan-out: このモジュールが依存しているモジュール数
Centrality: (Fan-in + Fan-out) / (N - 1)
Instability: Fan-out / (Fan-in + Fan-out)
構造スコア: 0.4×安定性 + 0.4×中央性 + 0.2×Fan-in正規化
```

### 技術的負債スコア（0-100、A-Fグレード）

```
メトリクス:
- コード複雑度 (30%): God Classスコアベース
- 保守性 (25%): モジュールメトリクスベース
- 循環依存 (20%): サイクル数ベース
- テストカバレッジ (15%): 将来実装予定
- ドキュメント (10%): 将来実装予定
```

### セキュリティスコア（0-100、A-Fグレード）

40+ のセキュリティパターンを検出：
- Code Injection (eval, Function)
- XSS (innerHTML, dangerouslySetInnerHTML)
- ハードコードされた認証情報
- 弱い暗号化/乱数
- SQLインジェクション
- パストラバーサル
- その他

## 設定

### 環境変数

```bash
# ポート設定
PORT=3000

# LLM 分析有効化 (デフォルト: false)
CSAP_LLM_ENABLED=false

# PHP 分析有効化 (デフォルト: true)
CSAP_PHP_ENABLED=true

# 最大ファイルサイズ (デフォルト: 104857600 bytes = 100MB)
CSAP_MAX_FILE_SIZE=104857600
```

### src/config.ts

メインの設定ファイルです。フィーチャーフラグやリミットを調整できます。

## プロジェクト構造

```
csap/
├── src/
│   ├── analyzer/           # 分析エンジン
│   │   ├── index.ts        # メインオーケストレーター
│   │   ├── languageDetector.ts
│   │   ├── typescript/     # TS/JS 解析
│   │   └── php/            # PHP 解析
│   ├── graph/              # 図生成
│   ├── report/             # レポート生成
│   ├── config.ts           # 設定管理
│   ├── types.ts            # 型定義
│   ├── extractor.ts        # ZIP 処理
│   ├── upload.ts           # アップロード API
│   └── server.ts           # Express サーバー
├── scripts/
│   ├── test-run.ts         # CLI テスト
│   └── test-upload.sh      # API テスト
├── uploads/                # 一時 ZIP 保存
├── temp/                   # 展開済みリポジトリ
├── output/                 # 生成レポート
└── dist/                   # コンパイル出力
```

## 対応言語

### TypeScript / JavaScript
- `.ts`, `.tsx`, `.js`, `.jsx` ファイルを完全解析
- `@typescript-eslint/typescript-estree` を使用
- クラス、メソッド、プロパティ、インポート全てを検出

### PHP
- `.php` ファイルを regex ベースで解析 (PoC)
- クラス、メソッド、namespace を検出
- 将来的に フルパーサ対応予定

## レポート機能

生成されるレポートには以下が含まれます：

1. **サマリーカード** — ファイル数、クラス数、平均スコア
2. **God Class ランキング** — 最も複雑なクラス Top 20
3. **依存グラフ** — モジュール間の依存関係
4. **コールグラフ** — 関数間の呼び出し関係
5. **ファイル統計** — 言語別ファイル情報

すべて Mermaid.js で可視化され、レスポンシブデザインが適用されています。

## トラブルシューティング

### "Cannot find module '@typescript-eslint/typescript-estree'"

```bash
npm install
npm run build
```

### Docker: ポートがバインド中

```bash
# バインド中のポートを進める
docker run -p 3001:3000 csap:latest

# または既存のコンテナを停止
docker-compose down
```

### Docker: メモリ不足

```bash
# compose ファイルのメモリ制限を増加
# docker-compose.yml で memory: 4G などに変更

docker-compose up -d --build
```

### Docker: コンテナが起動しない

```bash
# ログで詳細を確認
docker-compose logs csap

# または直接実行でエラーを表示
docker run -it --rm csap:latest
```

### アップロードが 413 エラーで失敗

```bash
# ファイルサイズが制限を超えています
# 最大 100MB です（env변수 で変更可能）
```

### レポートが表示されない

```bash
# output/ ディレクトリ & ファイルを確認
ls -la output/

# curl でレポート取得を試みる
curl http://localhost:3000/reports/<analysisId>
```

## 型安全性

完全 TypeScript です。すべての関数とモジュールは強い型付けがされています。

```bash
# 型チェック
npm run build

# 型エラーがある場合、修正してから再度実行してください
```

## テスト

```bash
# CLI テスト (サーバー起動不要)
ts-node scripts/test-run.ts ./src

# API テスト (サーバー起動後)
./scripts/test-upload.sh /path/to/repo.zip

# 生成物確認
ls output/
```

## リリース

```bash
# ビルド
npm run build

# 本番サーバー起動
npm start
```

## ライセンス

MIT

## 貢献

改善提案は Issue または PR でお願いします。

## 参考資料

- [TypeScript ESTree](https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/typescript-estree)
- [Mermaid.js](https://mermaid.js.org/)
- [Express.js](https://expressjs.com/)

---

**CSAP v1.0** — Code Structural Audit Platform  
Built with TypeScript, Express, and modern web technologies.
# csap

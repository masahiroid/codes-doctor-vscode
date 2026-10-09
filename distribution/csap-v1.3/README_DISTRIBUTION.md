# 📦 CSAP v1.3 配布用パッケージ

**Code Structural Audit Platform** の本番環境用配布パッケージです。

---

## 📋 パッケージ内容

```
csap-v1.3/
├── dist/                          # ビルド済み JavaScript
│   ├── analyzer/
│   ├── llm/
│   ├── report/
│   ├── graph/
│   └── *.js
├── docker-compose.yml             # 本番環境用設定
├── Dockerfile                      # 本番用イメージビルド
├── .dockerignore
├── .env.example                    # 環境変数テンプレート
├── package.json                    # 本番用（devDependencies除外）
├── package-lock.json
├── volumes/
│   ├── uploads/                    # アップロードされたZIP
│   ├── temp/                       # 一時ファイル
│   └── output/                     # 生成レポート
├── docs/
│   ├── DOCKER_SETUP.md            # Docker セットアップガイド
│   ├── DEPLOYMENT_GUIDE.md        # 本番デプロイメント手順
│   ├── QUICK_REFERENCE.md         # クイックリファレンス
│   └── README.md                  # 基本機能説明
├── README_DISTRIBUTION.md          # このファイル
└── VERSION.txt                     # バージョン情報
```

---

## 🚀 クイックスタート（Docker使用）

### 1. 前提条件確認

```bash
docker --version      # 18.09 以上
docker-compose --version  # 1.25 以上
```

### 2. 環境設定

```bash
# テンプレートから .env を作成
cp .env.example .env

# エディタで編集（必要に応じて）
nano .env
```

**最小限の設定:**
```bash
PORT=3000
NODE_ENV=production
CSAP_LLM_ENABLED=false
```

**LLM機能を使う場合:**
```bash
CSAP_LLM_ENABLED=true
OPENAI_API_KEY=sk-proj-xxx...
```

### 3. コンテナ起動

```bash
docker-compose up -d
```

### 4. ブラウザで開く

```
http://localhost:3000
```

✅ 完了！

---

## 📊 確認コマンド

```bash
# コンテナ状態確認
docker-compose ps

# ログ確認
docker-compose logs -f csap

# ハルスチェック
curl http://localhost:3000/api/health
```

---

## 📚 詳細ドキュメント

| ドキュメント | 内容 |
|-----------|------|
| **docs/DOCKER_SETUP.md** | Docker セットアップから トラブルシューティングまで |
| **docs/DEPLOYMENT_GUIDE.md** | 本番環境へのデプロイメント・監視・メンテナンス |
| **docs/QUICK_REFERENCE.md** | よく使うコマンド・チートシート |
| **docs/README.md** | 基本機能・API エンドポイント説明 |

---

## 🔧 設定ファイル

### .env（環境変数）

主要な設定項目：

```bash
# サーバー設定
PORT=3000
NODE_ENV=production

# LLM 設定（オプション）
CSAP_LLM_ENABLED=false
CSAP_LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=    # LLM有効時は必須

# リソース制限
CSAP_MAX_FILE_SIZE=524288000  # 500MB
CSAP_MAX_FILES_PER_REPO=10000
```

詳細は `.env.example` を参照。

---

## 💾 データ管理

### ディレクトリ構造

| ディレクトリ | 用途 | 永続化 |
|----------|------|------|
| `volumes/uploads/` | アップロード ZIP | ✓ |
| `volumes/temp/` | 展開・作業ファイル | ✗ |
| `volumes/output/` | 生成HTML レポート | ✓ |

### バックアップ

```bash
# output ディレクトリをバックアップ
tar -czf csap_backup_$(date +%Y%m%d).tar.gz volumes/output/

# または S3 にアップロード
aws s3 cp csap_backup_*.tar.gz s3://my-bucket/
```

### クリーンアップ

```bash
# コンテナ停止・削除
docker-compose down

# イメージ削除
docker rmi csap:latest

# ボリューム削除（⚠️ データ消失）
docker-compose down -v
```

---

## 🛠️ トラブルシューティング

### ポート 3000 が使用中

```bash
docker run -p 3001:3000 \
  -v $(pwd)/volumes/output:/app/output \
  -e CSAP_LLM_ENABLED=false \
  csap:latest
# http://localhost:3001 でアクセス
```

### メモリ不足

docker-compose.yml で メモリ制限を増加：

```yaml
deploy:
  resources:
    limits:
      memory: 4G  # 2G → 4G に変更
```

その後：
```bash
docker-compose up -d --force-recreate
```

### コンテナがクラッシュ

```bash
# ログで原因確認
docker-compose logs -tail 100 csap

# 再起動
docker-compose restart csap
```

詳細は **docs/DOCKER_SETUP.md** の「トラブルシューティング」を参照。

---

## 📈 本番環境へのデプロイ

### AWS EC2 の例

```bash
# 1. EC2 インスタンスに接続
ssh -i key.pem ec2-user@your-instance-ip

# 2. Docker インストール
sudo yum install docker -y
sudo systemctl start docker

# 3. このパッケージをアップロード
scp -r -i key.pem csap-v1.3/ ec2-user@your-instance-ip:/opt/

# 4. サーバーで起動
cd /opt/csap-v1.3
docker-compose up -d
```

詳細は **docs/DEPLOYMENT_GUIDE.md** を参照。

---

## 🔐 セキュリティ

### 本番環境推奨設定

1. **SSL/TLS 導入**
   - Let's Encrypt で証明書取得
   - Nginx リバースプロキシ経由でアクセス

2. **API キー保護**
   - `.env` ファイルを Git にコミットしない
   - 環境変数として注入する

3. **ファイアウォール設定**
   - ポート 3000 はローカルホストのみ
   - 外部からは Nginx（ポート 80/443）経由

4. **ログ監視**
   - ログファイルを定期的に確認
   - エラー率・メモリ使用量を監視

---

## 📞 サポート・トラブル

### よくある質問（FAQ）

**Q: Node.js をインストール必要？**  
A: いいえ。Docker を使うので不要です。

**Q: オフラインで動作できる？**  
A: はい（LLM 機能を除く）。OpenAI API 不要。

**Q: 複数ユーザーで同時利用できる？**  
A: はい。ただしファイル名競合に注意。

**Q: Windows/Mac で動作？**  
A: はい。Docker Desktop を使用。

詳細は **docs/QUICK_REFERENCE.md** を参照。

---

## 📦 パッケージ情報

```
パッケージ名: csap-v1.3
バージョン: 1.3.0
リリース日: 2026年3月4日
対応環境: Linux / macOS / Windows (Docker)
ライセンス: MIT
```

詳細は `VERSION.txt` を参照。

---

## 🔄 アップグレード

新しいバージョンが利用可能になった場合：

```bash
# 現在のデータをバックアップ
tar -czf csap_backup_$(date +%Y%m%d).tar.gz volumes/

# 新バージョンに置き換え
cd ..
mv csap-v1.3 csap-v1.3-old
# 新しい csap-v1.4 をダウンロード
cp csap-v1.4/docker-compose.yml .
cp csap-v1.4/Dockerfile .

# 再起動
docker-compose down
docker-compose build
docker-compose up -d
```

---

## 📝 ライセンス

MIT License - 詳細は LICENSE ファイルを参照

---

## 🙋 フィードバック・改善提案

問題や改善提案がある場合は、オーナーまでご連絡ください。

---

**最終更新:** 2026年3月4日  
**バージョン:** v1.3 Distribution Release

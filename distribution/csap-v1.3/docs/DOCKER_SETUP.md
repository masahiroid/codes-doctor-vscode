# 🐳 CSAP Docker セットアップガイド

このガイドは、Docker を使用して CSAP（Code Structural Audit Platform）をローカルマシンまたはクラウド環境にデプロイする手順を説明しています。

---

## 📋 必要なもの

### システム要件

- **Docker**（18.09 以上）
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) をインストール（macOS/Windows）
  - [Docker Engine](https://docs.docker.com/engine/install/) をインストール（Linux）

- **Docker Compose**（1.25以上）
  - Docker Desktop に付属
  - Linux の場合は別途インストール: `sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`

- **ディスク容量:** 最低 1GB（イメージ + 作業データ）

### オプション: OpenAI API キー

LLM 機能を使用する場合のみ必須です。

- [OpenAI Platform](https://platform.openai.com/api-keys) から API キーを取得

---

## 🚀 クイックスタート（3ステップ）

### 1️⃣ リポジトリをクローン

```bash
git clone <repository-url> csap
cd csap
```

### 2️⃣ コンテナを起動

```bash
docker-compose up -d
```

### 3️⃣ ブラウザで開く

```
http://localhost:3000
```

✅ 完了！これで CSAP が実行されています。

---

## 📖 詳細セットアップ

### ステップ 1: 前提条件の確認

```bash
# Docker がインストール済みか確認
docker --version
# Docker version 24.0.0 以上が出力されたら OK

# Docker Compose がインストール済みか確認
docker-compose --version
# Docker Compose version v2.20.0 以上が出力されたら OK
```

**問題がある場合:**
- [Docker Desktop インストール](https://www.docker.com/products/docker-desktop/)
- [Docker Engine インストール（Linux）](https://docs.docker.com/engine/install/)

### ステップ 2: 環境ファイルの準備

#### 基本設定（オプション）

```bash
# デフォルト設定をコピー
cp .env.example .env

# エディタで開く
nano .env  # または vim, code など
```

#### LLM 機能を有効にする場合

`.env` ファイルを編集し、以下の値を設定：

```bash
# 必須: OpenAI API キーを設定
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx

# オプション: モデルやトークン数をカスタマイズ
CSAP_LLM_ENABLED=true
CSAP_LLM_MODEL=gpt-4o-mini
CSAP_LLM_MAX_TOKENS=700
CSAP_LLM_TEMPERATURE=0.2
```

**⚠️ セキュリティ注意:**
- `.env` ファイルを Git リポジトリにコミットしないこと
- `.gitignore` に `.env` が含まれていることを確認すること
- API キーを他人と共有しないこと

### ステップ 3: Docker イメージをビルド

```bash
# イメージを構築（初回のみ）
docker-compose build

# または自動的にビルド & 起動
docker-compose up -d
```

**出力例:**
```
Building csap
[+] Building 45.2s (10/10) FINISHED
 => [builder 1/5] FROM node:20-alpine
 ...
 => Built image: csap_csap:latest
```

### ステップ 4: コンテナの起動

```bash
# バックグラウンドで起動
docker-compose up -d

# ログを確認（リアルタイム）
docker-compose logs -f csap

# コンテナの状態を確認
docker-compose ps
```

**期待される出力:**
```
NAME      STATUS          PORTS
csap-app  Up 10 seconds   0.0.0.0:3000->3000/tcp
```

### ステップ 5: ブラウザでアクセス

```
http://localhost:3000
```

✅ アップロードページが表示されたら成功です！

---

## 💻 使用方法

### Web UI でコード分析

1. **ブラウザで** `http://localhost:3000` を開く
2. **「ファイルを選択」** ボタンをクリック
3. **ZIP ファイルをアップロード（最大 500MB）**
4. **分析が自動開始**（数秒～数分）
5. **HTML レポートが生成**される

### コマンドラインでテスト分析

コンテナ内でテスト用スクリプトを実行：

```bash
# コンテナ内で実行
docker-compose exec csap ts-node scripts/test-run.ts /app/src

# または
docker-compose exec csap npm run build
```

### LLM 分析機能を試す

1. `.env` で `CSAP_LLM_ENABLED=true` を設定
2. `OPENAI_API_KEY` を設定
3. `docker-compose restart` で再起動
4. アップロード後、レポートの「**LLM構造解析**」ボタンをクリック
5. 自動で OpenAI が分析結果を提供

---

## 🛠️ よくある操作

### コンテナを停止

```bash
docker-compose down
```

### コンテナを再起動

```bash
docker-compose restart csap
```

### ログを確認（トラブル時）

```bash
# 最後100行のログを表示
docker-compose logs csap --tail 100

# リアルタイムでログを表示
docker-compose logs -f csap

# 特定のエラーを検索
docker-compose logs csap | grep ERROR
```

### コンテナ内で直接コマンド実行

```bash
# Node.js REPL を起動
docker-compose exec csap node

# シェルを開く
docker-compose exec csap sh

# ファイルを確認
docker-compose exec csap ls -la /app/output
```

### 分析結果を確認

```bash
# ホストマシンから結果を確認
ls -la ./output/

# または
open ./output/  # macOS
explorer .\output\  # Windows
ls ./output/  # Linux
```

---

## 📊 データ永続化

### アップロード・出力ディレクトリ

Docker Compose では以下のディレクトリがホストマシンにマウントされています：

| ディレクトリ | ホストパス | 説明 |
|-----------|----------|------|
| `/app/uploads` | `./uploads` | アップロードされた ZIP ファイル |
| `/app/temp` | `./temp` | 一時的な展開ファイル |
| `/app/output` | `./output` | 生成された HTML レポート |

これらのディレクトリはコンテナを削除してもデータが残ります（ボリュームマウントのため）。

### データをバックアップ

```bash
# output ディレクトリをコピー
cp -r ./output ~/Desktop/csap_reports_backup

# または圧縮
tar -czf csap_output_$(date +%Y%m%d).tar.gz ./output
```

---

## 🔧 カスタマイズ

### ポート番号を変更

デフォルト: `3000`

**docker-compose.yml で変更:**

```yaml
services:
  csap:
    ports:
      - "8080:3000"  # ホストの 8080 → コンテナの 3000
```

再起動後、`http://localhost:8080` でアクセス可能

### メモリ・CPU 制限を調整

大規模なコードベースを分析する場合は、リソース制限を増やします：

**docker-compose.yml:**

```yaml
services:
  csap:
    deploy:
      resources:
        limits:
          cpus: '4'        # 4コア
          memory: 4G       # 4GB
        reservations:
          cpus: '2'
          memory: 2G
```

### ログレベルを調整（開発時）

**Dockerfile または docker-compose.yml:**

```yaml
services:
  csap:
    environment:
      - NODE_ENV=development  # ログが詳細化
      - DEBUG=csap:*          # デバッグモード有効
```

---

## 🐛 トラブルシューティング

### エラー: "Cannot connect to Docker daemon"

**原因:** Docker が起動していない

**解決:**
- **macOS/Windows:** Docker Desktop を起動する
- **Linux:** `sudo systemctl start docker`

### エラー: "port 3000 is already allocated"

**原因:** ポート 3000 が他のアプリケーションで使用中

**解決方法 1: ポート番号を変更**
```bash
# docker-compose.yml の ports を変更
# - "3000:3000" → - "3001:3000"
docker-compose up -d
# http://localhost:3001 でアクセス
```

**解決方法 2: 既存プロセスを停止**
```bash
# macOS/Linux
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# または
fuser -k 3000/tcp

# その後
docker-compose up -d
```

### エラー: "out of memory"

**原因:** 大規模なコードベースを分析

**解決:**
1. リソース制限を増やす（上記「カスタマイズ」参照）
2. または分析対象を小さくしてテスト

### エラー: "Cannot find module"

**原因:** ビルドが失敗した

**解決:**
```bash
# イメージを再構築
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# ログで詳細を確認
docker-compose logs csap
```

### LLM 機能が動作しない

**確認項目:**

```bash
# 1. OPENAI_API_KEY が設定されているか確認
docker-compose exec csap env | grep OPENAI_API_KEY

# 2. env ファイルを確認
cat .env

# 3. コンテナを再起動
docker-compose restart csap

# 4. ログでエラーを確認
docker-compose logs csap | tail -50
```

**よくあるエラー:**
- `401 Unauthorized` → API キーが無効または期限切れ
- `429 Too Many Requests` → API レート制限に達した
- `500 Internal Server Error` → OpenAI サーバーが一時的に利用不可

### ファイルがアップロードできない（413 エラー）

**原因:** アップロードサイズが制限を超えた

**確認:**
```bash
# デフォルト制限は 500MB
# .env で CSAP_MAX_FILE_SIZE を設定

# 例: 1GB に変更
echo 'CSAP_MAX_FILE_SIZE=1073741824' >> .env
docker-compose restart
```

---

## 🌐 クラウドへのデプロイ

### AWS EC2 へのデプロイ

```bash
# 1. SSH でサーバーへ接続
ssh -i key.pem ec2-user@your-instance-ip

# 2. Docker & Docker Compose をインストール
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo usermod -a -G docker $USER

# 3. リポジトリをクローン
git clone <repository-url> csap
cd csap

# 4. .env を設定
nano .env

# 5. 起動
docker-compose up -d

# 6. セキュリティグループでポート 3000 を開く
# AWS コンソール → セキュリティグループ → インバウンドルール
# ポート 3000 を 0.0.0.0/0 で開く
```

### Google Cloud Run へのデプロイ

```bash
# 1. Google Cloud SDK をインストール
curl https://sdk.cloud.google.com | bash

# 2. 認証
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. イメージをビルド & プッシュ
docker build -t gcr.io/YOUR_PROJECT_ID/csap:latest .
docker push gcr.io/YOUR_PROJECT_ID/csap:latest

# 4. Cloud Run にデプロイ
gcloud run deploy csap \
  --image gcr.io/YOUR_PROJECT_ID/csap:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=sk-proj-xxx...
```

### Heroku へのデプロイ

```bash
# 1. Heroku CLI をインストール
brew tap heroku/brew && brew install heroku

# 2. ログイン
heroku login

# 3. Heroku アプリを作成
heroku create your-csap-app

# 4. 環境変数を設定
heroku config:set OPENAI_API_KEY=sk-proj-xxx...
heroku config:set CSAP_LLM_ENABLED=true

# 5. プッシュしてデプロイ
git push heroku main

# 6. ログでエラーを確認
heroku logs --tail
```

---

## 📈 本番環境のベストプラクティス

### 1️⃣ リバースプロキシの設定（Nginx）

```nginx
upstream csap {
    server csap:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://csap;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2️⃣ SSL/TLS 設定（Let's Encrypt）

```bash
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone -d your-domain.com
```

### 3️⃣ ログ集約・監視

docker-compose.yml にリソースモニタリングを追加：

```yaml
services:
  csap:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "10"
        labels: "app=csap"
```

### 4️⃣ 定期的なバックアップ

```bash
# クロンジョブで毎日バックアップ
0 2 * * * cd /path/to/csap && tar -czf /backup/csap_$(date +\%Y\%m\%d).tar.gz ./output
```

---

## 🆘 サポート & リソース

### ドキュメント

- [README.md](README.md) - 基本機能説明
- [PROGRESS.md](PROGRESS.md) - 開発進捗
- 公式 Docker ドキュメント: https://docs.docker.com

### よくあるご質問

**Q: Docker のイメージサイズはどのくらい？**  
A: 約 150-200MB（Alpine Linux ベース）

**Q: セキュリティはどうなっている？**  
A: 本番環境ではファイアウォール + SSL/TLS + API 認証の追加を推奨

**Q: 複数ユーザーで同時に使える？**  
A: はい。ただし大規模分析は メモリ制限に注意

**Q: オフラインで動作できる？**  
A: はい（LLM 機能を除く）

---

## ✅ チェックリスト

セットアップ完了の確認：

- [ ] Docker / Docker Compose をインストール済み
- [ ] リポジトリをクローン
- [ ] `docker-compose up -d` で起動成功
- [ ] `http://localhost:3000` でアップロードページが表示される
- [ ] テストファイルをアップロード & 分析成功
- [ ] HTML レポートが生成される
- [ ] （オプション）LLM 機能が動作（OPENAI_API_KEY 設定時）

✨ すべてのチェックが完了したら、CSAP は本番利用可能です！

---

**最終更新:** 2026年3月4日  
**バージョン:** v1.3 Docker Edition

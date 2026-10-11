# 📦 CSAP デプロイメント完全ガイド

本番環境に CSAP を安全・確実にデプロイするための詳細な手順書です。

---

## 🎯 本ガイドの目的

- ✅ ローカル開発環境での検証
- ✅ ステージング環境でのテスト
- ✅ 本番環境への安全なリリース
- ✅ 継続的な監視・保守

---

## 🆕 2026-03 運用方針アップデート（Coolify）

- Coolify を利用する場合、CSAP 側コードの大きな改修は不要（既存 `Dockerfile` を利用可能）
- 既存 Nginx が同一サーバーで 80/443 を使用している場合は、ポート競合の設計を先に固定する
- 他 Node.js プロジェクトとの同居は可能だが、CPU/RAM/ディスクとポート割当の管理を必須とする

推奨構成:
- 1. Coolify 専用サーバーに分離する（最も安全）
- 2. 同居する場合は、既存 Nginx を上位プロキシとして残し、Coolify 側の公開責務を明示分離する

---

## 📊 各環境の比較

| 項目 | ローカル開発 | ステージング | 本番環境 |
|------|-----------|-----------|--------|
| **目的** | 開発・テスト | 本番同等環境でテスト | ユーザー利用 |
| **Docker Compose** | ✓ 推奨 | ✓ 推奨 | ✗ kubernetes推奨 |
| **URL** | http://localhost:3000 | https://staging.corp.com | https://csap.corp.com |
| **SSL/TLS** | 不要 | 推奨 | **必須** |
| **バックアップ** | 不要 | 毎週 | **毎日** |
| **モニタリング** | ログのみ | Syslog + メトリクス | Datadog/New Relic等 |

---

## 🔄 デプロイメント フロー

```
Local Development
       ↓
   npm run dev（環境構築テスト）
       ↓
   docker-compose up（Dockerテスト）
       ↓
Staging Environment
       ↓
   本番同等環境でテスト
       ↓
Production Deployment
       ↓
   本番リリース
       ↓
Monitoring & Maintenance
       ↓
   日次監視・ログ確認
```

---

## 🏗️ Phase 1: ローカル開発環境

### 1.1 初期セットアップ

```bash
# リポジトリクローン
git clone https://github.com/yourorg/csap.git
cd csap

# ブランチ確認
git status

# 依存関係インストール
npm install

# 環境ファイルの作成
cp .env.example .env.local

# エディタで編集
nano .env.local
```

### 1.2 ローカル実行（Node.jsダイレクト）

```bash
# ビルド
npm run build

# 開発サーバー起動（ホットリロード付き）
npm run dev

# ブラウザで開く
open http://localhost:3000

# Ctrl+C で停止
```

### 1.3 Dockerローカルテスト

```bash
# Dockerfile をビルド
docker build -t csap:local .

# 実行
docker run -p 3000:3000 \
  -v $(pwd)/output:/app/output \
  -e CSAP_LLM_ENABLED=false \
  csap:local

# または docker-compose で
docker-compose -f docker-compose.yml up
```

### 1.4 ローカル検証チェックリスト

```bash
✓ npm run build でコンパイル成功
✓ http://localhost:3000 にアクセス可能
✓ テスト ZIP をアップロード
✓ HTML レポート生成確認
✓ コールグラフが表示される
✓ God Class スコア表示確認
```

---

## 🧪 Phase 2: ステージング環境

### 2.1 ステージングサーバーの準備

**前提条件:**
- Linux サーバー（Ubuntu 20.04 以上推奨）
- SSH アクセス可能
- 2GB 以上のメモリ
- 5GB 以上のディスク

### 2.2 サーバーのセットアップ

```bash
# SSH でログイン
ssh -i /path/to/key.pem ubuntu@staging-server.internal

# システム更新
sudo apt update && sudo apt upgrade -y

# Docker インストール
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose インストール
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# ユーザーを docker グループに追加
sudo usermod -aG docker $USER
newgrp docker

# 確認
docker --version
docker-compose --version
```

### 2.3 リポジトリデプロイ

```bash
# ディレクトリ作成
mkdir -p /opt/csap
cd /opt/csap

# リポジトリクローン
git clone https://github.com/yourorg/csap.git .

# ブランチ確認・確定
git checkout main  # または release ブランチ
git log --oneline | head -5
```

### 2.4 環境ファイル設定

```bash
# .env ファイルをステージング用に作成
cat > .env << 'EOF'
PORT=3000
NODE_ENV=production

# LLM 設定（ステージング環境用）
CSAP_LLM_ENABLED=true
CSAP_LLM_MODEL=gpt-4o
OPENAI_API_KEY=${OPENAI_API_KEY_STAGING}

# ログレベル
DEBUG=csap:*
EOF
```

### 2.5 SSL/TLS 証明書の取得（Let's Encrypt）

```bash
# Certbot インストール
sudo apt install certbot python3-certbot-nginx -y

# 証明書取得（ドメイン: staging.csap.internal）
sudo certbot certonly --standalone \
  -d staging.csap.internal \
  -m admin@yourorg.com \
  --agree-tos

# 自動更新設定
sudo systemctl enable certbot.timer
```

### 2.6 Nginx リバースプロキシ設定

```bash
# Nginx インストール
sudo apt install nginx -y

# 設定ファイル作成
sudo tee /etc/nginx/sites-available/csap > /dev/null << 'EOF'
upstream csap_backend {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name staging.csap.internal;

    ssl_certificate /etc/letsencrypt/live/staging.csap.internal/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.csap.internal/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://csap_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

# HTTP → HTTPS リダイレクト
server {
    listen 80;
    server_name staging.csap.internal;
    return 301 https://$server_name$request_uri;
}
EOF

# シンボリックリンク作成
sudo ln -s /etc/nginx/sites-available/csap /etc/nginx/sites-enabled/

# Nginx テスト & 起動
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2.7 Docker コンテナ起動

```bash
# イメージビルド
docker-compose build

# バックグラウンド起動
docker-compose up -d

# ステータス確認
docker-compose ps

# ログ確認（初回起動時）
docker-compose logs -f csap
```

### 2.8 ステージング検証

```bash
# ヘルスチェック
curl -s https://staging.csap.internal/api/health | jq .

# サンプル分析
cd /tmp
curl -F "file=@/path/to/test.zip" \
  https://staging.csap.internal/api/upload

# ログで結果確認
docker-compose logs csap | tail -20
```

---

## 🚀 Phase 3: 本番環境デプロイ

### 3.1 デプロイ前のチェックリスト

本番環境にリリースする前に必ず確認：

```bash
✓ ステージング環境で全テスト完了
✓ コード レビュー完了
✓ セキュリティ監査完了
✓ パフォーマンステスト完了（大規模 ZIP）
✓ ログ・監視の設定完了
✓ バックアップ戦略を確認
✓ ロールバック計画を確認
✓ インシデント対応計画を確認
```

### 3.2 本番環境のセットアップ

製品（staging）と同じサーバー構成をレプリカ：

```bash
# 同様にセットアップ
# ただし domain を production.csap.com に変更
```

### 3.3 Blue-Green デプロイメント（推奨）

ダウンタイムなしでリリース：

```bash
# 1. 新バージョン用ポート 3001 でコンテナを起動
docker-compose -p csap-v2 up -d

# 2. ヘルスチェック
curl -s http://localhost:3001/api/health

# 3. Nginx 設定を新ポートに向ける
sed -i 's/:3000/:3001/' /etc/nginx/sites-available/csap
nginx -t && systemctl reload nginx

# 4. トラフィック確認（1～5分様子見）
# 問題ない場合のみ旧コンテナを削除
docker-compose -p csap-v1 down
```

### 3.4 本番環境の設定

`.env` 本番専用設定：

```bash
PORT=3000
NODE_ENV=production

# セキュリティ
CSAP_LLM_ENABLED=true
OPENAI_API_KEY=${PROD_OPENAI_API_KEY}  # 環境変数から注入

# リソース制限
CSAP_MAX_FILE_SIZE=1073741824  # 1GB
CSAP_MAX_FILES_PER_REPO=50000

# ロギング・監視
DEBUG=  # デバッグ出力OFF
```

### 3.5 本番ログ・監視の設定

docker-compose.yml に追加：

```yaml
services:
  csap:
    logging:
      driver: "awslogs"  # または "splunk"
      options:
        awslogs-group: /csap/production
        awslogs-region: ap-northeast-1
        awslogs-stream-prefix: csap
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 3.6 バックアップ戦略

```bash
# 毎日 2:00 AM に自動バックアップ
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/csap/backup.sh") | crontab -

# backup.sh スクリプト
cat > /opt/csap/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backups/csap
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# output ディレクトリをバックアップ
tar -czf $BACKUP_DIR/csap_output_$TIMESTAMP.tar.gz /opt/csap/output/

# 30日以上前のバックアップを削除
find $BACKUP_DIR -name "csap_output_*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/csap_output_$TIMESTAMP.tar.gz"
EOF

chmod +x /opt/csap/backup.sh
```

---

## 📈 本番環境の監視

### リアルタイムログ監視

```bash
# ターミナル 1: ログをストリーム
docker-compose logs -f csap

# または のログレベル別に監視
docker-compose logs csap | grep ERROR
docker-compose logs csap | grep WARN
```

### メトリクス監視（Prometheus 例）

prometheus.yml 設定：

```yaml
scrape_configs:
  - job_name: 'csap'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### アラート設定（Datadog 例）

```bash
# Datadog エージェント インストール
DD_AGENT_MAJOR_VERSION=7 DD_API_KEY=${DD_API_KEY} \
  DD_SITE="datadoghq.com" bash -c \
  "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_agent.sh)"

# モニタチェック設定
# Datadog ダッシュボードで アラート設定
```

---

## 🔄 デプロイ後の確認

### 1. トラフィック・パフォーマンス確認

```bash
# うしろの 10分間トラフィック状況及を見守る
docker-compose logs -f csap | tail -50
```

### 2. エラー率確認

```bash
# エラーログ数をカウント
docker-compose logs csap | grep -c "ERROR"

# 許容: 時間1件未満
```

### 3. ディスク使用量確認

```bash
# output ディレクトリサイズ
du -sh /opt/csap/output/

# 期待値: <100GB（デフォルト設定）
```

### 4. メモリ使用率確認

```bash
docker stats csap  # リアルタイム表示
```

---

## 🚨 インシデント対応

### コンテナがクラッシュした場合

```bash
# 1. ステータス確認
docker-compose ps

# 2. ログで原因確認
docker-compose logs --tail 100 csap

# 3. 再起動試行
docker-compose restart csap

# 4. 改善なしの場合、旧バージョンにロールバック
docker-compose -p csap-old up -d
# Nginx を旧バージョンに向ける
```

### メモリ不足エラー

```bash
# リソース制限を増加
# docker-compose.yml の memory を 4G に増加

docker-compose up -d --build

# または本番サーバーを増強
```

### API キーが無効

```bash
# .env を更新
nano .env

# 新しい OPENAI_API_KEY を設定

# コンテナ再起動
docker-compose restart csap
```

### 大量のディスク使用

```bash
# output ディレクトリをクリーンアップ
# 1ヶ月以上前のレポートを削除

find /opt/csap/output -type f -mtime +30 -delete

# または外部ストレージ（S3 等）に移行
```

---

## 📝 定期メンテナンス

### 週 1 回のチェック

```bash
# 1. ディスク使用量確認
df -h /opt/csap

# 2. ログサイズ確認
du -sh /var/lib/docker/containers

# 3. セキュリティ更新確認
sudo apt list --upgradable

# 4. バックアップ確認
ls -lh /backups/csap/ | head -5
```

### 月 1 回のメンテナンス

```bash
# 1. ガベージコレクション
docker system prune -a --volumes

# 2. ログローテーション確認
logrotate -f /etc/logrotate.d/docker

# 3. ディスク最適化
sudo fstrim /

# 4. システムパッチ適用
sudo apt update && sudo apt upgrade -y
```

### 四半期 1 回の検証

```bash
# 1. ディザスタリカバリ訓練
# バックアップから復元テスト

# 2. 本番環境パフォーマンステスト
# 負荷テスト実施

# 3. セキュリティ監査
# 権限・ファイアウォール確認
```

---

## 🔐 セキュリティは Checklist

### ネットワークセキュリティ

```bash
✓ ファイアウォール設定（3000 ポートは localhost のみ）
✓ SSH ポート変更（22 → 2222 等）
✓ SSL/TLS 証明書導入（自己署名 ✗）
✓ CSP（Content Security Policy）ヘッダー設定
```

### アプリケーションセキュリティ

```bash
✓ 環境ファイルを .gitignore に追加
✓ API キーを環境変数から注入
✓ ログに機密情報（キー・パスワード）を出力しない
✓ 入力値の検証
```

### 定期スキャン

```bash
# 依存パッケージの脆弱性スキャン
npm audit

# コンテナイメージスキャン
trivy image csap:latest

# ネットワークポートスキャン
sudo nmap -p- localhost
```

---

## 📚 参考リソース

- Docker 本番環境ガイド: https://docs.docker.com/develop/dev-best-practices/
- Nginx 最適化ガイド: https://nginx.org/en/docs/
- 証明書管理: https://certbot.eff.org/
- デプロイメント自動化: https://docs.github.com/en/actions

---

**最終更新:** 2026年3月4日  
**バージョン:** v1.3 Production Ready

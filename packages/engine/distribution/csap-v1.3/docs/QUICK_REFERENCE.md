# ⚡ CSAP クイックリファレンス

よく使うコマンド・手順をすぐに参照できるチートシート形式ガイドです。

---

## 🚀 1分で起動

```bash
# 初回セットアップ
cp .env.example .env  # オプション
docker-compose up -d

# 確認
open http://localhost:3000
```

---

## 📋 コマンド一覧

### 基本操作

| コマンド | 説明 |
|---------|------|
| `docker-compose up -d` | バックグラウンド起動 |
| `docker-compose down` | 停止・削除 |
| `docker-compose restart csap` | 再起動 |
| `docker-compose logs -f csap` | ライブログ表示 |
| `docker-compose ps` | コンテナ状態確認 |

### イメージ・ビルド

| コマンド | 説明 |
|---------|------|
| `docker-compose build` | イメージビルド |
| `docker-compose build --no-cache` | キャッシュクリアしてビルド |
| `docker images csap` | イメージ一覧 |
| `docker rmi csap:test` | イメージ削除 |

### デバッグ

| コマンド | 説明 |
|---------|------|
| `docker-compose exec csap sh` | シェル起動 |
| `docker-compose exec csap ls -la output/` | ファイル確認 |
| `docker-compose logs csap --tail 50` | 最後50行 |
| `docker stats` | リアルタイムメトリクス |

---

## 🔧 トラブル対応

### Q: ポート 3000 が使用中

```bash
# 別ポートで起動
docker run -p 3001:3000 csap:latest

# または
docker-compose down  # 既存を停止
```

### Q: メモリ不足

```bash
# docker-compose.yml 編集
# memory: 4G に増加

docker-compose up -d --build
```

### Q: コンテナがクラッシュ

```bash
# ログで原因確認
docker-compose logs csap

# 再ビルド
docker-compose build --no-cache
docker-compose up -d
```

### Q: ファイルが見つからない

```bash
# ボリュームマウント確認
docker-compose exec csap ls -la /app/output/

# ホスト側確認
ls -la ./output/
```

### Q: .env ファイルが反映されない

```bash
# コンテナ再起動が必要
docker-compose down
docker-compose up -d

# 環境変数確認
docker-compose exec csap env | grep CSAP
```

---

## 🔑 環境変数クイック設定

### LLM 機能を有効化

```bash
cat .env | grep CSAP_LLM
# CSAP_LLM_ENABLED=false を true に変更

nano .env
# CSAP_LLM_ENABLED=true
# OPENAI_API_KEY=sk-proj-xxx...

docker-compose restart csap
```

### ポート番号変更

```bash
# docker-compose.yml で
# ports:
#   - "3001:3000"

docker-compose up -d
# localhost:3001 でアクセス
```

### max_file_size を増加（1GB に）

```bash
echo 'CSAP_MAX_FILE_SIZE=1073741824' >> .env
docker-compose restart csap
```

---

## 📊 データ確認

### レポート一覧

```bash
ls -lah ./output/

# または
docker-compose exec csap ls -lah /app/output/
```

### ファイルサイズ確認

```bash
du -sh ./output/

# 個別確認
du -sh ./output/* | sort -h
```

### ディレクトリ構造

```
./uploads/      # アップロード ZIP
./temp/         # 展開作業中ファイル
./output/       # 生成 HTML レポート + LLM結果
```

---

## 🔄 アップグレード

### 新バージョンへ更新

```bash
# コード更新
git pull origin main

# イメージ再ビルド
docker-compose build

# 再起動
docker-compose down
docker-compose up -d

# ログで確認
docker-compose logs -f csap
```

### ロールバック（旧バージョンに戻す）

```bash
# 旧コミットに切り戻す
git checkout <commit_hash>

# イメージ再ビルド
docker-compose build

# 再起動
docker-compose down
docker-compose up -d
```

---

## 📈 パフォーマンス最適化

### メモリ制限を変更

docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
```

### CPU 制限を変更

docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      cpus: '4'
```

### ログローテーション設定

docker-compose.yml:
```yaml
logging:
  options:
    max-size: "100m"
    max-file: "10"
```

---

## 🌐 外部アクセス設定

### リバースプロキシ（Nginx）

/etc/nginx/sites-available/csap:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

起動:
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

### SSL/TLS (Let's Encrypt)

```bash
sudo certbot certonly --standalone -d your-domain.com
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🧪 テスト分析

### サンプル ZIP をテスト

```bash
# プロジェクトと同じディレクトリ構造の ZIP を準備
zip -r test.zip src package.json

# アップロード
curl -F "file=@test.zip" http://localhost:3000/api/upload

# レスポンス例:
# {"analysisId": "uuid-xxx", "status": "success"}

# レポート確認
open http://localhost:3000/reports/uuid-xxx
```

### CLI テスト（Docker 内）

```bash
docker-compose exec csap ts-node scripts/test-run.ts /app/src
```

---

## 💾 バックアップ・復元

### バックアップ作成

```bash
# output ディレクトリを圧縮
tar -czf csap_backup_$(date +%Y%m%d).tar.gz ./output/

# S3 にアップロード（AWS CLI 利用）
aws s3 cp csap_backup_*.tar.gz s3://my-bucket/csap-backups/
```

### 復元

```bash
# バージョンからダウンロード
aws s3 cp s3://my-bucket/csap-backups/csap_backup_20260304.tar.gz .

# 展開
tar -xzf csap_backup_20260304.tar.gz

# Docker へコピー
docker-compose exec csap cp -r output/* /app/output/
```

---

## 📞 オンコール対応

### サービスが落ちた時

```bash
# 1. ステータス確認（30秒以内）
docker-compose ps

# 2. 自動再起動
docker-compose restart csap

# 3. ログで原因確認（1分以内）
docker-compose logs --tail 100 csap | grep ERROR

# 4. やり方に応じた対応
#  - メモリ不足 → リソース増加
#  - ポート競合 → ポート変更
#  - API キー無効 → .env 更新
```

### パフォーマンス悪化時

```bash
# 1. リソース確認
docker stats csap

# 2. ディスク確認
df -h /

# 3. output ディレクトリ確認
du -sh ./output/  # >100GB なら古いファイル削除

find ./output -type f -mtime +60 -delete  # 60日以上前削除
```

### LLM 分析が遅い時

```bash
# OpenAI API の状態確認
# https://status.openai.com/

# または Timeout を増加
# docker-compose.yml の timeout を 60s に
```

---

## 📱 よくある質問（FAQ）

| Q | A |
|---|---|
| **Docker 必須？** | いいえ。`npm run dev` でも実行可能 |
| **オフライン対応？** | はい。LLM 機能以外全て対応 |
| **複数ユーザー同時利用？** | はい。ただしファイル名競合に注意 |
| **Windows 対応？** | はい。Docker Desktop で動作 |
| **Mac M1 対応？** | はい。`docker build` で自動対応 |
| **データ永続化？** | はい。volume マウント対応 |

---

## 🔗 関連ドキュメント

- [DOCKER_SETUP.md](DOCKER_SETUP.md) - 詳細セットアップガイド
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 本番デプロイメント
- [README.md](README.md) - 基本機能説明

---

## 💡 Tips

### よく使う複合コマンド

```bash
# ビルド & 起動 & ログ表示（一行）
docker-compose down && docker-compose build && docker-compose up -d && docker-compose logs -f csap

# すべてクリーン & 再起動
docker-compose down -v && docker system prune -f && docker-compose up -d
```

### 定期メンテナンス自動化

```bash
# crontab -e で追加
0 2 * * * cd /opt/csap && docker-compose exec csap find output -mtime +60 -delete
0 3 * * 0 cd /opt/csap && tar -czf /backup/csap_$(date +\%Y\%m\%d).tar.gz output/
```

### ホットリロード（開発時）

```bash
# Dockerfile を修正後
docker-compose build
docker-compose up -d

# または docker-compose.yml で
# volumes:
#   - ./src:/app/src  # 開発時のみ

docker-compose watch  # Docker Desktop 4.25+ で自動再構築
```

---

**最終更新:** 2026年3月4日  
**すぐに参照できます！** 🎯

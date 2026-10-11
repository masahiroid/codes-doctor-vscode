# 📦 CSAP Distribution - パッケージング & 配布ガイド

このディレクトリは **配布用パッケージ** を生成・管理するための領域です。

---

## 📋 ディレクトリ構造

```
/Projects/CSAP/
├── src/                    ← 開発用（ソースコード）
├── dist/                   ← ビルド出力
├── node_modules/           ← 開発用依存関係
├── Dockerfile              ← 開発用（ビルドあり）
├── docker-compose.yml      ← 開発用
├── package.json            ← 開発用（devDependencies含む）
│
└── distribution/           ← 配布用パッケージ生成ディレクトリ
    ├── csap-v1.3/         ← 配布パッケージ内容（本番用）
    │   ├── dist/          ← ビルド済みコード
    │   ├── docs/          ← ドキュメント
    │   ├── volumes/       ← データディレクトリ
    │   ├── Dockerfile_production   ← 本番用
    │   ├── docker-compose-prod.yml ← 本番用
    │   ├── package.json   ← 本番用（依存なし）
    │   ├── install.sh     ← インストーラ
    │   ├── README_DISTRIBUTION.md
    │   ├── VERSION.txt
    │   └── PACKAGE_CONTENTS.txt
    │
    ├── create_packages.sh ← パッケージ化スクリプト
    └── README.md          ← このファイル
```

---

## 🚀 配布パッケージの生成手順

### Step 1: 開発環境でビルド

```bash
cd /Projects/CSAP

# 最新のコードをビルド
npm run build

# 動作確認
npm run dev
# → ブラウザで http://localhost:3000 を確認
# → テストZIPをアップロードして動作確認
```

### Step 2: 配布パッケージに反映

```bash
# ビルド済みコードをコピー
cp -r dist distribution/csap-v1.3/

# ドキュメント最新化
cp docs/DOCKER_SETUP.md docs/DEPLOYMENT_GUIDE.md docs/QUICK_REFERENCE.md \
  docs/SYSTEM_DESIGN.md docs/SYSTEM_SPEC.md docs/README.md \
  distribution/csap-v1.3/docs/

# 設定ファイル更新が必要な場合
cp .env.example distribution/csap-v1.3/
cp docker-compose.yml .dockerignore distribution/csap-v1.3/
```

### Step 3: パッケージをテスト

```bash
# 配布用フォルダで動作確認
cd distribution/csap-v1.3

# 環境設定
cp .env.example .env

# インストール実行
bash install.sh

# 起動
docker-compose -f docker-compose-prod.yml up -d

# アクセス確認
curl http://localhost:3000/api/health

# テスト完了後、停止
docker-compose -f docker-compose-prod.yml down
```

### Step 4: パッケージ化

```bash
cd distribution

# TAR.GZ と ZIP を生成
bash create_packages.sh

# 出力例:
# csap-v1.3.0-20260304.tar.gz  (22.5 MB)
# csap-v1.3.0-20260304.zip     (23.1 MB)
```

### Step 5: 配布

```bash
# AWS S3 へアップロード
aws s3 cp csap-v*.tar.gz s3://my-releases/
aws s3 cp csap-v*.zip s3://my-releases/

# または GitHub Releases へ
gh release create v1.3.0 \
  csap-v1.3.0-*.tar.gz \
  csap-v1.3.0-*.zip
```

---

## 📦 パッケージ内容

### csap-v1.3/ フォルダ

| ファイル | 説明 | サイズ |
|---------|------|------|
| **dist/** | ビルド済みJavaScript | ~80-100MB |
| **docs/** | ドキュメント | ~0.5MB |
| **volumes/** | データ用ディレクトリ（初期状態は空） | - |
| **Dockerfile_production** | 本番用イメージ定義 | ~1KB |
| **docker-compose-prod.yml** | 本番用オーケストレーション | ~2KB |
| **.env.example** | 環境変数テンプレート | ~0.5KB |
| **package.json** | 本番用（依存なし） | ~0.3KB |
| **README_DISTRIBUTION.md** | このパッケージの説明 | ~5KB |
| **VERSION.txt** | バージョン情報 | ~1KB |
| **install.sh** | インストーラスクリプト | ~1KB |

**合計:** ~80-110 MB（圧縮時 ~20-30 MB）

---

## ✅ リリースチェックリスト

配布する前に必ず確認：

```bash
[ ] npm run build で最新ビルド完了
[ ] npm run dev でローカル動作確認済み
[ ] テストZIP（複数言語）で分析動作確認
[ ] コールグラフ表示確認
[ ] LLM分析動作確認（OPENAI_API_KEY設定時）
[ ] distribution/csap-v1.3/ にコードをコピー
[ ] install.sh でインストール成功
[ ] docker-compose-prod.yml で起動成功
[ ] localhost:3000 アクセス確認
[ ] API ハルスチェック確認 (curl http://localhost:3000/api/health)
[ ] テストZIPをアップロード・分析成功
[ ] HTML レポート生成確認
[ ] ドキュメント全ファイルチェック
[ ] VERSION.txt 更新
[ ] パッケージファイル生成
[ ] SHA256 チェックサム作成
[ ] リリースノート作成
```

---

## 🔄 バージョン管理

### バージョン番号スキーム

```
v{MAJOR}.{MINOR}.{PATCH}

例: v1.3.0
    ↑        ↑  ↑
    Major    Minor Patch
    (大機能) (新機能) (バグ修正)
```

### VERSION.txt を更新

```bash
# distribution/csap-v1.3/VERSION.txt
CSAP Distribution Package
=====================================

Product Name:    Code Structural Audit Platform (CSAP)
Package Version: 1.3.0           ← これを更新
Release Date:    2026-03-04
...
```

### パッケージファイル名

```bash
csap-v{VERSION}-{DATE}.tar.gz
csap-v{VERSION}-{DATE}.zip

例:
csap-v1.3.0-20260304.tar.gz
csap-v1.3.0-20260304.zip
```

---

## 📝 リリースノート例

```markdown
# CSAP v1.3.0 Release Notes

**Release Date:** March 4, 2026

## ✨ New Features
- Docker & docker-compose support
- LLM-powered structural analysis
- TypeScript call graph analysis
- Enhanced PHP call graph detection

## 🐛 Bug Fixes
- Fixed PHP scope detection in complex scenarios
- Improved circular dependency detection accuracy
- Better memory management for large repositories
- Fixed file size limit enforcement

## 📊 Improvements
- Performance optimizations (20-30% faster)
- Better error messages
- Enhanced logging for debugging
- Improved security (validates API keys)

## 📚 Documentation
- Complete Docker setup guide
- Production deployment guide
- Command reference cheatsheet
- Troubleshooting section

## 🔧 Requirements
- Docker 18.09+
- Docker Compose 1.25+
- 2GB RAM minimum

## 📥 Installation

### Quick Start
```bash
tar -xzf csap-v1.3.0-20260304.tar.gz
cd csap-v1.3
bash install.sh
docker-compose -f docker-compose-prod.yml up -d
```

See `README_DISTRIBUTION.md` for details.

## ⚠️ Breaking Changes
None

## 🙏 Credits
Development team, contributors, and testers
```

---

## 🚀 配布チャネル

### GitHub Releases

```bash
# 新しいリリースを作成
gh release create v1.3.0 \
  --title "CSAP v1.3.0" \
  --notes "See docs/CHANGELOG.md" \
  csap-v1.3.0-20260304.tar.gz \
  csap-v1.3.0-20260304.zip
```

### AWS S3

```bash
aws s3 cp csap-v1.3.0-*.tar.gz s3://releases.mycompany.com/csap/
aws s3 cp csap-v1.3.0-*.zip s3://releases.mycompany.com/csap/
```

### Docker Hub

```bash
# イメージをビルド & プッシュ
docker build -t mycompany/csap:1.3.0 -f distribution/csap-v1.3/Dockerfile_production distribution/csap-v1.3/
docker push mycompany/csap:1.3.0

# または GitHub Container Registry
docker tag mycompany/csap:1.3.0 ghcr.io/myorg/csap:1.3.0
docker push ghcr.io/myorg/csap:1.3.0
```

### 社内・プライベート配布

```bash
# ZIP ファイルをメール・社内ドライブで配布
# または git リポジトリに push
git tag v1.3.0
git push origin v1.3.0
```

---

## 🔐 セキュリティ

### チェックサム検証

配布先でユーザーが検証できるよう、チェックサムを提供：

```bash
# 生成
sha256sum csap-v1.3.0-*.tar.gz > csap-v1.3.0.sha256
sha256sum csap-v1.3.0-*.zip >> csap-v1.3.0.sha256

# ユーザー側で検証
sha256sum -c csap-v1.3.0.sha256

# 結果:
# csap-v1.3.0-20260304.tar.gz: OK
# csap-v1.3.0-20260304.zip: OK
```

### 署名（オプション）

エンタープライズ向け：

```bash
gpg --armor --sign csap-v1.3.0-20260304.tar.gz
```

---

## 📊 配布実績

```
v1.0.0 - Feb 26, 2026  - Initial PoC release
v1.1.0 - Feb 27, 2026  - God Class detection
v1.2.0 - Feb 28, 2026  - Module metrics & layer analysis
v1.3.0 - Mar 04, 2026  - Docker & LLM support ← Current

Downloads (cumulative):
- TAR.GZ: ~100+
- ZIP: ~50+
```

---

## 📞 Customer Support

配布後、以下をサポート：

### Installation Support
- Docker インストール手順
- ポート設定
- ファイアウォール設定

### Usage Support
- コマンドリファレンス
- トラブルシューティング
- FAQ

### Updates
- セキュリティパッチ配布
- 新バージョンアナウンス

---

## 🔒 Maintenance

### 月次チェック

```bash
# パッケージが正常に解凍・起動できるか確認
tar -tzf csap-v1.3.0-20260304.tar.gz | head -20
cd temp_test
bash csap-v1.3/install.sh
docker-compose -f csap-v1.3/docker-compose-prod.yml up -d
curl http://localhost:3000/api/health
docker-compose -f csap-v1.3/docker-compose-prod.yml down
```

### セキュリティ監査

```bash
# npm audit で依存関係の脆弱性チェック
npm audit

# イメージスキャン（本番イメージ）
trivy image csap:1.3.0
```

---

**最終更新:** 2026年3月4日  
**パッケージバージョン:** v1.3.0

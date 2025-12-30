# 本番環境デプロイガイド - SmartMeasure

## 概要

SmartMeasureアプリを本番環境で運用するための完全ガイドです。

**構成:**
- **Webアプリ**: Cloudflare Pages（公開URL）
- **背景削除API**: 自宅サーバー/VPS（Python + rembg）

---

## 🌐 構成図

```
┌─────────────────────────────────┐
│  ユーザー（ブラウザ）            │
└────────────┬────────────────────┘
             │ HTTPS
             ↓
┌─────────────────────────────────┐
│  Cloudflare Pages               │
│  https://smart-measure.pages.dev│
│  - Hono Backend                 │
│  - D1 Database                  │
│  - 画像管理                      │
└────────────┬────────────────────┘
             │ HTTP API (背景削除リクエスト)
             ↓
┌─────────────────────────────────┐
│  自宅サーバー/VPS                │
│  http://your-server:8000        │
│  - rembg API (Python FastAPI)   │
│  - 背景削除処理                  │
└─────────────────────────────────┘
```

---

## パート1: Cloudflare Pages へのデプロイ

### 前提条件
- Cloudflareアカウント（無料プランでOK）
- APIトークン（適切な権限設定）

### ステップ1: APIトークンの権限確認

Cloudflareダッシュボードで以下の権限が必要です：

**必須権限:**
- `Account - Cloudflare Pages:Edit`
- `Zone - DNS:Edit`（カスタムドメイン使用時）
- `User - User Details:Read`（推奨）

**設定方法:**
1. https://dash.cloudflare.com/profile/api-tokens
2. 既存トークンを編集、または新規作成
3. 上記権限を追加
4. トークンを保存

### ステップ2: プロジェクト作成

```bash
cd /home/user/webapp/smart-measure

# プロジェクト作成
npx wrangler pages project create smart-measure \
  --production-branch main

# ビルド
npm run build

# デプロイ
npx wrangler pages deploy dist --project-name smart-measure
```

### ステップ3: D1データベースの設定

```bash
# D1データベース作成（まだの場合）
npx wrangler d1 create smart-measure-db

# database_id を wrangler.jsonc に設定
# （出力されたIDをコピー）

# マイグレーション実行
npx wrangler d1 migrations apply smart-measure-db
```

### ステップ4: 環境変数の設定

背景削除APIのURLを設定：

```bash
# Cloudflare Pages の設定画面で環境変数を追加
# または wrangler経由で設定

npx wrangler pages secret put BG_REMOVAL_API_URL \
  --project-name smart-measure

# プロンプトで以下を入力:
# http://your-server-ip:8000
```

### ステップ5: バックエンドコードの更新

`src/index.tsx` の背景削除API URLを環境変数から取得するように修正：

```typescript
// Before
const BG_REMOVAL_API = 'http://localhost:8000';

// After
const BG_REMOVAL_API = c.env.BG_REMOVAL_API_URL || 'http://localhost:8000';
```

---

## パート2: 別サーバーでrembg APIを稼働

### オプション2-A: 自宅サーバー（Windows/Mac/Linux）

#### 前提条件
- Python 3.8以上
- インターネット接続
- ポート8000を開放可能

#### ステップ1: Python環境構築

**Windows:**
```powershell
# Python 3.10+ をインストール
# https://www.python.org/downloads/

# 依存関係インストール
pip install rembg fastapi uvicorn[standard] httpx python-multipart
```

**Mac/Linux:**
```bash
# Pythonバージョン確認
python3 --version

# 依存関係インストール
pip3 install rembg fastapi uvicorn[standard] httpx python-multipart
```

#### ステップ2: サーバーファイルの配置

このリポジトリから以下のファイルをコピー：
```
bg-removal-server-v2.py  # 推奨（遅延ロード版）
```

または、ダウンロード：
```bash
# 自宅サーバーで実行
curl -O https://raw.githubusercontent.com/YOUR_REPO/smart-measure/main/bg-removal-server-v2.py
```

#### ステップ3: サーバー起動

**テスト起動:**
```bash
python3 bg-removal-server-v2.py
```

ブラウザで確認: http://localhost:8000/health

**バックグラウンド起動（Linux/Mac）:**
```bash
# PM2を使う場合（推奨）
npm install -g pm2
pm2 start bg-removal-server-v2.py --name bg-removal --interpreter python3

# または nohup
nohup python3 bg-removal-server-v2.py > bg-removal.log 2>&1 &
```

**Windows サービス化:**
```powershell
# NSSM（Non-Sucking Service Manager）を使用
# https://nssm.cc/download

nssm install BGRemovalAPI python.exe
# Path: C:\Python310\python.exe
# Startup directory: C:\path\to\smart-measure
# Arguments: bg-removal-server-v2.py
```

#### ステップ4: ポート開放（ルーター設定）

**必要な設定:**
1. ルーター管理画面にアクセス
2. ポートフォワーディング設定
   - 外部ポート: 8000
   - 内部ポート: 8000
   - 内部IP: サーバーのローカルIP
3. ファイアウォール設定でポート8000を許可

**グローバルIPの確認:**
```bash
curl ifconfig.me
```

このIPをCloudflare Pagesの環境変数に設定します。

---

### オプション2-B: VPS（推奨）

#### おすすめVPSサービス
- **AWS EC2 t3.micro** - 無料枠あり（1年間）
- **Google Cloud Compute Engine** - $300クレジット
- **DigitalOcean** - $6/月〜
- **Vultr** - $6/月〜
- **ConoHa VPS** - ¥678/月〜（日本）

#### セットアップ手順（Ubuntu 22.04）

```bash
# サーバーにSSH接続
ssh user@your-vps-ip

# システム更新
sudo apt update && sudo apt upgrade -y

# Python環境構築
sudo apt install -y python3 python3-pip

# 依存関係インストール
pip3 install rembg fastapi uvicorn[standard] httpx python-multipart

# ファイルアップロード（ローカルから）
scp bg-removal-server-v2.py user@your-vps-ip:~/

# サーバー起動（PM2推奨）
npm install -g pm2
pm2 start bg-removal-server-v2.py --name bg-removal --interpreter python3
pm2 startup
pm2 save

# ファイアウォール設定
sudo ufw allow 8000/tcp
sudo ufw enable

# 確認
curl http://localhost:8000/health
```

#### Nginx リバースプロキシ設定（HTTPS化）

```bash
# Nginxインストール
sudo apt install -y nginx certbot python3-certbot-nginx

# 設定ファイル作成
sudo nano /etc/nginx/sites-available/bg-removal

# 以下を記述:
server {
    listen 80;
    server_name bg-api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# 有効化
sudo ln -s /etc/nginx/sites-available/bg-removal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL証明書取得（Let's Encrypt）
sudo certbot --nginx -d bg-api.yourdomain.com
```

---

## パート3: 統合テスト

### ステップ1: ローカルテスト

```bash
# 背景削除APIが稼働しているか確認
curl http://your-server:8000/health

# 画像処理テスト
curl -X POST "http://your-server:8000/api/remove-bg-from-url?image_url=https://example.com/test.jpg" \
  --output test-result.png
```

### ステップ2: Cloudflare Pages から接続テスト

Cloudflare Pages ダッシュボードで：
1. Functions → 環境変数
2. `BG_REMOVAL_API_URL` = `http://your-server:8000`（または `https://bg-api.yourdomain.com`）
3. 再デプロイ

### ステップ3: 本番テスト

1. https://smart-measure.pages.dev/dashboard にアクセス
2. 画像をアップロード
3. 「白抜き」ボタンをクリック
4. 処理完了を確認

---

## 🔒 セキュリティ推奨事項

### 1. API認証の追加

背景削除APIに認証を追加：

```python
# bg-removal-server-v2.py に追加
from fastapi import Header, HTTPException

API_KEY = "your-secret-key-here"

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return x_api_key

@app.post("/api/remove-bg", dependencies=[Depends(verify_api_key)])
async def remove_background(file: UploadFile = File(...)):
    # ...
```

Hono側：
```typescript
const response = await fetch(`${BG_REMOVAL_API}/api/remove-bg-from-url`, {
  method: 'POST',
  headers: {
    'X-API-Key': c.env.BG_REMOVAL_API_KEY
  },
  // ...
})
```

### 2. HTTPS化（必須）

- Let's Encrypt で無料SSL証明書
- Cloudflareを経由させる（自動HTTPS）

### 3. レート制限

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/remove-bg")
@limiter.limit("10/minute")
async def remove_background(...):
    # ...
```

---

## 📊 監視とメンテナンス

### ログ確認

**PM2:**
```bash
pm2 logs bg-removal
pm2 monit
```

**Systemd:**
```bash
sudo journalctl -u bg-removal -f
```

### パフォーマンス監視

```bash
# CPU/メモリ使用率
htop

# ネットワーク
sudo nethogs

# ディスク
df -h
```

### 自動再起動設定

```bash
# PM2で自動再起動
pm2 startup
pm2 save

# Systemdで自動起動
sudo systemctl enable bg-removal
```

---

## 🚨 トラブルシューティング

### 問題1: APIに接続できない

**確認事項:**
1. サーバーが起動しているか: `curl http://localhost:8000/health`
2. ファイアウォール設定
3. ポート開放設定
4. CloudflareのIPアドレス制限

### 問題2: 処理が遅い

**対策:**
1. サーバースペックアップ（CPU/メモリ）
2. GPU版rembgを使用
3. 画像サイズを制限
4. CDN経由でキャッシュ

### 問題3: メモリ不足

```bash
# スワップ領域を追加
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## 💰 コスト試算

### パターンA: 自宅サーバー
- 初期費用: $0（既存PC利用）
- 月額: 電気代 $5〜15
- **総コスト: $5〜15/月**

### パターンB: VPS（DigitalOcean $6プラン）
- 初期費用: $0
- 月額: $6
- 処理無制限
- **総コスト: $6/月**

### パターンC: VPS（$12プラン）+ Nginx
- 初期費用: $0
- 月額: $12
- HTTPS化込み
- **総コスト: $12/月**

### 比較: remove.bg API
- 月500枚: $9
- 月2,000枚: $29
- **従量課金: $0.20/枚**

→ **月100枚以上処理するなら自前サーバーが圧倒的に安い**

---

## 📝 チェックリスト

### デプロイ前
- [ ] Cloudflare APIトークン権限確認
- [ ] wrangler.jsonc の database_id 設定
- [ ] D1マイグレーション実行
- [ ] 環境変数 `BG_REMOVAL_API_URL` 設定

### 別サーバー準備
- [ ] Python 3.8+ インストール
- [ ] rembg等の依存関係インストール
- [ ] bg-removal-server-v2.py 配置
- [ ] サーバー起動確認
- [ ] ポート8000開放
- [ ] グローバルIP取得

### 統合テスト
- [ ] APIヘルスチェック成功
- [ ] 画像処理テスト成功
- [ ] Cloudflare Pages から接続成功
- [ ] 本番環境で動作確認

### セキュリティ
- [ ] API認証追加
- [ ] HTTPS化
- [ ] レート制限設定
- [ ] ファイアウォール設定

---

## 📞 サポート

問題が発生した場合：
1. ログを確認
2. このドキュメントのトラブルシューティングを参照
3. GitHub Issuesで質問

---

**これで本番環境での運用準備が完了です！** 🎉

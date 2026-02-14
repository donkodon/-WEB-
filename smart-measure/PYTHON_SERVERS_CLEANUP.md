# Python Background Removal Servers - CORS Security Fix

## 問題点

1. **CORS設定が不安全**: `allow_origins=["*"]` で全てのドメインを許可
2. **本番対応未完了**: コメントに「In production, specify exact origins」と書いてあるが未対応
3. **重複サーバー**: `bg-removal-server.py` (v1) が不要（v2が存在）

## 解決策

### 1. セキュアなCORS設定

**Before:**
```python
allow_origins=["*"]  # すべてのドメインを許可（セキュリティリスク）
```

**After:**
```python
# 環境変数で制御可能
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://smart-measure.pages.dev,"
    "https://smart-measure-production.pages.dev,"
    "http://localhost:3000,"
    "http://127.0.0.1:3000"
).split(",")

allow_origins=ALLOWED_ORIGINS  # 特定ドメインのみ許可
```

### 2. サーバー構成の整理

**削除したファイル:**
- ❌ `bg-removal-server.py` - 旧バージョン（v2が存在）

**保持したファイル:**
- ✅ `bg-removal-server-v2.py` - rembg APIサーバー（ローカルフォールバック用）
- ✅ `withoutbg-server.py` - withoutBG APIサーバー（Hugging Face Spaceにデプロイ）

### 3. デプロイメント構成

```
Background Removal Architecture
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1 (PRIMARY):
  ├─ Cloudflare AI Workers (@cf/bria/rmbg-2.0)
  └─ 無料、高速、スケーラブル、メンテナンス不要

Layer 2 (FALLBACK):
  ├─ withoutBG Server (Hugging Face Space)
  │  └─ https://jinkedon-withoutbg-api.hf.space
  │  └─ 高品質、マスク生成対応
  │
  └─ rembg Server v2 (ローカル)
     └─ http://localhost:8000
     └─ オフライン用、カスタムモデル対応
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 修正内容

### bg-removal-server-v2.py

**CORS設定:**
```python
# ✅ SECURE CORS Configuration
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://smart-measure.pages.dev,"
    "https://smart-measure-production.pages.dev,"
    "http://localhost:3000,"
    "http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Specific domains only
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # Only required methods
    allow_headers=["Content-Type", "Authorization"],  # Only required headers
)
```

**新機能:**
- 環境変数でCORS制御可能
- ポート番号を環境変数で設定可能 (`PORT`)
- ログにCORS設定を表示
- Cloudflare AI Workersがプライマリであることを明記

### withoutbg-server.py

**CORS設定:**
```python
# ✅ SECURE CORS Configuration
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://smart-measure.pages.dev,"
    "https://smart-measure-production.pages.dev,"
    "http://localhost:3000,"
    "http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Specific domains only
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # Only required methods
    allow_headers=["Content-Type", "Authorization"],  # Only required headers
)
```

**改善点:**
- マスク生成機能を追加 (`return_mask` パラメータ)
- Hugging Face Spaceデプロイ用に最適化
- JSONレスポンス形式に統一 (`{ success, image_data, mask_data }`)
- エラーハンドリング改善

## 環境変数設定

### .env.example 作成

```bash
# Background Removal Server Configuration

# Port (default: 8000 for rembg, 8001 for withoutbg)
PORT=8000

# CORS Allowed Origins (comma-separated)
# ✅ PRODUCTION: Specify exact domains (no wildcard)
# ❌ NEVER use "*" in production
ALLOWED_ORIGINS=https://smart-measure.pages.dev,http://localhost:3000

# Development (allow all):
# ALLOWED_ORIGINS=*
```

### 使用方法

**本番環境（特定ドメインのみ）:**
```bash
ALLOWED_ORIGINS=https://smart-measure.pages.dev,https://yourdomain.com python3 bg-removal-server-v2.py
```

**開発環境（全て許可）:**
```bash
ALLOWED_ORIGINS=* python3 bg-removal-server-v2.py
```

**Hugging Face Space（環境変数設定）:**
```bash
# Hugging Face Space Settings
ALLOWED_ORIGINS=https://smart-measure.pages.dev,https://smart-measure-production.pages.dev
PORT=8001
```

## セキュリティ改善

| 項目 | Before | After | 改善 |
|------|--------|-------|------|
| CORS Origins | `*` (全許可) | 特定ドメインのみ | ✅ |
| 環境変数制御 | ❌ | ✅ | ✅ |
| メソッド制限 | `*` (全許可) | GET, POST, OPTIONS | ✅ |
| ヘッダー制限 | `*` (全許可) | Content-Type, Authorization | ✅ |
| CORS設定表示 | ❌ | ✅ (ログ出力) | ✅ |

## ファイル統計

| ファイル | Before | After | 変更 |
|---------|--------|-------|------|
| bg-removal-server.py | 3.9 KB | 削除 | ❌ (v2が存在) |
| bg-removal-server-v2.py | 11 KB | 8.9 KB | ✅ (CORS修正) |
| withoutbg-server.py | 9.2 KB | 14 KB | ✅ (CORS修正 + マスク機能追加) |

## 本番デプロイ手順

### 1. rembg Server (ローカルフォールバック)

```bash
# .env ファイルを作成
cp .env.example .env

# ALLOWED_ORIGINS を本番ドメインに設定
echo "ALLOWED_ORIGINS=https://smart-measure.pages.dev" > .env

# サーバー起動
python3 bg-removal-server-v2.py
```

### 2. withoutBG Server (Hugging Face Space)

1. Hugging Face Spaceの環境変数設定:
   ```
   ALLOWED_ORIGINS=https://smart-measure.pages.dev,https://smart-measure-production.pages.dev
   PORT=8001
   ```

2. `withoutbg-server.py` をHugging Face Spaceにデプロイ

3. Hono backendで使用:
   ```typescript
   const response = await fetch('https://jinkedon-withoutbg-api.hf.space/api/remove-bg', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ image_url, return_mask: true })
   });
   ```

## テスト

### CORS動作確認

**許可されたドメインから:**
```bash
curl -X OPTIONS http://localhost:8000/api/remove-bg \
  -H "Origin: https://smart-measure.pages.dev" \
  -H "Access-Control-Request-Method: POST"

# Response: Access-Control-Allow-Origin: https://smart-measure.pages.dev
```

**拒否されるドメインから:**
```bash
curl -X OPTIONS http://localhost:8000/api/remove-bg \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST"

# Response: No Access-Control-Allow-Origin header
```

## まとめ

### ✅ 完了事項
1. CORS設定を本番対応 (wildcard `*` → 特定ドメイン)
2. 環境変数でCORS制御可能に
3. 旧バージョン削除 (`bg-removal-server.py`)
4. マスク生成機能追加 (`withoutbg-server.py`)
5. セキュリティ強化 (メソッド・ヘッダー制限)
6. ドキュメント整備 (README_PYTHON_SERVER.md, .env.example)

### 📊 セキュリティ向上
- **CSRFリスク軽減**: 特定ドメインのみ許可
- **情報漏洩防止**: 不要なヘッダー・メソッドを制限
- **監査可能性向上**: CORS設定をログ出力
- **設定の柔軟性**: 環境変数で簡単に変更可能

### 🚀 次のステップ
1. Hugging Face Spaceに `withoutbg-server.py` をデプロイ
2. 環境変数 `ALLOWED_ORIGINS` を本番ドメインに設定
3. Cloudflare Pagesからの接続をテスト
4. ログを監視してCORS設定が正しく動作することを確認

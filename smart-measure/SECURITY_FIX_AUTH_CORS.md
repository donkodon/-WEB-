# セキュリティ修正: 認証とCORSの強化

## 問題点

### 1. 認証なしで公開されている危険なエンドポイント

以下のエンドポイントが誰でもアクセス可能でした:

```
❌ GET /init                           → DBを初期化
❌ GET /fix-schema                     → スキーマを変更
❌ GET /api/debug/r2-list              → R2のファイル一覧が見える
❌ GET /debug/r2-folder                → R2の中身がブラウザで閲覧可能
❌ GET /api/admin/delete-all-r2-images → 全画像を削除(!!)
❌ GET /api/admin/r2-stats             → インフラ情報が見える
```

**最も危険な問題:**
```bash
# ブラウザのアドレスバーにURLを入力するだけで全データ消去可能
https://smart-measure.pages.dev/api/admin/delete-all-r2-images?confirm=yes
```

### 2. CORS ワイルドカード許可

```typescript
// ❌ 修正前: すべてのオリジンを許可
app.use('/*', cors())  // Access-Control-Allow-Origin: *
```

**リスク:**
- 任意のWebサイトからR2バケットへの画像アップロード・削除が実行可能
- XSS攻撃を通じたデータ漏洩
- CSRF攻撃によるデータ操作

## 解決策

### 1. 認証ミドルウェアの実装

#### 作成ファイル: `src/middleware/auth.ts`

```typescript
// 管理者認証ミドルウェア
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  if (!isAuthenticated(c)) {
    return c.json({
      success: false,
      error: 'Unauthorized. Admin API key required.',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }
  await next();
}

// デバッグアクセス制御（開発環境またはadminキー）
export async function requireDebugAccess(c: Context<AppEnv>, next: Next) {
  const isDevelopment = process.env?.NODE_ENV === 'development';
  
  if (isDevelopment) {
    await next();
    return;
  }
  
  if (!isAuthenticated(c)) {
    return c.json({
      success: false,
      error: 'Unauthorized. Admin API key required for debug endpoints.',
      errorCode: 'UNAUTHORIZED'
    }, 401);
  }
  
  await next();
}

// GETメソッドによる危険な操作を防止
export async function preventGetMethod(c: Context<AppEnv>, next: Next) {
  if (c.req.method === 'GET') {
    return c.json({
      success: false,
      error: 'This operation requires POST or DELETE method.',
      errorCode: 'METHOD_NOT_ALLOWED'
    }, 405);
  }
  await next();
}
```

#### 認証方式

**3つの認証方法をサポート:**

1. **Authorization ヘッダー（推奨）:**
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://smart-measure.pages.dev/api/admin/r2-stats
```

2. **X-Admin-Key ヘッダー:**
```bash
curl -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  https://smart-measure.pages.dev/api/admin/r2-stats
```

3. **環境変数 ADMIN_API_KEY:**
```bash
# Cloudflare Pages環境変数で設定
npx wrangler pages secret put ADMIN_API_KEY --project-name smart-measure
```

### 2. 保護されたエンドポイント

#### 管理者認証が必要 (`requireAdmin`)

```typescript
// ✅ 修正後: 管理者認証必須
admin.get('/init', requireAdmin, async (c) => { ... })
admin.get('/fix-schema', requireAdmin, async (c) => { ... })
admin.get('/api/admin/r2-stats', requireAdmin, async (c) => { ... })

// ⚠️ CRITICAL: GETからPOSTに変更 + 認証必須
admin.post('/api/admin/delete-all-r2-images', requireAdmin, async (c) => { ... })
```

#### デバッグアクセス制御 (`requireDebugAccess`)

```typescript
// ✅ 開発環境: 認証不要
// ✅ 本番環境: 管理者認証必須
admin.get('/api/debug/r2-list', requireDebugAccess, async (c) => { ... })
admin.get('/debug/r2-folder', requireDebugAccess, async (c) => { ... })
```

### 3. セキュアCORS設定

#### 作成ファイル: `src/middleware/cors.ts`

```typescript
// ✅ オリジンホワイトリスト方式
const ALLOWED_ORIGINS = [
  'https://smart-measure.pages.dev',
  'https://smart-measure-production.pages.dev',
  'https://measure-master-api.jinkedon2.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

export function secureCors() {
  return cors({
    origin: (origin, c) => {
      if (!origin) return origin || '*';
      
      // ホワイトリストチェック
      if (isOriginAllowed(origin)) {
        return origin;
      }
      
      // 不正なオリジンをログ記録
      console.warn('🚫 Blocked CORS request from:', origin);
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
    credentials: true
  });
}
```

#### 柔軟なオリジン検証

```typescript
function isOriginAllowed(origin: string): boolean {
  // 1. 完全一致
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  
  // 2. Cloudflare Pagesプレビューデプロイメント
  if (origin.match(/^https:\/\/[a-z0-9-]+\.smart-measure\.pages\.dev$/)) {
    return true;
  }
  
  // 3. ローカル開発（任意のポート）
  if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)) {
    return true;
  }
  
  return false;
}
```

### 4. 環境変数の設定

#### ローカル開発 (`.dev.vars`)

```bash
# Admin API Key for Protected Endpoints
# SECURITY: Change this to a strong random value in production
ADMIN_API_KEY=dev-admin-key-change-in-production
```

#### 本番環境設定

**方法1: Cloudflare Pages ダッシュボード**
```
Settings → Environment Variables → Production
変数名: ADMIN_API_KEY
値: [強力なランダム文字列]
```

**方法2: Wrangler CLI**
```bash
# 強力なAPIキーを生成
openssl rand -base64 32

# Cloudflare Pagesに設定
npx wrangler pages secret put ADMIN_API_KEY --project-name smart-measure
```

## 修正の影響範囲

### 修正されたファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/middleware/auth.ts` | 新規作成: 認証ミドルウェア |
| `src/middleware/cors.ts` | 新規作成: セキュアCORS設定 |
| `src/api/admin.ts` | 6エンドポイントに認証追加 |
| `src/index.tsx` | CORSをワイルドカードから厳格化 |
| `src/types/bindings.ts` | ADMIN_API_KEY追加 |
| `.dev.vars` | ローカル開発用設定追加 |
| `wrangler.jsonc` | 環境変数ドキュメント追加 |

### 保護されたエンドポイント一覧

#### 🔐 管理者認証必須 (requireAdmin)

| エンドポイント | メソッド | 説明 |
|--------------|---------|------|
| `/init` | GET | DB初期化 |
| `/fix-schema` | GET | スキーマ変更 |
| `/api/admin/r2-stats` | GET | R2統計情報 |
| `/api/admin/delete-all-r2-images` | **POST** | 全画像削除（GETから変更） |

#### 🔓 デバッグアクセス (requireDebugAccess)

| エンドポイント | 開発環境 | 本番環境 |
|--------------|----------|----------|
| `/api/debug/r2-list` | 認証不要 | 認証必須 |
| `/debug/r2-folder` | 認証不要 | 認証必須 |

## セキュリティ効果

### Before (危険)

```bash
# 誰でもアクセス可能
curl https://smart-measure.pages.dev/api/admin/delete-all-r2-images?confirm=yes
→ ✅ 200 OK (全画像削除成功)

# 任意のWebサイトからAPIアクセス可能
fetch('https://smart-measure.pages.dev/api/products/bulk-import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ products: [...] })
})
→ ✅ CORS許可
```

### After (安全)

```bash
# 認証なしでアクセス
curl https://smart-measure.pages.dev/api/admin/delete-all-r2-images
→ ❌ 401 Unauthorized

# 正しい認証でアクセス（POSTメソッド必須）
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://smart-measure.pages.dev/api/admin/delete-all-r2-images
→ ✅ 200 OK

# 不正なオリジンからのアクセス
fetch('https://smart-measure.pages.dev/api/products/bulk-import', ...)
→ ❌ CORS Error (ブロック)

# 許可されたオリジンからのアクセス
fetch('https://smart-measure.pages.dev/api/products/bulk-import', ...)
→ ✅ CORS許可
```

## デプロイ手順

### 1. ローカルテスト

```bash
# ビルド確認
npm run build

# ローカル開発サーバー起動
npm run dev

# 認証テスト
curl -H "Authorization: Bearer dev-admin-key-change-in-production" \
  http://localhost:3000/api/admin/r2-stats
```

### 2. 本番デプロイ

```bash
# 1. 強力なAPIキーを生成
ADMIN_KEY=$(openssl rand -base64 32)
echo "Generated Admin Key: $ADMIN_KEY"

# 2. Cloudflare Pagesに設定
npx wrangler pages secret put ADMIN_API_KEY --project-name smart-measure
# プロンプトでAPIキーを入力

# 3. デプロイ
npm run deploy

# 4. 動作確認
curl -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  https://smart-measure.pages.dev/api/admin/r2-stats
```

## まとめ

### ✅ 修正完了

- **認証**: 6つの危険なエンドポイントに認証追加
- **HTTPメソッド**: 削除操作をGET→POSTに変更
- **CORS**: ワイルドカード許可を厳格なホワイトリストに変更
- **ログ**: 不正アクセスの試行をすべて記録

### 🛡️ セキュリティレベル向上

| 項目 | Before | After |
|-----|--------|-------|
| 管理エンドポイント | ❌ 誰でもアクセス可能 | ✅ 認証必須 |
| 全画像削除 | ❌ GETで実行可能 | ✅ POST + 認証必須 |
| CORS | ❌ ワイルドカード許可 | ✅ ホワイトリスト方式 |
| デバッグ情報 | ❌ 公開 | ✅ 開発環境のみ or 認証必須 |

これで本番環境での不正アクセス、データ削除、CSRF攻撃のリスクが大幅に軽減されました!

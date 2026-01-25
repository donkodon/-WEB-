# Cloudflare Pages デプロイ手順（マルチテナント対応）

## 🚨 重要：D1 Database のバインディング設定

Cloudflare Pages では、`wrangler.jsonc` の D1 設定が自動的に反映されません。
**Cloudflare Dashboard で手動設定が必要です。**

---

## 📋 設定手順

### Step 1: Cloudflare Dashboard にログイン

1. https://dash.cloudflare.com/ にアクセス
2. アカウントを選択
3. **Pages** → **smart-measure** を選択

### Step 2: Settings → Functions に移動

1. **Settings** タブをクリック
2. 左メニューから **Functions** を選択
3. **D1 database bindings** セクションを見つける

### Step 3: D1 バインディングを追加

**Production 環境:**

| Variable name | D1 database |
|--------------|-------------|
| `DB` | `measure-master-db` |
| `DB_test_company` | `measure-master-test-company` |

**設定方法:**
1. **Add binding** をクリック
2. **Variable name**: `DB`
3. **D1 database**: `measure-master-db` を選択
4. **Save** をクリック

5. 再度 **Add binding** をクリック
6. **Variable name**: `DB_test_company`
7. **D1 database**: `measure-master-test-company` を選択
8. **Save** をクリック

### Step 4: Preview 環境も同様に設定

**Preview 環境:**

同じ設定を **Preview** 環境にも追加：

| Variable name | D1 database |
|--------------|-------------|
| `DB` | `measure-master-db` |
| `DB_test_company` | `measure-master-test-company` |

---

## 🔧 新しい企業を追加する手順

### 例: `company_b` を追加

#### 1. D1 データベースを作成
```bash
cd /home/user/webapp/smart-measure
npx wrangler d1 create measure-master-company-b
```

出力例：
```
✅ Successfully created DB 'measure-master-company-b'
database_id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**database_id をメモしてください！**

#### 2. wrangler.jsonc に追加
```jsonc
{
  "d1_databases": [
    // ... 既存のDB ...
    {
      "binding": "DB_company_b",
      "database_name": "measure-master-company-b",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  ]
}
```

#### 3. COMPANY_DB_MAPPING に追加

`src/index.tsx` の `COMPANY_DB_MAPPING` に追加：
```typescript
const COMPANY_DB_MAPPING: Record<string, string> = {
  'test_company': 'DB_test_company',
  'company_b': 'DB_company_b',  // ← 追加
};
```

#### 4. スキーマを適用
```bash
npx wrangler d1 execute measure-master-company-b --remote \
  --file=./migrations/tenant/0001_tenant_initial_schema.sql
```

#### 5. ビルド＆デプロイ
```bash
npm run build
npx wrangler pages deploy dist --project-name smart-measure
git add -A
git commit -m "Add: company_b database support"
git push origin main
```

#### 6. Cloudflare Dashboard でバインディングを追加

**Production 環境:**
- Variable name: `DB_company_b`
- D1 database: `measure-master-company-b`

**Preview 環境:**
- Variable name: `DB_company_b`
- D1 database: `measure-master-company-b`

#### 7. デプロイを再実行（バインディング反映のため）
```bash
npx wrangler pages deploy dist --project-name smart-measure
```

---

## ✅ 動作確認

### 1. 管理 API で検証
```bash
# test_company の検証
curl https://smart-measure.pages.dev/api/admin/verify-company-db/test_company

# company_b の検証（追加後）
curl https://smart-measure.pages.dev/api/admin/verify-company-db/company_b
```

### 2. データ移行（必要な場合）
```bash
# ドライラン
curl -X POST https://smart-measure.pages.dev/api/admin/migrate-company-data \
  -H "Content-Type: application/json" \
  -d '{"companyId":"company_b","dryRun":true}'

# 実際の移行
curl -X POST https://smart-measure.pages.dev/api/admin/migrate-company-data \
  -H "Content-Type: application/json" \
  -d '{"companyId":"company_b","dryRun":false}'
```

---

## 🔍 トラブルシューティング

### エラー: "Database binding DB_test_company not found"

**原因:** Cloudflare Dashboard でバインディングが設定されていない

**解決策:**
1. Cloudflare Dashboard → Pages → smart-measure → Settings → Functions
2. D1 database bindings に `DB_test_company` を追加
3. デプロイを再実行

### エラー: "No database binding found for company"

**原因:** `COMPANY_DB_MAPPING` に企業IDが登録されていない

**解決策:**
1. `src/index.tsx` の `COMPANY_DB_MAPPING` に企業IDを追加
2. ビルド＆デプロイ

---

## 📚 参考資料

- [Cloudflare Pages D1 Bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)
- [Wrangler D1 Commands](https://developers.cloudflare.com/workers/wrangler/commands/#d1)

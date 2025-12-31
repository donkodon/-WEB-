# スマホアプリ連携ガイド（部分対応版）

## 概要

SmartMeasure WEBアプリとスマホアプリの連携機能を最小限実装しました。

---

## 📋 実装内容

### **0. スマホアプリ画像の自動取得**

**スマホアプリで撮影した画像を自動表示:**
- **R2バケット**: `product-images-saisunsatsuei`
- **Public URL**: `https://pub-300562464768499b8fcaee903d0f9861.r2.dev`
- **ファイル名規則**: `{SKU}_{連番}_{タイムスタンプ}.jpg`

**動作:**
- ログイン時に自動的にR2バケットから画像を同期
- SKU検索APIでスマホアプリの画像も含めて返却
- `source: 'mobile'` でスマホアプリの画像を識別

---

### **1. CSV一括登録API（新規追加）**

**エンドポイント:**
```
POST http://localhost:3000/api/products/bulk-import
```

**リクエスト例:**
```json
{
  "products": [
    {
      "sku": "1025L190003",
      "barcode": "1025190003000",
      "name": "スプレー ペイントデザイン プルオーバー パーカー",
      "brand": "Example Brand",
      "category": "トップス",
      "size": "M",
      "color": "ブルー",
      "price": 5000,
      "description": "商品説明"
    }
  ]
}
```

**レスポンス例:**
```json
{
  "success": true,
  "message": "マスタデータを更新しました",
  "inserted": 1,
  "updated": 0,
  "total": 1
}
```

**動作:**
- SKUが既に存在する場合: **UPDATE**（上書き）
- SKUが存在しない場合: **INSERT**（新規作成）

---

### **2. SKU検索API（新規追加）**

**エンドポイント:**
```
GET http://localhost:3000/api/products/search?sku=1025L190003
```

**レスポンス例:**
```json
{
  "success": true,
  "product": {
    "sku": "1025L190003",
    "barcode": "1025190003000",
    "name": "スプレー ペイントデザイン プルオーバー パーカー",
    "brand": "Example Brand",
    "category": "トップス",
    "size": "M",
    "color": "ブルー",
    "price": 5000,
    "status": "Active",
    "created_at": "2025-01-01 12:00:00",
    "updated_at": "2025-01-01 12:00:00",
    "hasCapturedData": true,
    "capturedItems": [
      {
        "id": 1,
        "sku": "1025L190003",
        "item_code": "1025L190003_1",
        "image_urls": "[\"https://example.com/image1.jpg\"]",
        "source": "webapp",
        "condition": "Unknown",
        "photographed_at": "2025-01-01 12:30:00"
      },
      {
        "id": "mobile_0",
        "sku": "1025L190003",
        "item_code": "1025L190003_1_1735592163456",
        "image_urls": "[\"https://pub-300562464768499b8fcaee903d0f9861.r2.dev/1025L190003_1_1735592163456.jpg\"]",
        "source": "mobile",
        "condition": "Unknown",
        "photographed_at": "2025-01-01 12:35:00"
      }
    ],
    "latestItem": {
      "id": 1,
      "sku": "1025L190003",
      "item_code": "1025L190003_1",
      "image_urls": "[\"https://example.com/image1.jpg\"]",
      "source": "webapp",
      "condition": "Unknown",
      "photographed_at": "2025-01-01 12:30:00"
    },
    "capturedCount": 2,
    "webAppImageCount": 1,
    "mobileAppImageCount": 1
  }
}
```

**重要なフィールド:**
- `source`: 画像のソース (`webapp` または `mobile`)
- `webAppImageCount`: WEBアプリの画像数
- `mobileAppImageCount`: スマホアプリの画像数

---

### **3. 既存のCSVインポート（互換性維持）**

**エンドポイント:**
```
POST http://localhost:3000/api/import-csv
```

従来のCSVファイルアップロードも引き続き利用可能です。

---

## 🧪 テスト方法

### **1. CSV一括登録のテスト**

```bash
curl -X POST http://localhost:3000/api/products/bulk-import \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "sku": "TEST001",
        "barcode": "1234567890123",
        "name": "テスト商品",
        "brand": "テストブランド",
        "category": "テストカテゴリ",
        "size": "M",
        "color": "ブルー",
        "price": 1000
      }
    ]
  }'
```

**期待されるレスポンス:**
```json
{
  "success": true,
  "message": "マスタデータを更新しました",
  "inserted": 1,
  "updated": 0,
  "total": 1
}
```

---

### **2. SKU検索のテスト**

```bash
curl http://localhost:3000/api/products/search?sku=TEST001
```

**期待されるレスポンス:**
```json
{
  "success": true,
  "product": {
    "sku": "TEST001",
    "name": "テスト商品",
    "hasCapturedData": false,
    "capturedItems": [],
    "capturedCount": 0
  }
}
```

---

## 📊 データベーステーブル構造

### **products テーブル**

| カラム名 | 型 | 説明 |
|---------|---|------|
| id | INTEGER | 主キー（自動採番） |
| sku | TEXT | 商品SKU（ユニーク） |
| barcode | TEXT | バーコード |
| name | TEXT | 商品名 |
| brand | TEXT | ブランド |
| category | TEXT | カテゴリ |
| size | TEXT | サイズ |
| color | TEXT | カラー |
| price_sale | INTEGER | 販売価格 |
| status | TEXT | ステータス |
| created_at | DATETIME | 作成日時 |

---

## 🔧 スキーマ拡張

既存のproductsテーブルに新しいカラムを追加するには、以下のエンドポイントにアクセスしてください：

```
GET http://localhost:3000/fix-schema
```

これにより、以下のカラムが追加されます：
- barcode（バーコード）
- brand（ブランド）
- size（サイズ）
- color（カラー）
- その他の拡張フィールド

---

## ⚠️ 制限事項

### **現状の制限**

1. **テーブル分離なし**
   - `product_master` と `product_items` の分離は未実装
   - 全データが `products` テーブルに格納

2. **画像管理**
   - スマホアプリからの画像URLは `images` テーブルで管理
   - 完全なWorkers API統合は未実装

3. **外部キー制約**
   - `product_items` テーブルがないため、外部キー制約なし

---

## 🔄 将来の拡張

完全なスマホアプリ統合を行う場合、以下が必要です：

1. **テーブル分離**
   - `product_master` テーブル作成
   - `product_items` テーブル作成

2. **Cloudflare Workers API統合**
   - 共通のWorkers APIでデータベースアクセスを一元化

3. **R2バケット統合**
   - スマホアプリの画像とWEBアプリの画像を統合管理

---

## 📞 サポート

質問や問題がある場合は、開発者に連絡してください。

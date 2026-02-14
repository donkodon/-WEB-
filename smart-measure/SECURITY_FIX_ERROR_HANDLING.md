# セキュリティ修正: エラー情報の漏洩対策

## 問題点

本番環境で以下のような機密情報がクライアントに漏洩していました:

```typescript
// ❌ 修正前: 危険なエラーハンドリング
} catch (error: any) {
  return c.json({
    success: false,
    error: error.message,        // DBスキーマ情報が漏洩
    stack: error.stack,           // スタックトレースが漏洩
    details: error.toString()     // ファイルパスが漏洩
  }, 500);
}
```

### 漏洩リスク

1. **DBスキーマ情報**: `SQLITE_ERROR: table 'secret_data' not found`
2. **ファイルパス**: `Error at /home/user/webapp/src/api/admin.ts:42`
3. **内部サーバー情報**: `Connection failed to 192.168.1.100:8080`
4. **スタックトレース**: 内部実装の詳細が露出

## 解決策

### 1. セキュアエラーハンドラの作成

`src/helpers/error-handler.ts` を新規作成:

```typescript
// ✅ 安全なエラーハンドリング
export function createSafeErrorResponse(
  error: unknown,
  errorCode: ErrorCode,
  customMessage?: string
): SafeErrorResponse {
  // サーバー側で完全なエラー情報をログ出力
  console.error('❌ Error occurred:', {
    errorCode,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // 本番環境: 安全な汎用メッセージのみを返す
  // 開発環境: デバッグ用に詳細情報を返す
  if (isDevelopment()) {
    return { success: false, error: customMessage || error.message, errorCode };
  }
  
  return { success: false, error: getSafeErrorMessage(errorCode), errorCode };
}
```

### 2. 標準化されたエラーコード

```typescript
export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  DB_ERROR = 'DB_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  // ...
}
```

### 3. 全APIエンドポイントへの適用

修正されたファイル (20箇所以上のエラーハンドリング):

- `src/api/measurement.ts` - 自動採寸API
- `src/api/images.ts` - 画像管理API
- `src/api/products.ts` - 商品マスターAPI
- `src/api/admin.ts` - 管理者API
- `src/api/csv.ts` - CSV入出力API
- `src/api/bg-removal.ts` - 背景除去API
- `src/api/sync.ts` - データ同期API

## 修正例

### 修正前 (危険)

```typescript
} catch (error: any) {
  console.error('❌ Auto-measure error:', error);
  console.error('❌ Error stack:', error.stack);
  return c.json({ 
    success: false, 
    error: error.message || 'Unknown error',
    details: error.toString()
  }, 500);
}
```

### 修正後 (安全)

```typescript
} catch (error: any) {
  logError('Auto-measure', error, { imageUrl, sku });
  return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
}
```

## セキュリティ効果

### 本番環境でのクライアント応答

```json
{
  "success": false,
  "error": "External service is unavailable. Please try again later.",
  "errorCode": "EXTERNAL_API_ERROR"
}
```

### サーバーログ (Cloudflareログで確認可能)

```
❌ Error occurred: {
  errorCode: "EXTERNAL_API_ERROR",
  message: "SQLITE_ERROR: table not found at /var/lib/db/schema.sql:42",
  stack: "Error: SQLITE_ERROR...\n    at /home/user/webapp/src/api/measurement.ts:234",
  timestamp: "2026-02-12T16:00:00.000Z"
}
```

## 開発環境での動作

開発環境では詳細なエラー情報がクライアントに返されるため、デバッグが容易です:

```json
{
  "success": false,
  "error": "SQLITE_ERROR: table not found at /var/lib/db/schema.sql:42",
  "errorCode": "EXTERNAL_API_ERROR"
}
```

## 環境判定

```typescript
function isDevelopment(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
}
```

Cloudflare Pages本番環境では自動的に `NODE_ENV !== 'development'` となり、安全なエラーメッセージが返されます。

## 適用箇所

| ファイル | 修正箇所数 | 主な対象API |
|---------|-----------|------------|
| measurement.ts | 4箇所 | 自動採寸、ランドマーク更新 |
| images.ts | 8箇所 | 画像設定、ダウンロード、並び替え |
| products.ts | 2箇所 | 商品検索、一括インポート |
| admin.ts | 3箇所 | R2管理、統計情報 |
| csv.ts | 3箇所 | CSV出力、商品データDL |
| bg-removal.ts | 8箇所 | 背景除去、マスク編集 |
| sync.ts | 4箇所 | モバイル同期、画像登録 |

**合計: 32箇所のエラーハンドリングを修正**

## テスト結果

```bash
# テスト実行結果
✅ Database Error: 機密情報を含むエラーが安全な汎用メッセージに変換
✅ File System Error: ファイルパスが安全なメッセージに置換
✅ Upload Error: カスタムメッセージが正しく設定される
```

## まとめ

- ❌ **修正前**: `error.message`, `error.stack` をクライアントに直接返却
- ✅ **修正後**: 安全な汎用メッセージのみをクライアントに返却
- ✅ **サーバーログ**: 完全なエラー情報をCloudflareログに記録
- ✅ **開発環境**: デバッグ用に詳細情報を提供

この修正により、本番環境でDBスキーマ、ファイルパス、スタックトレースなどの機密情報がクライアントに漏洩するリスクが完全に排除されました。

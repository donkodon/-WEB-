# Cloudflare Pagesとの統合方法

## 前提条件

Hugging Face SpaceがデプロイされていることSpaceのURLを確認：
```
https://YOUR_USERNAME-smart-measure-bg-removal.hf.space
```

## 1. Cloudflare Pages環境変数を設定

1. Cloudflare Pagesダッシュボードにアクセス
2. プロジェクト「smart-measure」を選択
3. Settings → Environment variables
4. 以下を追加：

```
HF_SPACE_URL=https://YOUR_USERNAME-smart-measure-bg-removal.hf.space
```

## 2. コード修正箇所

`src/index.tsx`のCloudflare AI部分を修正します。

### 修正前（現在のコード）
```typescript
// Cloudflare AI Workers（存在しないモデル）
const result = await AI.run('@cf/rembg', {
  image: Array.from(new Uint8Array(imageBuffer))
});
```

### 修正後（Hugging Face Space API呼び出し）
```typescript
// Hugging Face Space API呼び出し
const HF_SPACE_URL = c.env.HF_SPACE_URL || 'https://YOUR_USERNAME-smart-measure-bg-removal.hf.space';

const hfResponse = await fetch(`${HF_SPACE_URL}/api/predict`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: [imageUrl]  // withoutBG Focus固定
  })
});

if (!hfResponse.ok) {
  throw new Error(`HF Space API failed: ${hfResponse.status}`);
}

const hfResult = await hfResponse.json();
const processedDataUrl = hfResult.data[0];  // Base64 data URL
```

## 3. ヘルパー関数の更新

`removeBackgroundWithCloudflareAI`を`removeBackgroundWithHFSpace`に変更：

```typescript
async function removeBackgroundWithHFSpace(
  HF_SPACE_URL: string, 
  imageUrl: string
): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  try {
    console.log('🤗 Calling Hugging Face Space API (withoutBG Focus)...');
    
    const response = await fetch(`${HF_SPACE_URL}/api/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [imageUrl]  // withoutBG Focus固定
      })
    });

    if (!response.ok) {
      throw new Error(`HF Space API failed: ${response.status}`);
    }

    const result = await response.json();
    const processedDataUrl = result.data[0];

    console.log('✅ Hugging Face Space processing completed');

    return {
      success: true,
      dataUrl: processedDataUrl
    };
  } catch (error: any) {
    console.error('❌ HF Space API failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

## 4. 呼び出し箇所の修正

### withoutBG Focus の場合
```typescript
if (model === 'withoutbg-focus') {
  const result = await removeBackgroundWithHFSpace(
    c.env.HF_SPACE_URL || 'https://YOUR_USERNAME-smart-measure-bg-removal.hf.space',
    imageUrl
  );
  
  if (!result.success || !result.dataUrl) {
    throw new Error(result.error || 'HF Space processing failed');
  }

  return c.json({
    success: true,
    processedUrl: result.dataUrl,
    message: 'Background removed using withoutBG Focus (Hugging Face Space)'
  });
}
```

## 5. 型定義の更新

```typescript
type Bindings = {
  DB: D1Database
  HF_SPACE_URL?: string  // 追加
  PRODUCT_IMAGES?: R2Bucket
  // AI: any  // 削除（使わない）
}
```

## 6. デプロイ

```bash
cd /home/user/webapp/smart-measure
npm run build
npx wrangler pages deploy dist --project-name smart-measure
```

## テスト方法

1. Cloudflare Pagesにアクセス
2. 画像をアップロード
3. モデル選択：
   - **rembg** → HF Space (snap/軽量)
   - **withoutbg** → HF Space (focus/高品質)
4. 背景削除実行
5. 結果確認

## 注意事項

### コールドスタート
初回または48時間未使用後は30秒〜2分かかります。
ユーザーに「処理中...」メッセージを表示してください。

### タイムアウト設定
```typescript
const response = await fetch(`${HF_SPACE_URL}/api/predict`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: [imageUrl, modelType]
  }),
  signal: AbortSignal.timeout(120000)  // 120秒タイムアウト
});
```

### エラーハンドリング
```typescript
try {
  const result = await removeBackgroundWithHFSpace(...);
  if (!result.success) {
    // フォールバック処理（例：別のAPI）
    console.error('HF Space failed, trying fallback...');
  }
} catch (error) {
  // ユーザーにエラー表示
  return c.json({ 
    success: false, 
    error: 'Background removal service is temporarily unavailable' 
  }, 503);
}
```

## 次のステップ

Hugging Face Spaceのデプロイ完了後、このドキュメントに従って
Cloudflareのコードを修正してください。

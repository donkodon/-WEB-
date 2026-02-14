/**
 * R2画像削除スクリプト
 * 
 * 目的: 既存のR2画像を全削除してクリーンスタート
 * 実行タイミング: Phase 1 開始前
 * 
 * 注意: このスクリプトは本番環境で実行されます！
 * 実行前に必ずバックアップを取ってください。
 */

import { Hono } from 'hono'

type Bindings = {
  PRODUCT_IMAGES?: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * R2画像削除エンドポイント（管理者用）
 * 
 * GET /api/admin/delete-all-r2-images?confirm=yes
 * 
 * クエリパラメータ:
 * - confirm: "yes" を指定すると実際に削除を実行
 * - dryRun: "true" を指定すると削除せずに一覧のみ表示
 */
app.get('/api/admin/delete-all-r2-images', async (c) => {
  const confirm = c.req.query('confirm');
  const dryRun = c.req.query('dryRun') === 'true';
  
  if (!c.env.PRODUCT_IMAGES) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }
  
  try {
    console.log('🗂️ Starting R2 image deletion process...');
    
    const bucket = c.env.PRODUCT_IMAGES;
    const deletedFiles: string[] = [];
    const errors: { key: string; error: string }[] = [];
    
    // R2のすべてのオブジェクトを取得
    let cursor: string | undefined;
    let totalFiles = 0;
    
    do {
      const listed = await bucket.list({
        limit: 1000,
        cursor: cursor
      });
      
      console.log(`📦 Found ${listed.objects.length} objects in this batch`);
      
      for (const obj of listed.objects) {
        totalFiles++;
        
        if (dryRun) {
          // Dry runモード: 削除せずに一覧のみ
          deletedFiles.push(obj.key);
          console.log(`🔍 Would delete: ${obj.key}`);
        } else if (confirm === 'yes') {
          // 実際に削除
          try {
            await bucket.delete(obj.key);
            deletedFiles.push(obj.key);
            console.log(`✅ Deleted: ${obj.key}`);
          } catch (err: any) {
            errors.push({ key: obj.key, error: err.message });
            console.error(`❌ Failed to delete ${obj.key}:`, err.message);
          }
        } else {
          // confirmパラメータがない場合は一覧のみ
          deletedFiles.push(obj.key);
        }
      }
      
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    
    const summary = {
      totalFiles,
      deletedCount: confirm === 'yes' && !dryRun ? deletedFiles.length : 0,
      errorCount: errors.length,
      mode: dryRun ? 'DRY_RUN' : (confirm === 'yes' ? 'EXECUTED' : 'PREVIEW'),
      files: deletedFiles,
      errors
    };
    
    if (dryRun) {
      return c.json({
        success: true,
        message: `Dry run completed. ${totalFiles} files would be deleted.`,
        ...summary
      });
    }
    
    if (confirm !== 'yes') {
      return c.json({
        success: false,
        message: 'Preview mode. Add ?confirm=yes to execute deletion.',
        warning: '⚠️ THIS WILL DELETE ALL IMAGES IN R2 BUCKET!',
        ...summary
      });
    }
    
    return c.json({
      success: true,
      message: `Successfully deleted ${deletedFiles.length} files from R2`,
      ...summary
    });
    
  } catch (error: any) {
    console.error('❌ Error during R2 deletion:', error);
    return c.json({
      success: false,
      error: 'Failed to delete R2 images',
      details: error.message
    }, 500);
  }
});

/**
 * R2画像統計情報取得エンドポイント
 * 
 * GET /api/admin/r2-stats
 */
app.get('/api/admin/r2-stats', async (c) => {
  if (!c.env.PRODUCT_IMAGES) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }
  
  try {
    const bucket = c.env.PRODUCT_IMAGES;
    let cursor: string | undefined;
    let totalFiles = 0;
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};
    const skuFolders = new Set<string>();
    
    do {
      const listed = await bucket.list({
        limit: 1000,
        cursor: cursor
      });
      
      for (const obj of listed.objects) {
        totalFiles++;
        totalSize += obj.size;
        
        // ファイルタイプを集計
        const ext = obj.key.split('.').pop() || 'unknown';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        
        // SKUフォルダを集計
        const sku = obj.key.split('/')[0];
        if (sku) {
          skuFolders.add(sku);
        }
      }
      
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    
    return c.json({
      success: true,
      stats: {
        totalFiles,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileTypes,
        skuFolders: Array.from(skuFolders),
        skuCount: skuFolders.size
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error getting R2 stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get R2 stats',
      details: error.message
    }, 500);
  }
});

export default app

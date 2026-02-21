import { Hono } from 'hono'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { requireAdmin, requireDebugAccess, _preventGetMethod } from '../../auth/middleware/auth'
import { logger } from '../../../shared/helpers/logger'

const admin = new Hono<AppEnv>()

// --- Helper: Init DB for Local Dev (Fix for separate SQLite instances) ---
// PROTECTED: Requires admin authentication
admin.get('/init', requireAdmin, async (c) => {
  const sql = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products table (SKU)
    CREATE TABLE IF NOT EXISTS product_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      company_id TEXT NOT NULL DEFAULT 'test_company',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sku, company_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
    CREATE INDEX IF NOT EXISTS idx_product_master_company_id ON product_master(company_id);
    CREATE INDEX IF NOT EXISTS idx_product_master_sku_company ON product_master(sku, company_id);

    -- Seed
    INSERT OR IGNORE INTO users (email, name) VALUES ('user@example.com', 'Kenji');

    INSERT OR IGNORE INTO product_master (sku, name, category) VALUES 
    ('TSHIRT-001-WHT', 'ベーシックコットンTシャツ（ホワイト）', 'Tops'),
    ('DNM-JCKT-NAVY', 'ヴィンテージデニムジャケット（ネイビー）', 'Outerwear'),
    ('SHIRT-LINEN-BEG', 'リネンシャツ（ベージュ）', 'Tops');
  `;

  // Split by semicolon and run each
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  for (const stmt of statements) {
    await c.env.DB.prepare(stmt).run();
  }
  
  return c.text('Database initialized and seeded!');
})

// --- Helper: Fix Schema (Apply migration 0002 manually if needed) ---
// PROTECTED: Requires admin authentication
admin.get('/fix-schema', requireAdmin, async (c) => {
    const alterations = [
        "ALTER TABLE product_master ADD COLUMN brand TEXT",
        "ALTER TABLE product_master ADD COLUMN brand_kana TEXT",
        "ALTER TABLE product_master ADD COLUMN size TEXT",
        "ALTER TABLE product_master ADD COLUMN color TEXT",
        "ALTER TABLE product_master ADD COLUMN category_sub TEXT",
        "ALTER TABLE product_master ADD COLUMN price_cost INTEGER",
        "ALTER TABLE product_master ADD COLUMN season TEXT",
        "ALTER TABLE product_master ADD COLUMN rank TEXT",
        "ALTER TABLE product_master ADD COLUMN release_date TEXT",
        "ALTER TABLE product_master ADD COLUMN buyer TEXT",
        "ALTER TABLE product_master ADD COLUMN store_name TEXT",
        "ALTER TABLE product_master ADD COLUMN price_ref INTEGER",
        "ALTER TABLE product_master ADD COLUMN price_sale INTEGER",
        "ALTER TABLE product_master ADD COLUMN price_list INTEGER",
        "ALTER TABLE product_master ADD COLUMN location TEXT",
        "ALTER TABLE product_master ADD COLUMN stock_quantity INTEGER",
        "ALTER TABLE product_master ADD COLUMN barcode TEXT",
        "ALTER TABLE product_master ADD COLUMN status TEXT",
        "ALTER TABLE product_master ADD COLUMN company_id TEXT NOT NULL DEFAULT 'test_company'"
    ];

    const results = [];
    for (const sql of alterations) {
        try {
            await c.env.DB.prepare(sql).run();
            results.push(`Success: ${sql}`);
        } catch (e: any) {
            results.push(`Skipped (or error): ${sql} -> ${e.message}`);
        }
    }
    return c.json(results);
})

// --- API: R2バケット確認用（デバッグ） ---
// PROTECTED: Requires debug access (dev mode or admin key)
admin.get('/api/debug/r2-list', requireDebugAccess, async (c) => {
    try {
        const prefix = c.req.query('prefix') || '';
        
        if (!c.env.PRODUCT_IMAGES) {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }
        
        // ⚠️ ADMIN ONLY: R2バケットの内容をリスト（管理・デバッグ用）
        // Note: limit=100で、大量ファイルの場合はページネーション必要
        const listed = await c.env.PRODUCT_IMAGES.list({
            prefix: prefix,
            limit: 100
        });
        
        const results = {
            prefix: prefix,
            count: listed.objects.length,
            truncated: listed.truncated,
            objects: listed.objects.map(obj => ({
                key: obj.key,
                size: obj.size,
                uploaded: obj.uploaded?.toISOString(),
                httpEtag: obj.httpEtag
            }))
        };
        
        return c.json(results, 200, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        
    } catch (error: any) {
        logError('R2 list', error, { prefix });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

// --- Debug: R2フォルダビューア ---
// PROTECTED: Requires debug access (dev mode or admin key)
  // eslint-disable-next-line max-lines-per-function
admin.get('/debug/r2-folder', requireDebugAccess, async (c) => {
    try {
        const sku = c.req.query('sku') || '';
        const R2_PUBLIC_URL = getR2PublicUrl(c.env);
        
        if (!c.env.PRODUCT_IMAGES) {
            return c.html(`
                <html>
                <head>
                    <title>R2 Error</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 p-8">
                    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
                        <h1 class="text-2xl font-bold text-red-600 mb-4">❌ R2バケットが設定されていません</h1>
                    </div>
                </body>
                </html>
            `);
        }
        
        // SKUが指定されていない場合、SKUフォルダ一覧を表示 (Phase 1: Dynamic company_id配下のみ)
        if (!sku) {
            const companyId = getCompanyId(c);
            // ⚠️ ADMIN ONLY: デバッグ用フォルダブラウザ（limit=100）
            const listed = await c.env.PRODUCT_IMAGES.list({ 
                prefix: `${companyId}/`,
                delimiter: '/',
                limit: 100
            });
            
            const folders = listed.delimitedPrefixes?.map(prefix => 
                prefix.replace(`${companyId}/`, '').replace('/', '')
            ) || [];
            
            return c.html(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>R2 Folder Browser</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 p-8">
                    <div class="max-w-4xl mx-auto">
                        <div class="bg-white rounded-lg shadow p-6">
                            <h1 class="text-3xl font-bold text-gray-800 mb-6">
                                <i class="fas fa-folder text-yellow-500 mr-2"></i>
                                R2 Folder Browser
                            </h1>
                            <p class="text-gray-600 mb-6">SKUフォルダ一覧（${folders.length}個）</p>
                            
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                                ${folders.map(folder => `
                                    <a href="/debug/r2-folder?sku=${folder}" 
                                       class="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 flex items-center transition-colors">
                                        <i class="fas fa-folder text-blue-500 text-2xl mr-3"></i>
                                        <span class="font-mono text-sm">${folder}</span>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet"/>
                </body>
                </html>
            `);
        }
        
        // 特定のSKUフォルダの内容を表示 (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        const prefix = `${companyId}/${sku}/`;
        // ⚠️ ADMIN ONLY: デバッグ用ファイル一覧（limit=100）
        const listed = await c.env.PRODUCT_IMAGES.list({
            prefix: prefix,
            limit: 100
        });
        
        const files = listed.objects.map(obj => {
            const filename = obj.key.split('/')[2]; // Phase 1: company_id/sku/filename
            const isProcessed = filename.endsWith('_p.png');
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
            
            return {
                key: obj.key,
                filename: filename,
                url: `${R2_PUBLIC_URL}/${obj.key}`,
                size: obj.size,
                uploaded: obj.uploaded?.toISOString(),
                isProcessed: isProcessed,
                isImage: isImage,
                sizeKB: Math.round(obj.size / 1024)
            };
        });
        
        const originalImages = files.filter(f => f.isImage && !f.isProcessed);
        const processedImages = files.filter(f => f.isProcessed);
        
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>R2 Folder: ${sku}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    .image-card { position: relative; overflow: hidden; }
                    .image-card img { transition: transform 0.3s; }
                    .image-card:hover img { transform: scale(1.05); }
                </style>
            </head>
            <body class="bg-gray-100 p-8">
                <div class="max-w-6xl mx-auto">
                    <!-- Header -->
                    <div class="mb-6">
                        <a href="/debug/r2-folder" class="text-blue-600 hover:underline mb-2 inline-block">
                            <i class="fas fa-arrow-left mr-2"></i>フォルダ一覧に戻る
                        </a>
                        <div class="bg-white rounded-lg shadow p-6">
                            <h1 class="text-3xl font-bold text-gray-800 mb-2">
                                <i class="fas fa-folder-open text-yellow-500 mr-2"></i>
                                ${sku}
                            </h1>
                            <p class="text-gray-600">
                                全${files.length}ファイル（元画像: ${originalImages.length}枚、白抜き画像: ${processedImages.length}枚）
                            </p>
                        </div>
                    </div>
                    
                    <!-- 元画像 -->
                    <div class="bg-white rounded-lg shadow p-6 mb-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-image text-blue-500 mr-2"></i>
                            元画像（${originalImages.length}枚）
                        </h2>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            ${originalImages.map(file => `
                                <div class="image-card bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                                    <a href="${file.url}" target="_blank">
                                        <img src="${file.url}" 
                                             alt="${file.filename}"
                                             class="w-full h-48 object-cover"
                                             loading="lazy">
                                    </a>
                                    <div class="p-3">
                                        <p class="font-mono text-xs text-gray-600 truncate mb-1" title="${file.filename}">
                                            ${file.filename}
                                        </p>
                                        <p class="text-xs text-gray-500">${file.sizeKB} KB</p>
                                        <p class="text-xs text-gray-400">${new Date(file.uploaded).toLocaleString('ja-JP')}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${originalImages.length === 0 ? '<p class="text-gray-500 text-center py-8">元画像がありません</p>' : ''}
                    </div>
                    
                    <!-- 白抜き画像 -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-magic text-green-500 mr-2"></i>
                            白抜き画像（${processedImages.length}枚）
                        </h2>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            ${processedImages.map(file => `
                                <div class="image-card bg-gray-50 rounded-lg overflow-hidden border border-green-200">
                                    <a href="${file.url}" target="_blank">
                                        <img src="${file.url}" 
                                             alt="${file.filename}"
                                             class="w-full h-48 object-contain bg-white"
                                             loading="lazy">
                                    </a>
                                    <div class="p-3">
                                        <p class="font-mono text-xs text-gray-600 truncate mb-1" title="${file.filename}">
                                            ${file.filename}
                                        </p>
                                        <p class="text-xs text-gray-500">${file.sizeKB} KB</p>
                                        <p class="text-xs text-gray-400">${new Date(file.uploaded).toLocaleString('ja-JP')}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${processedImages.length === 0 ? '<p class="text-gray-500 text-center py-8">白抜き画像がありません</p>' : ''}
                    </div>
                    
                    <!-- 削除ボタン（将来用） -->
                    <div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p class="text-sm text-yellow-800">
                            <i class="fas fa-info-circle mr-2"></i>
                            画像を削除したい場合は、Cloudflare Dashboardから直接削除できます
                        </p>
                    </div>
                </div>
                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet"/>
            </body>
            </html>
        `);
        
    } catch (error: any) {
        logger.error('R2 folder browser error:', error);
        return c.html(`
            <html>
            <head>
                <title>Error</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-gray-100 p-8">
                <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
                    <h1 class="text-2xl font-bold text-red-600 mb-4">❌ エラーが発生しました</h1>
                    <pre class="bg-gray-100 p-4 rounded text-sm">${error.message}</pre>
                </div>
            </body>
            </html>
        `);
    }
});


// ==========================================
// 🗑️ Admin: R2画像削除エンドポイント（Phase 1用）
// ==========================================

/**
 * R2画像削除エンドポイント（管理者用）
 * 
 * GET /api/admin/delete-all-r2-images?confirm=yes
 * 
 * クエリパラメータ:
 * - confirm: "yes" を指定すると実際に削除を実行
 * - dryRun: "true" を指定すると削除せずに一覧のみ表示
 */
// CRITICAL: Changed to POST + admin auth to prevent accidental deletion
admin.post('/api/admin/delete-all-r2-images', requireAdmin, async (c) => {
  const confirm = c.req.query('confirm');
  const dryRun = c.req.query('dryRun') === 'true';
  
  if (!c.env.PRODUCT_IMAGES) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }
  
  try {
    logger.debug('🗂️ Starting R2 image deletion process...');
    
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
      
      logger.debug(`📦 Found ${listed.objects.length} objects in this batch`);
      
      for (const obj of listed.objects) {
        totalFiles++;
        
        if (dryRun) {
          // Dry runモード: 削除せずに一覧のみ
          deletedFiles.push(obj.key);
          logger.debug(`🔍 Would delete: ${obj.key}`);
        } else if (confirm === 'yes') {
          // 実際に削除
          try {
            await bucket.delete(obj.key);
            deletedFiles.push(obj.key);
            logger.debug(`✅ Deleted: ${obj.key}`);
          } catch (err: any) {
            errors.push({ key: obj.key, error: err.message });
            logger.error(`❌ Failed to delete ${obj.key}:`, err.message);
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
    logError('R2 deletion', error, { confirm });
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
  }
});

/**
 * R2画像統計情報取得エンドポイント
 * 
 * GET /api/admin/r2-stats
 */
// PROTECTED: Requires admin authentication
admin.get('/api/admin/r2-stats', requireAdmin, async (c) => {
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
    logError('R2 stats', error);
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
  }
});

export default admin

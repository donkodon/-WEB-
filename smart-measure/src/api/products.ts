import { Hono } from 'hono'
import { getR2PublicUrl } from '../helpers/r2-url'
import type { AppEnv } from '../types/bindings'
import { getCompanyId, FIXED_COMPANY_ID } from '../helpers/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../helpers/error-handler'
import { logger } from '../helpers/logger'
import { fetchDashboardData } from '../helpers/dashboard-data'

const products = new Hono<AppEnv>()

// --- API: Dashboard Products with Pagination ---
products.get('/api/dashboard/products', async (c) => {
    // Get pagination parameters at function scope
    let page = 1
    let perPage = 12
    
    try {
        // Get company_id from cookie
        const cookies = c.req.header('Cookie') || ''
        const companyIdMatch = cookies.match(/company_id=([^;]+)/)
        const companyId = companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID
        
        // Parse pagination parameters
        page = parseInt(c.req.query('page') || '1', 10)
        perPage = parseInt(c.req.query('perPage') || '12', 10)
        
        // Validate parameters
        if (page < 1 || perPage < 1 || perPage > 100) {
            return c.json({ 
                success: false, 
                error: 'Invalid pagination parameters. Page must be >= 1, perPage must be between 1 and 100.' 
            }, 400)
        }
        
        logger.debug(`📊 API Dashboard request: company_id=${companyId}, page=${page}, perPage=${perPage}`)
        
        // Fetch data using shared helper
        const result = await fetchDashboardData({
            companyId,
            page,
            perPage,
            env: c.env
        })
        
        return c.json({
            success: true,
            ...result
        })
        
    } catch (error: any) {
        logError('Dashboard API', error, { page, perPage })
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500)
    }
})

// --- API: Bulk Import for Mobile App (JSON Format) ---
products.post('/api/products/bulk-import', async (c) => {
    try {
        const { products } = await c.req.json();
        
        if (!products || !Array.isArray(products)) {
            return c.json({ success: false, error: 'Invalid request: products array required' }, 400);
        }

        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        logger.debug(`📦 CSV Import: company_id=${companyId}, products=${products.length}`);

        let inserted = 0;
        let updated = 0;
        const batch = [];

        const stmt = c.env.DB.prepare(`
            INSERT OR REPLACE INTO product_master (
                sku, barcode, name, brand, category, size, color, 
                price_sale, status, company_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
                (SELECT created_at FROM product_master WHERE sku = ? AND company_id = ?), 
                ?
            ))
        `);

        for (const product of products) {
            if (!product.sku) continue;

            // Check if product exists for this company
            const existing = await c.env.DB.prepare(
                'SELECT sku FROM product_master WHERE sku = ? AND company_id = ?'
            ).bind(product.sku, companyId).first();

            if (existing) {
                updated++;
            } else {
                inserted++;
            }

            const now = new Date().toISOString();
            batch.push(stmt.bind(
                product.sku,
                product.barcode || null,
                product.name || 'Unknown Product',
                product.brand || null,
                product.category || null,
                product.size || null,
                product.color || null,
                product.price || 0,
                'Active',
                companyId,    // Add company_id
                product.sku,  // For COALESCE check
                companyId,    // For COALESCE check
                now           // Default created_at for new records
            ));

            // Execute batch every 50 rows
            if (batch.length >= 50) {
                await c.env.DB.batch(batch);
                batch.length = 0;
            }
        }

        // Execute remaining batch
        if (batch.length > 0) {
            await c.env.DB.batch(batch);
        }
        
        // Also sync to mobile app API
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        let mobileSynced = 0;
        
        try {
            const mobileResponse = await fetch(`${MOBILE_API_URL}/api/products/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products })
            });
            
            if (mobileResponse.ok) {
                const mobileData = await mobileResponse.json();
                mobileSynced = mobileData.inserted + mobileData.updated;
                logger.debug(`✅ Synced ${mobileSynced} products to mobile app API`);
            } else {
                logger.warn('⚠️ Failed to sync to mobile app API:', await mobileResponse.text());
            }
        } catch (e) {
            logger.error(' Mobile API sync error:', e);
        }

        return c.json({
            success: true,
            message: 'マスタデータを更新しました',
            inserted,
            updated,
            total: products.length,
            mobileSynced
        });

    } catch (error: any) {
        logError('Bulk import', error, { productsCount: products?.length });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

// --- API: Export Data (For External Apps) ---
// 他のアプリからデータを引っ張るための「窓口」です
products.get('/api/products/list', async (c) => {
    // データベースから全商品を取得
    const result = await c.env.DB.prepare(`
        SELECT 
            id, sku, name, brand, size, color, 
            price_sale, stock_quantity, status, 
            barcode, rank, 
            created_at 
        FROM product_master 
        ORDER BY id DESC
    `).all();

    // JSON形式（プログラムが読みやすい形式）で返す
    return c.json({
        source: "SmartMeasure API",
        timestamp: new Date().toISOString(),
        count: result.results.length,
        products: result.results
    });
});

// --- API: Search Product by SKU (for Mobile App) ---
products.get('/api/products/search', async (c) => {
    try {
        const sku = c.req.query('sku');
        
        if (!sku) {
            return c.json({ success: false, error: 'SKU parameter required' }, 400);
        }

        const product = await c.env.DB.prepare(`
            SELECT 
                sku, barcode, name, brand, category, size, color, 
                price_sale as price, status, created_at, created_at as updated_at
            FROM product_master 
            WHERE sku = ?
        `).bind(sku).first();

        if (!product) {
            return c.json({ 
                success: false, 
                error: 'Product not found' 
            }, 404);
        }

        // ✅ Performance fix: Get images from product_items instead of R2.list()
        const mobileAppImages = [];
        const R2_PUBLIC_URL = getR2PublicUrl(c.env);
        
        // Get images from product_items table (no R2 API calls needed)
        const companyId = getCompanyId(c);
        const productItem = await c.env.DB.prepare(`
            SELECT image_urls, updated_at 
            FROM product_items 
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();
        
        if (productItem && productItem.image_urls) {
            try {
                const imageUrls = JSON.parse(productItem.image_urls as string || '[]');
                for (const imageUrl of imageUrls) {
                    // Extract filename from URL
                    const urlParts = imageUrl.split('/');
                    const filename = urlParts[urlParts.length - 1];
                    
                    mobileAppImages.push({
                        url: imageUrl,
                        filename: filename,
                        uploaded: productItem.updated_at || new Date().toISOString()
                    });
                }
                logger.debug(`✅ Found ${mobileAppImages.length} images from product_items (no R2 list)`);
            } catch (e) {
                logger.error('Failed to parse image_urls:', e);
            }
        }
        
        // Fallback: Try R2 Public URL directly (local development)
        if (mobileAppImages.length === 0) {
            logger.debug('🔄 Trying R2 Public URL for mobile app images...');
            
            // Try common pattern: {SKU}_{1-10}.jpg
            for (let i = 1; i <= 10; i++) {
                try {
                    const imageUrl = `${R2_PUBLIC_URL}/${sku}_${i}.jpg`;
                    const headResponse = await fetch(imageUrl, { method: 'HEAD' });
                    
                    if (headResponse.ok) {
                        // Image exists!
                        const contentLength = headResponse.headers.get('content-length');
                        const lastModified = headResponse.headers.get('last-modified');
                        
                        mobileAppImages.push({
                            url: imageUrl,
                            filename: `${sku}_${i}.jpg`,
                            uploaded: lastModified || new Date().toISOString(),
                            size: contentLength ? parseInt(contentLength) : 0
                        });
                        
                        logger.debug(`✅ Found mobile app image: ${imageUrl}`);
                    } else {
                        // Image doesn't exist, stop checking
                        logger.debug(`⏹️ No more images found after index ${i-1}`);
                        break;
                    }
                } catch (e) {
                    // Error or no more images, stop
                    logger.debug(`⚠️ Error checking image ${i}:`, e);
                    break;
                }
            }
            
            logger.debug(`📱 Found ${mobileAppImages.length} mobile app images for SKU: ${sku}`);
        }

        // All images come from mobile app only (no WEB app images table)
        const allImages = mobileAppImages.map((img, index) => ({
            id: `mobile_${index}`,
            sku: sku,
            item_code: img.filename.replace('.jpg', ''),
            image_urls: JSON.stringify([img.url]),
            source: 'mobile',
            condition: 'Unknown',
            photographed_at: img.uploaded
        }));

        return c.json({
            success: true,
            product: {
                ...product,
                hasCapturedData: allImages.length > 0,
                capturedItems: allImages,
                latestItem: allImages.length > 0 ? allImages[0] : null,
                capturedCount: allImages.length,
                mobileAppImageCount: mobileAppImages.length
            }
        });

    } catch (error: any) {
        logError('Product search', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
    }
});

// --- API: Download Product Data (Images + CSV) with Billing ---
// ✅ Billing: Charges once per SKU per month
products.post('/api/products/download', async (c) => {
    try {
        const { imageIds, skus } = await c.req.json();
        
        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return c.json({ success: false, error: 'Image IDs required' }, 400);
        }

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return c.json({ success: false, error: 'SKUs required for billing' }, 400);
        }

        // Note: Billing middleware is applied externally in index.tsx
        // This endpoint just handles the download logic

        // Get company_id from cookie
        const companyId = getCompanyId(c);
        logger.debug(`📦 Product download request: company_id=${companyId}, images=${imageIds.length}, skus=${skus.length}`);

        // Return download session token (for tracking in frontend)
        const sessionId = crypto.randomUUID();
        
        return c.json({
            success: true,
            sessionId,
            imageIds,
            skus,
            message: 'Download authorized',
        });

    } catch (error: any) {
        logError('Product download', error);
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

export default products

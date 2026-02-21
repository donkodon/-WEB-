import { Hono } from 'hono'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import type { AppEnv } from '../../../types/bindings'
import type { SyncProduct } from '../../../types/database'
import { getCompanyId } from '../../auth/helpers/auth'
import { } from '../../image-editor/helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const sync = new Hono<AppEnv>()

// --- API: Sync from Mobile App API ---
  // eslint-disable-next-line max-lines-per-function
sync.post('/api/sync-from-mobile', async (c) => {
    try {
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        const _R2_PUBLIC_URL = getR2PublicUrl(c.env);
        
        logger.debug('🔄 Syncing product data from mobile app API and R2 bucket...');
        
        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        logger.debug(`📦 Sync from mobile: company_id=${companyId}`);
        
        // Get all products from local database for this company
        const localProducts = await c.env.DB.prepare(`
            SELECT sku FROM product_master WHERE company_id = ?
        `).bind(companyId).all();
        
        const localSkus = new Set(localProducts.results.map((p) => (p as { sku: string }).sku));
        let syncedCount = 0;
        let insertedCount = 0;
        let skippedCount = 0;
        
        // Step 1: Fetch all products from mobile API
        logger.debug('📡 Fetching all products from mobile API...');
        const allProductsResponse = await fetch(`${MOBILE_API_URL}/api/products`);
        
        if (allProductsResponse.ok) {
            const allProductsData = await allProductsResponse.json();
            
            if (allProductsData.success && allProductsData.products) {
                for (const product of allProductsData.products) {
                    const sku = product.sku;
                    
                    try {
                        if (localSkus.has(sku)) {
                            // Update existing product for this company
                            await c.env.DB.prepare(`
                                UPDATE product_master SET
                                    name = ?,
                                    brand = ?,
                                    size = ?,
                                    color = ?,
                                    price_sale = ?,
                                    barcode = ?,
                                    category = ?
                                WHERE sku = ? AND company_id = ?
                            `).bind(
                                product.name || '',
                                product.brand || null,
                                product.size || null,
                                product.color || null,
                                product.price || 0,
                                product.barcode || null,
                                product.category || null,
                                sku,
                                companyId
                            ).run();
                            
                            syncedCount++;
                            logger.debug(`✅ Updated product: ${sku} for company_id: ${companyId}`);
                        } else {
                            // Insert new product for this company
                            await c.env.DB.prepare(`
                                INSERT INTO product_master (
                                    sku, name, brand, size, color, price_sale, barcode, category, status, company_id, created_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                            `).bind(
                                sku,
                                product.name || `商品 ${sku}`,
                                product.brand || null,
                                product.size || null,
                                product.color || null,
                                product.price || 0,
                                product.barcode || null,
                                product.category || null,
                                'Active',
                                companyId
                            ).run();
                            
                            insertedCount++;
                            logger.debug(`✨ Inserted new product: ${sku} for company_id: ${companyId}`);
                        }
                    } catch (e) {
                        logger.error(`❌ Failed to sync product ${sku}:`, e);
                        skippedCount++;
                    }
                }
            }
        }
        
        // Step 2: R2 bucket auto-creation is DISABLED
        // Only CSV import and mobile API sync should create products
        logger.info(' R2 bucket auto-creation is disabled. Use CSV import to add products.');
        
        return c.json({
            success: true,
            synced: syncedCount,
            inserted: insertedCount,
            skipped: skippedCount,
            total: syncedCount + insertedCount,
            message: `Successfully synced ${syncedCount} products, inserted ${insertedCount} new products`
        });
        
    } catch (error: any) {
        logError('Sync from mobile API', error);
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

// --- API: Sync TO Mobile (WEB → Mobile API) ---
sync.post('/api/sync-to-mobile', async (c) => {
    try {
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        
        logger.debug('🔄 Syncing product data TO mobile app API...');
        
        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        logger.debug(`📦 Sync to mobile: company_id=${companyId}`);
        
        // Get all products from local database for this company
        const localProducts = await c.env.DB.prepare(`
            SELECT * FROM product_master WHERE company_id = ?
        `).bind(companyId).all();
        
        let syncedCount = 0;
        let errorCount = 0;
        
        // Send each product to mobile API
        for (const product of localProducts.results) {
            const p = product as SyncProduct & { description?: string | null };
            
            try {
                const response = await fetch(`${MOBILE_API_URL}/api/products`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sku: p.sku,
                        name: p.name || `商品 ${p.sku}`,
                        brand: p.brand || null,
                        size: p.size || null,
                        color: p.color || null,
                        price: p.price_sale || 0,
                        barcode: p.barcode || null,
                        category: p.category || null,
                        description: p.description || null
                    })
                });
                
                if (response.ok) {
                    syncedCount++;
                    logger.debug(`✅ Synced to mobile API: ${p.sku}`);
                } else {
                    errorCount++;
                    logger.error(`❌ Failed to sync ${p.sku}: ${response.status}`);
                }
            } catch (e) {
                errorCount++;
                logger.error(`❌ Failed to sync ${p.sku}:`, e);
            }
        }
        
        return c.json({
            success: true,
            synced: syncedCount,
            errors: errorCount,
            total: localProducts.results.length,
            message: `Successfully synced ${syncedCount}/${localProducts.results.length} products to mobile API`
        });
        
    } catch (error: any) {
        logError('Sync to mobile API', error);
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

// ⚠️ DEPRECATED: /api/sync-from-bubble endpoint removed
// This endpoint relied on removed images table.
// Image sync is now handled via image-upload-api + product_items.image_urls
// Use /api/sync-from-mobile for product data synchronization instead.

sync.post('/api/sync-from-bubble', async (c) => {
    return c.json({
        success: false,
        error: 'DEPRECATED',
        message: 'This endpoint is deprecated. Images are now synced via image-upload-api.',
        alternative: 'Use /api/sync-from-mobile for product data synchronization'
    }, 410);
});


// --- API: Manual Image Registration from Bubble ---
sync.post('/api/register-image', async (c) => {
    try {
        const body = await c.req.json();
        const { sku, imageUrl } = body;
        
        if (!sku || !imageUrl) {
            return c.json({ error: 'SKU and imageUrl are required' }, 400);
        }
        
        // Check if product exists, create if not
        const product = await c.env.DB.prepare(`
            SELECT id FROM product_master WHERE sku = ?
        `).bind(sku).first();
        
        if (!product) {
            await c.env.DB.prepare(`
                INSERT INTO product_master (sku, name, category)
                VALUES (?, ?, ?)
            `).bind(sku, `商品 ${sku}`, 'Imported').run();
        }
        
        // Image registration removed - images are now managed via R2 bucket only
        return c.json({ 
            success: true,
            message: 'Product exists, but image registration is handled via R2 bucket',
            sku: sku
        });
        
    } catch (error: any) {
        logError('Register image', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});


export default sync

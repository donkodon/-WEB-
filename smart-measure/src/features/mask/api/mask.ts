/**
 * Mask API - マスク画像の保存・更新・再生成
 * features/mask/api/mask.ts
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { ImageUrlHelper } from '../../image-editor/helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const maskApi = new Hono<AppEnv>()

// --- API: Update Mask Image ---
maskApi.post('/api/update-mask/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        const body = await c.req.json();
        
        logger.debug(`🎭 Updating mask for SKU ${sku}, Company ${companyId}`);
        
        if (!body.maskDataUrl) {
            return c.json({ error: 'maskDataUrl is required' }, 400);
        }
        
        // Convert data URL to buffer
        const base64Data = body.maskDataUrl.split(',')[1];
        const maskImageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        
        // Upload to R2
        const timestamp = Date.now();
        const r2Key = `${companyId}/${sku}/mask_edited_${timestamp}.png`;
        
        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, maskImageBuffer, {
                httpMetadata: {
                    contentType: 'image/png'
                }
            });
            logger.debug(`✅ Uploaded edited mask to R2: ${r2Key}`);
        }
        
        const maskUrl = ImageUrlHelper.toFullUrl(r2Key);
        
        // Update product_items with new mask URL（背景削除マスクはmask_image_url_r2に保存）
        await c.env.DB.prepare(`
            UPDATE product_items
            SET mask_image_url_r2 = ?, updated_at = ?
            WHERE sku = ? AND company_id = ?
        `).bind(maskUrl, new Date().toISOString(), sku, companyId).run();
        
        logger.debug(`✅ Updated product_items with edited mask URL (mask_image_url_r2)`);
        
        return c.json({
            success: true,
            sku,
            maskUrl,
            message: 'Mask updated successfully'
        });
        
    } catch (error: any) {
        logError('Mask update', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});


// --- API: Save Mask Image ---
maskApi.post('/api/save-mask/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        const { maskDataUrl, filenamePart } = await c.req.json();
        
        if (!maskDataUrl || !maskDataUrl.startsWith('data:image/png;base64,')) {
            return c.json({ error: 'Invalid mask data' }, 400);
        }
        
        if (!filenamePart) {
            return c.json({ error: 'filenamePart is required' }, 400);
        }
        
        logger.debug(`🎭 Saving mask for SKU ${sku}, filename: ${filenamePart}`);
        
        // Decode base64
        const base64Data = maskDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        // Generate R2 key: {company_id}/{sku}/{filenamePart}_mask.png (overwrite existing)
        const r2Key = `${companyId}/${sku}/${filenamePart}_mask.png`;
        
        if (c.env.PRODUCT_IMAGES) {
            // Upload to R2
            await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
                httpMetadata: {
                    contentType: 'image/png'
                }
            });
            
            logger.debug(`✅ Mask uploaded to R2: ${r2Key}`);
            
            // Build public URL
            const maskUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
            
            // Update database（背景削除マスクはmask_image_url_r2に保存）
            await c.env.DB.prepare(`
                UPDATE product_items 
                SET mask_image_url_r2 = ?, updated_at = CURRENT_TIMESTAMP
                WHERE sku = ? AND company_id = ?
            `).bind(maskUrl, sku, companyId).run();
            
            logger.debug(`✅ Database updated with mask URL (mask_image_url_r2)`);
            
            return c.json({
                success: true,
                sku,
                maskUrl,
                message: 'Mask saved successfully'
            });
        } else {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }
    } catch (error: any) {
        logError('Mask save', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});


// --- API: Regenerate Image with Edited Mask ---
maskApi.post('/api/regenerate-with-mask/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        
        logger.debug(`🔄 Regenerating image for SKU ${sku} with edited mask`);
        
        // Get original image and mask URLs（背景削除マスクはmask_image_url_r2から取得）
        const result = await c.env.DB.prepare(`
            SELECT 
                COALESCE(measurement_image_url, annotated_image_url) as image_url,
                mask_image_url_r2
            FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();
        
        if (!result || !result.image_url) {
            return c.json({ error: 'Image not found for this SKU' }, 404);
        }
        
        if (!result.mask_image_url_r2) {
            return c.json({ error: 'Mask image not found for this SKU' }, 404);
        }
        
        const originalUrl = result.image_url as string;
        const maskUrl = result.mask_image_url_r2 as string;
        
        logger.debug(`📸 Original image: ${originalUrl}`);
        logger.debug(`🎭 Mask image: ${maskUrl}`);
        
        // Return URLs for client-side processing
        return c.json({
            success: true,
            sku,
            originalUrl,
            maskUrl,
            message: 'Mask and original URLs retrieved. Client-side regeneration recommended.'
        });
        
    } catch (error: any) {
        logError('Regenerate with mask', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

export default maskApi

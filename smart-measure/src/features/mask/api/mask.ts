/**
 * Mask API - マスク画像の保存・更新・再生成
 * features/mask/api/mask.ts
 * 
 * 企業ID取得方針:
 * - requireFirebaseAuth ミドルウェアで検証済みの user.companyId を使用
 * - Cookieの company_id には依存しない（本番はFirebase認証のみ）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getCompanyId } from '../../auth/helpers/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const maskApi = new Hono<AppEnv>()

// Firebase認証ミドルウェアを全エンドポイントに適用
maskApi.use('*', requireFirebaseAuth)

// --- API: 現在のマスクURL取得（保存前のファイル名確定用）---
maskApi.get('/api/mask-info/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        const result = await c.env.DB.prepare(`
            SELECT mask_image_url FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();

        return c.json({
            success: true,
            sku,
            companyId,
            maskImageUrl: result?.mask_image_url || null
        });
    } catch (error: any) {
        logError('Mask info', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
    }
});

/**
 * 企業IDをFirebase認証済みuserから取得（cookieフォールバックなし）
 * requireFirebaseAuth通過済みなので必ずuserが存在する
 */
function getCompanyIdFromAuth(c: any): string {
    const user = c.get('user')
    if (user?.companyId) {
        logger.debug(`✅ Company ID from Firebase auth: ${user.companyId}`)
        return user.companyId
    }
    // フォールバック: cookieから（ローカル開発用）
    const fallback = getCompanyId(c)
    logger.warn(`⚠️ Firebase user has no companyId, falling back to cookie: ${fallback}`)
    return fallback
}


// --- API: Save Mask Image (同じファイル名で上書き保存) ---
maskApi.post('/api/save-mask/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        const { maskDataUrl, filenamePart } = await c.req.json();

        if (!maskDataUrl || !maskDataUrl.startsWith('data:image/png;base64,')) {
            return c.json({ error: 'Invalid mask data' }, 400);
        }

        if (!filenamePart) {
            return c.json({ error: 'filenamePart is required' }, 400);
        }

        logger.debug(`🎭 Saving mask: company=${companyId}, sku=${sku}, filename=${filenamePart}`);

        // Decode base64
        const base64Data = maskDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // R2キー: {company_id}/{sku}/{filenamePart}.png で上書き保存
        // filenamePart はクライアントが既存マスクURLから取得したファイル名（拡張子なし）
        // 例: "abc123_mask" → "1025L280001/SKU001/abc123_mask.png"
        const r2Key = `${companyId}/${sku}/${filenamePart}.png`;

        logger.debug(`📦 R2 key: ${r2Key}`);

        if (!c.env.PRODUCT_IMAGES) {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }

        await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
            httpMetadata: { contentType: 'image/png' }
        });

        logger.debug(`✅ Mask uploaded to R2: ${r2Key}`);

        const maskUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;

        // DBのmask_image_urlを更新（同じcompanyId+skuのレコード）
        await c.env.DB.prepare(`
            UPDATE product_items
            SET mask_image_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sku = ? AND company_id = ?
        `).bind(maskUrl, sku, companyId).run();

        logger.debug(`✅ DB updated: mask_image_url=${maskUrl}`);

        return c.json({
            success: true,
            sku,
            companyId,
            maskUrl,
            r2Key,
            message: 'Mask saved successfully'
        });

    } catch (error: any) {
        logError('Mask save', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});


// --- API: Update Mask Image (タイムスタンプ付き新規保存 ※旧API) ---
maskApi.post('/api/update-mask/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        const body = await c.req.json();

        logger.debug(`🎭 Updating mask for SKU ${sku}, Company ${companyId}`);

        if (!body.maskDataUrl) {
            return c.json({ error: 'maskDataUrl is required' }, 400);
        }

        const base64Data = body.maskDataUrl.split(',')[1];
        const maskImageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;

        const timestamp = Date.now();
        const r2Key = `${companyId}/${sku}/mask_edited_${timestamp}.png`;

        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, maskImageBuffer, {
                httpMetadata: { contentType: 'image/png' }
            });
            logger.debug(`✅ Uploaded edited mask to R2: ${r2Key}`);
        }

        const maskUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;

        await c.env.DB.prepare(`
            UPDATE product_items
            SET mask_image_url = ?, updated_at = ?
            WHERE sku = ? AND company_id = ?
        `).bind(maskUrl, new Date().toISOString(), sku, companyId).run();

        logger.debug(`✅ Updated product_items with edited mask URL`);

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


// --- API: Regenerate Image with Edited Mask ---
maskApi.post('/api/regenerate-with-mask/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)

        logger.debug(`🔄 Regenerating image for SKU ${sku} with edited mask, company=${companyId}`);

        const result = await c.env.DB.prepare(`
            SELECT
                COALESCE(measurement_image_url, annotated_image_url) as image_url,
                mask_image_url
            FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();

        if (!result || !result.image_url) {
            return c.json({ error: 'Image not found for this SKU' }, 404);
        }

        if (!result.mask_image_url) {
            return c.json({ error: 'Mask image not found for this SKU' }, 404);
        }

        return c.json({
            success: true,
            sku,
            originalUrl: result.image_url as string,
            maskUrl: result.mask_image_url as string,
            message: 'URLs retrieved for client-side regeneration'
        });

    } catch (error: any) {
        logError('Regenerate with mask', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

export default maskApi

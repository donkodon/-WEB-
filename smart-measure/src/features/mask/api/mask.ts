/**
 * Mask API - マスク画像の保存・更新・再生成
 * 
 * 設計方針:
 * - 保存先: {companyId}/{sku}/{filenamePart}_mask.png
 *   filenamePart = オリジナル画像のファイル名ベース（例: 4469bcc2-09b1-4218-8ad4-78fd92ced9a7）
 * - DBカラム: mask_image_url_r2（背景削除マスク専用）
 * - 企業IDはFirebase認証済みuser.companyIdから取得
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

/**
 * 企業IDをFirebase認証済みuserから取得
 */
function getCompanyIdFromAuth(c: any): string {
    const user = c.get('user')
    if (user?.companyId) {
        logger.debug(`✅ Company ID from Firebase auth: ${user.companyId}`)
        return user.companyId
    }
    const fallback = getCompanyId(c)
    logger.warn(`⚠️ Firebase user has no companyId, falling back: ${fallback}`)
    return fallback
}

/**
 * URLからファイル名のベース部分を抽出
 * 例: https://xxx.r2.dev/relight/101010/4469bcc2-09b1-4218-8ad4-78fd92ced9a7.jpg
 *   → "4469bcc2-09b1-4218-8ad4-78fd92ced9a7"
 */
function extractBasenameFromUrl(url: string): string | null {
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split('/').pop() || '';
        const dotIndex = filename.lastIndexOf('.');
        return dotIndex > 0 ? filename.substring(0, dotIndex) : filename || null;
    } catch {
        const filename = url.split('/').pop() || '';
        const dotIndex = filename.lastIndexOf('.');
        return dotIndex > 0 ? filename.substring(0, dotIndex) : filename || null;
    }
}


// --- API: マスク情報取得（デバッグ・クライアント確認用）---
maskApi.get('/api/mask-info/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        const result = await c.env.DB.prepare(`
            SELECT mask_image_url_r2 FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();

        return c.json({
            success: true,
            sku,
            companyId,
            maskImageUrl: result?.mask_image_url_r2 || null
        });
    } catch (error: any) {
        logError('Mask info', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
    }
});


// --- API: Save Mask Image（{filenamePart}_mask.png で上書き保存）---
maskApi.post('/api/save-mask/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        const body = await c.req.json();
        const { maskDataUrl, filenamePart } = body;

        if (!maskDataUrl || !maskDataUrl.startsWith('data:image/png;base64,')) {
            return c.json({ error: 'Invalid mask data' }, 400);
        }

        if (!c.env.PRODUCT_IMAGES) {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }

        // ① ファイル名を決定
        // 優先順位: 1) クライアントから送られたfilenamePart → {filenamePart}_mask.png
        //          2) DBのimage_urlsから最初の画像のベース名 → {basename}_mask.png
        //          3) フォールバック: {sku}_mask.png
        let maskBasename: string;

        if (filenamePart && filenamePart.trim()) {
            maskBasename = `${filenamePart.trim()}_mask`;
            logger.debug(`🎯 Using filenamePart from client: ${maskBasename}`)
        } else {
            try {
                const dbResult = await c.env.DB.prepare(`
                    SELECT image_urls FROM product_items
                    WHERE sku = ? AND company_id = ?
                    LIMIT 1
                `).bind(sku, companyId).first();

                const imageUrls: string[] = JSON.parse((dbResult?.image_urls as string) || '[]');
                const firstImageUrl = imageUrls[0] || null;

                if (firstImageUrl) {
                    const basename = extractBasenameFromUrl(firstImageUrl);
                    maskBasename = basename ? `${basename}_mask` : `${sku}_mask`;
                    logger.debug(`🎯 Using basename from image_urls: ${maskBasename} (from ${firstImageUrl})`)
                } else {
                    maskBasename = `${sku}_mask`;
                    logger.debug(`🎯 Fallback to sku_mask: ${maskBasename}`)
                }
            } catch (e) {
                maskBasename = `${sku}_mask`;
                logger.warn(`⚠️ Failed to get image_urls, fallback: ${maskBasename}`, e)
            }
        }

        const r2Key = `${companyId}/${sku}/${maskBasename}.png`;

        logger.debug(`🎭 Saving mask: company=${companyId}, sku=${sku}`)
        logger.debug(`📦 R2 key: ${r2Key}`)

        // ② Decode base64 → R2にPUT（同じキーなら上書き）
        const base64Data = maskDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
            httpMetadata: { contentType: 'image/png' }
        });
        logger.debug(`✅ Mask uploaded to R2: ${r2Key}`)

        // ③ DBのmask_image_url_r2を更新（背景削除マスク専用カラム）
        const maskUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
        await c.env.DB.prepare(`
            UPDATE product_items
            SET mask_image_url_r2 = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sku = ? AND company_id = ?
        `).bind(maskUrl, sku, companyId).run();
        logger.debug(`✅ DB updated: mask_image_url_r2=${maskUrl}`)

        return c.json({
            success: true,
            sku,
            companyId,
            maskUrl,
            r2Key,
            maskBasename,
            message: `Mask saved: ${r2Key}`
        });

    } catch (error: any) {
        logError('Mask save', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});


// --- API: Regenerate Image with Edited Mask ---
maskApi.post('/api/regenerate-with-mask/:sku', async (c) => {
    const sku = c.req.param('sku');
    try {
        const companyId = getCompanyIdFromAuth(c)
        logger.debug(`🔄 Regenerating image: sku=${sku}, company=${companyId}`)

        const result = await c.env.DB.prepare(`
            SELECT
                COALESCE(measurement_image_url, annotated_image_url) as image_url,
                mask_image_url_r2
            FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();

        if (!result?.image_url) {
            return c.json({ error: 'Image not found for this SKU' }, 404);
        }
        if (!result.mask_image_url_r2) {
            return c.json({ error: 'Mask image not found for this SKU' }, 404);
        }

        const originalUrl = result.image_url as string;
        const maskUrl = result.mask_image_url_r2 as string;

        logger.debug(`📸 Original image: ${originalUrl}`);
        logger.debug(`🎭 Mask image: ${maskUrl}`);

        return c.json({
            success: true,
            sku,
            originalUrl,
            maskUrl,
        });

    } catch (error: any) {
        logError('Regenerate with mask', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

export default maskApi

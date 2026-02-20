/**
 * Image Download & Save API
 *
 * GET  /api/download-image/:imageId           オリジナル画像URL取得
 * GET  /api/download-processed-image/:imageId 処理済み画像をbase64で取得
 * POST /api/save-edited-image/:imageId        最終編集済み画像をR2に保存
 */
import { Hono } from 'hono'
import { getR2PublicUrl } from '../helpers/r2-url'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { markImageAsFinal } from '../helpers/image-status'
import { logger } from '../../../shared/helpers/logger'
import { requireFirebaseAuth } from '../../auth/middleware/auth'

const download = new Hono<AppEnv>()

download.get('/api/download-image/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        // images table removed
        const result: any = null;

        if (!result) {
            return c.json({ error: 'Image not found' }, 404);
        }

        const sku = (result.sku as string) || 'UNKNOWN';
        const imageIdStr = (result.id as number).toString().padStart(4, '0');
        const filename = `${sku}_original_${imageIdStr}.png`;

        return c.json({ imageUrl: result.original_url, filename, sku });

    } catch (error: any) {
        logError('Download image', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

download.get('/api/download-processed-image/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        const R2_PUBLIC_URL = getR2PublicUrl(c.env);

        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }

        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const companyId = getCompanyId(c);

        const processedKey = `${companyId}/${sku}/${filenamePart}_p.png`;
        let processedUrl = null;

        if (c.env.PRODUCT_IMAGES) {
            try {
                const r2Object = await c.env.PRODUCT_IMAGES.head(processedKey);
                if (r2Object) {
                    processedUrl = `${R2_PUBLIC_URL}/${processedKey}`;
                    logger.debug(`✅ Found processed image: ${processedKey}`);
                }
            } catch (e) {
                logger.error(`❌ Failed to check processed image:`, e);
            }
        }

        if (!processedUrl) {
            return c.json({
                error: 'No processed image available',
                message: '白抜き処理が完了していません'
            }, 404);
        }

        const imageIdPart = imageId.replace('r2_', '');
        const filename = `${imageIdPart}_processed.png`;
        logger.debug(`📝 Generated filename: ${filename} for imageId: ${imageId}`);

        try {
            const r2Object = await c.env.PRODUCT_IMAGES.get(processedKey);
            if (!r2Object) {
                return c.json({
                    error: 'Failed to retrieve image from R2',
                    message: 'R2オブジェクトの取得に失敗しました'
                }, 500);
            }

            const arrayBuffer = await r2Object.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64String = buffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64String}`;

            logger.debug(`✅ Converted image to base64 (${base64String.length} chars)`);

            return c.json({ imageUrl: dataUrl, filename, sku, status: 'completed' });

        } catch (e) {
            logger.error(`❌ Failed to fetch R2 object:`, e);
            return c.json({
                error: 'Failed to fetch image data',
                message: '画像データの取得に失敗しました'
            }, 500);
        }

    } catch (error: any) {
        logError('Download processed image', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

download.post('/api/save-edited-image/:imageId', requireFirebaseAuth, async (c) => {
    const imageId = c.req.param('imageId');
    try {
        const body = await c.req.json();
        const imageData = body.imageData;

        if (!imageData) {
            return c.json({ error: 'imageData is required' }, 400);
        }

        logger.debug('💾 Saving edited image:', imageId);

        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');

        const user = c.get('user') as { companyId?: string } | undefined;
        const companyId = user?.companyId || getCompanyId(c);
        logger.debug('🏢 Company ID:', companyId, '(from:', user?.companyId ? 'auth' : 'cookie', ')');

        const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
        logger.debug('📂 Final image key:', finalKey);

        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const binaryString = atob(base64Data);
        const imageBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            imageBuffer[i] = binaryString.charCodeAt(i);
        }

        logger.debug('📊 Image size:', imageBuffer.length, 'bytes');

        await c.env.PRODUCT_IMAGES.put(finalKey, imageBuffer, {
            httpMetadata: { contentType: 'image/png' }
        });

        logger.debug(' Saved final image to R2:', finalKey);

        await markImageAsFinal(c.env.DB, sku, companyId, filenamePart);

        logger.debug(' Updated image status in DB for SKU:', sku);

        return c.json({ success: true, imageId, finalKey, message: 'Final image saved successfully' });

    } catch (error: any) {
        logError('Save edited image', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

export default download

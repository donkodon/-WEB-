/**
 * Image Download & Save API
 *
 * GET  /api/download-image/:imageId           オリジナル画像URL取得（image-proxy経由）
 * GET  /api/download-processed-image/:imageId 処理済み画像をbase64で取得
 * GET  /api/download-product-data/:imageId    商品データDL用（f>p>original優先で画像取得）
 * POST /api/save-edited-image/:imageId        最終編集済み画像をR2に保存
 */
import { Hono } from 'hono'
import type { R2ObjectBody } from '@cloudflare/workers-types'
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
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }

        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const companyId = getCompanyId(c);

        logger.debug('📥 [DOWNLOAD-ORIGINAL]', { imageId, sku, filenamePart, companyId });

        // Try original image extensions in order
        const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
        let r2Object = null;
        let foundKey = '';

        for (const ext of extensions) {
            const key = `${companyId}/${sku}/${filenamePart}${ext}`;
            logger.debug(`🔍 Trying R2 key: ${key}`);
            r2Object = await c.env.PRODUCT_IMAGES.head(key);
            if (r2Object) {
                foundKey = key;
                logger.debug(`✅ Found original image: ${key}`);
                break;
            }
        }

        if (!r2Object || !foundKey) {
            return c.json({ error: 'Image not found', message: 'オリジナル画像が見つかりません' }, 404);
        }

        // Use image-proxy URL for download (handles CORS and auth)
        const ext = foundKey.split('.').pop() || 'jpg';
        const proxyUrl = `/api/image-proxy/${sku}/${filenamePart}.${ext}`;
        const filename = `${sku}_${filenamePart}_original.${ext}`;

        return c.json({ imageUrl: proxyUrl, filename, sku });

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

        // 🚨 CRITICAL: Log company_id for debugging
        const user = c.get('user') as { companyId?: string; email?: string } | undefined;
        logger.debug('🏢 [DOWNLOAD-PROCESSED] Company ID Resolution:', {
            resolvedCompanyId: companyId,
            userContext: user ? { email: user.email, companyId: user.companyId } : null,
            imageId: imageId,
            sku: sku
        });

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

/**
 * GET /api/download-product-data/:imageId
 * 商品データDL用: f画像 > p画像 > オリジナルの優先順位で画像をbase64返却
 * フロントエンドの「商品データDL」ボタンから呼ばれる
 */
download.get('/api/download-product-data/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }

        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const companyId = getCompanyId(c);

        const user = c.get('user') as { companyId?: string; email?: string } | undefined;
        logger.debug('📦 [DOWNLOAD-PRODUCT-DATA]', {
            imageId, sku, filenamePart, companyId,
            userEmail: user?.email
        });

        if (!c.env.PRODUCT_IMAGES) {
            return c.json({ error: 'R2 storage not configured' }, 500);
        }

        // Priority: _f.png > _p.png > original
        const candidates = [
            { key: `${companyId}/${sku}/${filenamePart}_f.png`, suffix: 'final', ext: 'png' },
            { key: `${companyId}/${sku}/${filenamePart}_p.png`, suffix: 'processed', ext: 'png' },
        ];

        // Also try original image extensions
        const originalExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        for (const ext of originalExtensions) {
            candidates.push({
                key: `${companyId}/${sku}/${filenamePart}.${ext}`,
                suffix: 'original',
                ext
            });
        }

        let foundObject: R2ObjectBody | null = null;
        let foundCandidate: typeof candidates[0] | null = null;

        for (const candidate of candidates) {
            logger.debug(`🔍 Trying: ${candidate.key}`);
            try {
                const obj = await c.env.PRODUCT_IMAGES.get(candidate.key);
                if (obj) {
                    foundObject = obj;
                    foundCandidate = candidate;
                    logger.debug(`✅ Found: ${candidate.key} (${candidate.suffix})`);
                    break;
                }
            } catch (e) {
                logger.error(`❌ Failed to check ${candidate.key}:`, e);
            }
        }

        if (!foundObject || !foundCandidate) {
            return c.json({
                error: 'No image available',
                message: '画像が見つかりません'
            }, 404);
        }

        // Convert to base64 for frontend canvas processing
        const arrayBuffer = await foundObject.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64String = buffer.toString('base64');
        const mimeType = foundCandidate.ext === 'png' ? 'image/png'
            : foundCandidate.ext === 'webp' ? 'image/webp'
            : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64String}`;

        const filename = `${sku}_${filenamePart}_${foundCandidate.suffix}.${foundCandidate.ext}`;

        logger.debug(`📝 Returning ${foundCandidate.suffix} image: ${filename} (${base64String.length} chars base64)`);

        return c.json({
            imageUrl: dataUrl,
            filename,
            sku,
            status: foundCandidate.suffix
        });

    } catch (error: any) {
        logError('Download product data', error, { imageId });
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

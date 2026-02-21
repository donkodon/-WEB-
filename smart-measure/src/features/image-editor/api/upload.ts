/**
 * Image Upload API
 *
 * POST /api/upload-image    画像アップロード
 * POST /api/reorder-images  画像順序変更
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const upload = new Hono<AppEnv>()

upload.post('/api/upload-image', async (c) => {
    const body = await c.req.parseBody();
    const file = body['image'];
    const productId = body['productId'];

    if (!file || !(file instanceof File) || !productId) {
        return c.text('Invalid upload', 400);
    }

    const buffer = await file.arrayBuffer();
    const base64String = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;
    const _dataUrl = `data:${mimeType};base64,${base64String}`;

    // images table removed
    return c.json({ success: true });
});

upload.post('/api/reorder-images', async (c) => {
    try {
        const { sku, imageIds } = await c.req.json();

        logger.debug(' Reorder images for SKU:', sku);
        logger.debug('📋 New order:', imageIds);

        if (!sku || !imageIds || !Array.isArray(imageIds)) {
            return c.json({ error: 'Invalid request: sku and imageIds array required' }, 400);
        }

        const result = await c.env.DB.prepare(`
            SELECT image_urls FROM product_items WHERE sku = ?
        `).bind(sku).first();

        if (!result) {
            return c.json({ error: 'SKU not found' }, 404);
        }

        const currentImageUrls = JSON.parse(result.image_urls || '[]');
        logger.debug('📦 Current image_urls:', currentImageUrls);

        if (currentImageUrls.length === 0) {
            return c.json({ error: 'No images found for this SKU' }, 404);
        }

        const newImageUrls: string[] = [];
        for (const imageId of imageIds) {
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length < 2) continue;
            const filenamePart = parts.slice(1).join('_');
            const matchingUrl = currentImageUrls.find((url: string) => {
                const urlFilename = url.split('/').pop() || '';
                const urlFilenamePart = urlFilename.replace(/\.[^/.]+$/, '');
                return urlFilenamePart === filenamePart;
            });
            if (matchingUrl) {
                newImageUrls.push(matchingUrl);
            } else {
                logger.warn(`⚠️ No matching URL found for imageId: ${imageId}`);
            }
        }

        logger.debug(' New image_urls:', newImageUrls);

        if (JSON.stringify(currentImageUrls) === JSON.stringify(newImageUrls)) {
            return c.json({ success: true, message: 'Order unchanged', imageUrls: newImageUrls });
        }

        await c.env.DB.prepare(`
            UPDATE product_items
            SET image_urls = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sku = ?
        `).bind(JSON.stringify(newImageUrls), sku).run();

        logger.debug(' Image order updated successfully for SKU:', sku);

        return c.json({
            success: true,
            imageUrls: newImageUrls,
            message: '画像の順序を更新しました'
        });

    } catch (error: any) {
        logError('Reorder images', error, { sku: '' });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

export default upload

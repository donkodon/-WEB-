/**
 * Edit Settings API
 *
 * GET    /api/edit-settings/:imageId  編集設定をR2から読み込み
 * POST   /api/edit-settings/:imageId  編集設定をR2に保存
 * DELETE /api/edit-settings/:imageId  編集設定をR2から削除
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const editSettings = new Hono<AppEnv>()

/** imageId から { sku, filenamePart } を抽出する共通ヘルパー */
function parseImageId(imageId: string): { sku: string; filenamePart: string } | null {
    if (!imageId.startsWith('r2_')) return null;
    const parts = imageId.split('_');
    if (parts.length < 3) return null;
    return {
        sku: parts[1],
        filenamePart: parts.slice(2).join('_'),
    };
}

editSettings.get('/api/edit-settings/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        logger.debug('📖 Loading edit settings for:', imageId);

        const parsed = parseImageId(imageId);
        if (!parsed) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${parsed.sku}/${parsed.filenamePart}_settings.json`;
        logger.debug('🔍 Looking for settings:', settingsKey);

        const settingsObject = await c.env.PRODUCT_IMAGES.get(settingsKey);
        if (!settingsObject) {
            logger.warn(' No settings found for:', settingsKey);
            return c.json({ exists: false, message: 'No edit settings found' });
        }

        const settingsText = await settingsObject.text();
        const settings = JSON.parse(settingsText);

        logger.debug('✅ Edit settings loaded successfully');
        return c.json({ exists: true, settings });

    } catch (error: any) {
        logError('Load edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

editSettings.post('/api/edit-settings/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        const body = await c.req.json();
        logger.debug('💾 Saving edit settings for:', imageId);

        const parsed = parseImageId(imageId);
        if (!parsed) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${parsed.sku}/${parsed.filenamePart}_settings.json`;

        const { adjustments, eraser_paths } = body;
        const hasEraserPaths = eraser_paths && eraser_paths.length > 0;
        const hasAdjustments = adjustments && (
            adjustments.brightness !== 0 ||
            adjustments.hue !== 0 ||
            adjustments.wb !== 5500
        );

        if (!hasEraserPaths && !hasAdjustments) {
            logger.debug('🗑️ No edits detected, deleting settings file:', settingsKey);
            try {
                await c.env.PRODUCT_IMAGES.delete(settingsKey);
                logger.debug('✅ Settings file deleted');
            } catch {
                logger.warn(' Settings file may not exist, skipping delete');
            }
            return c.json({ success: true, message: 'Settings cleared (file deleted)', imageId });
        }

        const settings = {
            version: '1.0',
            image_id: imageId,
            sku: parsed.sku,
            filename: `${parsed.filenamePart}.jpg`,
            adjustments: adjustments || { brightness: 0, hue: 0, wb: 5500 },
            eraser_paths: eraser_paths || [],
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                edit_count: (eraser_paths || []).length
            }
        };

        await c.env.PRODUCT_IMAGES.put(
            settingsKey,
            JSON.stringify(settings, null, 2),
            { httpMetadata: { contentType: 'application/json' } }
        );

        logger.debug(' Edit settings saved successfully:', settingsKey);
        return c.json({ success: true, message: 'Edit settings saved', imageId, settingsKey });

    } catch (error: any) {
        logError('Save edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

editSettings.delete('/api/edit-settings/:imageId', async (c) => {
    const imageId = c.req.param('imageId');
    try {
        logger.debug('🗑️ Deleting edit settings for:', imageId);

        const parsed = parseImageId(imageId);
        if (!parsed) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${parsed.sku}/${parsed.filenamePart}_settings.json`;

        await c.env.PRODUCT_IMAGES.delete(settingsKey);

        logger.debug(' Edit settings deleted:', settingsKey);
        return c.json({ success: true, message: 'Edit settings deleted', imageId });

    } catch (error: any) {
        logError('Delete edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

export default editSettings

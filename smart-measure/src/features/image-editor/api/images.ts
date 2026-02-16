import { Hono } from 'hono'
import type { R2ObjectBody } from '@cloudflare/workers-types'
import { getR2PublicUrl } from '../helpers/r2-url'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { ImageUrlHelper } from '../helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { markImageAsFinal } from '../helpers/image-status'
import { logger } from '../../../shared/helpers/logger'
import { requireFirebaseAuth } from '../../auth/middleware/auth'

const images = new Hono<AppEnv>()

images.post('/api/upload-image', async (c) => {
    const body = await c.req.parseBody();
    const file = body['image'];
    const productId = body['productId'];

    if (!file || !(file instanceof File) || !productId) {
        return c.text('Invalid upload', 400);
    }

    // In a real app, upload to R2/S3 here.
    // For Sandbox, convert to Base64 to store in D1 (Prototype mode)
    const buffer = await file.arrayBuffer();
    // Safe Base64 conversion using Buffer
    const base64String = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64String}`;

    // images table removed

    return c.json({ success: true });
});

// ============================================================
// === EDIT SETTINGS API (Phase 2.5) ===
// ============================================================

// --- GET /api/edit-settings/:imageId - Load edit settings from R2 ---
images.get('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        logger.debug('📖 Loading edit settings for:', imageId);

        // Validate imageId format (e.g., r2_1025L280001_1025L280001_1)
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename from imageId
        // Format: r2_<SKU>_<filename_without_ext>
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_'); // Handle filenames with underscores
        
        // Build settings key: {company_id}/{sku}/{filename}_settings.json (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;
        logger.debug('🔍 Looking for settings:', settingsKey);

        // Try to fetch settings from R2
        const settingsObject = await c.env.PRODUCT_IMAGES.get(settingsKey);

        if (!settingsObject) {
            logger.warn(' No settings found for:', settingsKey);
            return c.json({ 
                exists: false,
                message: 'No edit settings found'
            });
        }

        // Parse JSON settings
        const settingsText = await settingsObject.text();
        const settings = JSON.parse(settingsText);

        logger.debug('✅ Edit settings loaded successfully');
        return c.json({
            exists: true,
            settings: settings
        });

    } catch (error: any) {
        logError('Load edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

// --- POST /api/edit-settings/:imageId - Save edit settings to R2 ---
images.post('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        const body = await c.req.json();
        logger.debug('💾 Saving edit settings for:', imageId);

        // Validate imageId format
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;

        // Extract data from request body
        const { adjustments, eraser_paths } = body;

        // Check if settings are empty (no eraser paths and default adjustments)
        const hasEraserPaths = eraser_paths && eraser_paths.length > 0;
        const hasAdjustments = adjustments && (
            adjustments.brightness !== 0 ||
            adjustments.hue !== 0 ||
            adjustments.wb !== 5500
        );

        // If empty, delete existing settings file (if any)
        if (!hasEraserPaths && !hasAdjustments) {
            logger.debug('🗑️ No edits detected, deleting settings file:', settingsKey);
            try {
                await c.env.PRODUCT_IMAGES.delete(settingsKey);
                logger.debug('✅ Settings file deleted');
            } catch (deleteError) {
                logger.warn(' Settings file may not exist, skipping delete');
            }
            return c.json({
                success: true,
                message: 'Settings cleared (file deleted)',
                imageId: imageId
            });
        }

        // Build settings JSON structure
        const settings = {
            version: '1.0',
            image_id: imageId,
            sku: sku,
            filename: `${filenamePart}.jpg`,
            adjustments: adjustments || {
                brightness: 0,
                hue: 0,
                wb: 5500
            },
            eraser_paths: eraser_paths || [],
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                edit_count: (eraser_paths || []).length
            }
        };

        // Save to R2 as JSON
        await c.env.PRODUCT_IMAGES.put(
            settingsKey,
            JSON.stringify(settings, null, 2),
            {
                httpMetadata: {
                    contentType: 'application/json'
                }
            }
        );

        logger.debug(' Edit settings saved successfully:', settingsKey);
        return c.json({
            success: true,
            message: 'Edit settings saved',
            imageId: imageId,
            settingsKey: settingsKey
        });

    } catch (error: any) {
        logError('Save edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

// --- DELETE /api/edit-settings/:imageId - Delete edit settings from R2 ---
images.delete('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        logger.debug('🗑️ Deleting edit settings for:', imageId);

        // Validate imageId format
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;

        // Delete from R2
        await c.env.PRODUCT_IMAGES.delete(settingsKey);

        logger.debug(' Edit settings deleted:', settingsKey);
        return c.json({
            success: true,
            message: 'Edit settings deleted',
            imageId: imageId
        });

    } catch (error: any) {
        logError('Delete edit settings', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

// --- API: Download Single Image ---
images.get('/api/download-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        
        // Get image data with product info
        // images table removed
        
        if (!result) {
            return c.json({ error: 'Image not found' }, 404);
        }
        
        // Generate filename
        const sku = (result.sku as string) || 'UNKNOWN';
        const imageIdStr = (result.id as number).toString().padStart(4, '0');
        const filename = `${sku}_original_${imageIdStr}.png`;
        
        return c.json({
            imageUrl: result.original_url,
            filename: filename,
            sku: sku
        });
        
    } catch (error: any) {
        logError('Download image', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});


images.get('/api/download-processed-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        const R2_PUBLIC_URL = getR2PublicUrl(c.env);
        
        // R2画像ID形式: r2_{SKU}_{filename_without_ext}
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }
        
        // Extract SKU from image ID
        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const companyId = getCompanyId(c);
        
        // 新形式で白抜き画像をチェック: {company_id}/{SKU}/{filename}_p.png (Phase 1: Dynamic company_id)
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
        
        // Check if processed image exists
        if (!processedUrl) {
            return c.json({ 
                error: 'No processed image available',
                message: '白抜き処理が完了していません'
            }, 404);
        }
        
        // Generate unique filename using full imageId
        // Extract filename part from imageId (e.g., r2_1025L280001_2 -> 1025L280001_2)
        const imageIdPart = imageId.replace('r2_', '');
        const filename = `${imageIdPart}_processed.png`;
        
        logger.debug(`📝 Generated filename: ${filename} for imageId: ${imageId}`);
        
        // Fetch image data from R2 and convert to base64 to avoid CORS issues
        try {
            const r2Object = await c.env.PRODUCT_IMAGES.get(processedKey);
            if (!r2Object) {
                return c.json({ 
                    error: 'Failed to retrieve image from R2',
                    message: 'R2オブジェクトの取得に失敗しました'
                }, 500);
            }
            
            // Convert R2 object to ArrayBuffer then to base64
            const arrayBuffer = await r2Object.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64String = buffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64String}`;
            
            logger.debug(`✅ Converted image to base64 (${base64String.length} chars)`);
            
            return c.json({
                imageUrl: dataUrl,
                filename: filename,
                sku: sku,
                status: 'completed'
            });
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


images.post('/api/save-edited-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        const body = await c.req.json();
        const imageData = body.imageData;
        
        if (!imageData) {
            return c.json({ error: 'imageData is required' }, 400);
        }
        
        logger.debug('💾 Saving edited image:', imageId);
        
        // Extract SKU and filename from imageId
        // Format: r2_1025L280001_1025L280001_1 → SKU = 1025L280001, filename = 1025L280001_1
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }
        
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }
        
        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        
        // Phase A: Build R2 key for FINAL image: {company_id}/{sku}/{filename}_f.png
        // _f.png = Final/Completed image (with edits applied)
        // _p.png = Processed/White-background only (preserved)
        // Get company_id from cookie (Phase 1 with dynamic company_id)
        const cookies = c.req.header('Cookie') || '';
        const companyIdMatch = cookies.match(/company_id=([^;]+)/);
        const companyId = companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
        const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
        
        logger.debug('📂 Final image key:', finalKey);
        
        // Convert base64 to binary
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const binaryString = atob(base64Data);
        const imageBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            imageBuffer[i] = binaryString.charCodeAt(i);
        }
        
        logger.debug('📊 Image size:', imageBuffer.length, 'bytes');
        
        // Upload to R2 (overwrites existing _f.png)
        await c.env.PRODUCT_IMAGES.put(finalKey, imageBuffer, {
            httpMetadata: {
                contentType: 'image/png'
            }
        });
        
        logger.debug(' Saved final image to R2:', finalKey);
        
        // Update image status in DB to eliminate N+1 problem
        await markImageAsFinal(c.env.DB, sku, companyId, filenamePart);
        
        logger.debug(' Updated image status in DB for SKU:', sku);
        
        return c.json({ 
            success: true,
            imageId,
            finalKey,
            message: 'Final image saved successfully'
        });
        
    } catch (error: any) {
        logError('Save edited image', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

// ========================================
// 商品データDL機能
// ========================================

// --- API: 画像プロキシ（R2からバイナリを直接返す） ---
images.get('/api/image-proxy/:sku/:filename', async (c) => {
    try {
        const { sku, filename } = c.req.param();
        
        logger.debug('🖼️ Image proxy request - SKU:', sku, 'Filename:', filename);
        
        // 1. SKUのバリデーション（英数字とアンダースコアのみ）
        if (!/^[A-Za-z0-9_]+$/.test(sku)) {
            logger.debug('❌ Invalid SKU format:', sku);
            return c.json({ error: 'Invalid SKU format' }, 400);
        }
        
        // 2. ファイル名のバリデーション
        // - パストラバーサル防止（../ や ..\）
        // - スラッシュやバックスラッシュを含まない
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            logger.debug('❌ Invalid filename (path traversal):', filename);
            return c.json({ error: 'Invalid filename' }, 400);
        }
        
        // 3. 拡張子のホワイトリスト
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const hasValidExtension = allowedExtensions.some(ext => 
            filename.toLowerCase().endsWith(ext)
        );
        
        if (!hasValidExtension) {
            logger.debug('❌ Unsupported file type:', filename);
            return c.json({ error: 'Unsupported file type' }, 400);
        }
        
        // 4. ファイル名の長さチェック（DoS攻撃防止）
        if (filename.length > 255) {
            logger.debug('❌ Filename too long:', filename.length);
            return c.json({ error: 'Filename too long' }, 400);
        }
        
        // R2から画像を取得（認証必須）
        let r2Object: R2ObjectBody | null = null;
        let foundKey = '';
        
        // Get company_id from authenticated user
        const user = c.get('user') as { companyId?: string } | undefined;
        const userCompanyId = user?.companyId;
        
        if (!userCompanyId) {
            logger.warn('❌ Authentication required');
            return c.json({ error: 'Authentication required. Please log in.' }, 401);
        }
        
        logger.debug('👤 Authenticated user - company_id:', userCompanyId);
        
        // Query DB to verify SKU belongs to this company (security check)
        let companyIdFromDb: string | null = null;
        try {
            const dbResult = await c.env.DB.prepare(`
                SELECT company_id FROM product_items 
                WHERE sku = ? AND company_id = ?
                LIMIT 1
            `).bind(sku, userCompanyId).first();
            
            if (!dbResult) {
                logger.warn('❌ SKU not found in user company:', { sku, userCompanyId });
                return c.json({ error: 'Image not found in your company' }, 404);
            }
            
            companyIdFromDb = dbResult.company_id as string;
            logger.debug('✅ SKU verified for user company:', companyIdFromDb);
        } catch (error) {
            logger.error('❌ DB query failed:', error);
            return c.json({ error: 'Database error' }, 500);
        }
        
        // Only search in user's company
        const companyIds = [userCompanyId];
        
        // Try each company_id
        for (const tryCompanyId of companyIds) {
            const key = `${tryCompanyId}/${sku}/${filename}`;
            logger.debug('🔍 Trying R2 key:', key);
            
            r2Object = await c.env.PRODUCT_IMAGES.get(key);
            
            if (r2Object) {
                foundKey = key;
                logger.debug('✅ Image found at:', key);
                break;
            }
        }
        
        if (!r2Object) {
            logger.debug('❌ Image not found in any company folder:', companyIds);
            return c.notFound();
        }
        
        // Content-Typeを拡張子から判定
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const contentTypeMap: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';
        
        logger.debug(' Image found - Size:', r2Object.size, 'Type:', contentType);
        
        // バイナリを直接返す（Base64変換なし）
        return new Response(r2Object.body, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': r2Object.size?.toString() || '',
                'Cache-Control': 'public, max-age=0, must-revalidate',
                'ETag': r2Object.httpEtag || '',
                'Last-Modified': r2Object.uploaded?.toUTCString() || ''
            }
        });
        
    } catch (error: any) {
        logError('Image proxy', error, { sku, filename });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

images.post('/api/reorder-images', async (c) => {
    try {
        const { sku, imageIds } = await c.req.json();
        
        logger.debug(' Reorder images for SKU:', sku);
        logger.debug('📋 New order:', imageIds);
        
        if (!sku || !imageIds || !Array.isArray(imageIds)) {
            return c.json({ error: 'Invalid request: sku and imageIds array required' }, 400);
        }
        
        // 1. 現在の image_urls を取得
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
        
        // 2. imageIds の順序に従って image_urls を並び替え
        const newImageUrls: string[] = [];
        
        for (const imageId of imageIds) {
            // imageId = "r2_1025L280001_1025L280001_uuid" から UUID部分を抽出
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length < 2) continue;
            
            // SKU以降の部分を結合（例: "1025L280001_uuid"）
            const filenamePart = parts.slice(1).join('_');
            
            // currentImageUrls から該当するURLを探す
            const matchingUrl = currentImageUrls.find(url => {
                const urlFilename = url.split('/').pop() || '';
                const urlFilenamePart = urlFilename.replace(/\.[^/.]+$/, ''); // 拡張子を除去
                return urlFilenamePart === filenamePart;
            });
            
            if (matchingUrl) {
                newImageUrls.push(matchingUrl);
            } else {
                logger.warn(`⚠️ No matching URL found for imageId: ${imageId}`);
            }
        }
        
        logger.debug(' New image_urls:', newImageUrls);
        
        // 3. 順序が変わっていない場合はスキップ
        if (JSON.stringify(currentImageUrls) === JSON.stringify(newImageUrls)) {
            return c.json({ success: true, message: 'Order unchanged', imageUrls: newImageUrls });
        }
        
        // 4. D1 を更新
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
        logError('Reorder images', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
});

export default images

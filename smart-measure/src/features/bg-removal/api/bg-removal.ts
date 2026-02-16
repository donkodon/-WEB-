/**
 * Background Removal API - 背景除去処理
 * features/bg-removal/api/bg-removal.ts
 * 
 * Endpoints:
 *   POST /api/remove-bg - Basic BG removal (Cloudflare AI)
 *   POST /api/remove-bg-image/:imageId - BG removal for product images
 *   POST /api/remove-bg-measurement/:sku - BG removal for measurement images
 *   POST /api/upload-processed-measurement/:sku - Upload processed measurement image
 *   POST /api/upload-processed-image/:sku - Upload processed image
 */
import { Hono } from 'hono'
import type { AppEnv, CloudflareAI } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { ImageUrlHelper } from '../../image-editor/helpers/image-url'
import { markImageAsProcessed } from '../../image-editor/helpers/image-status'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const bgRemoval = new Hono<AppEnv>()

// ============================================================
// Helper Functions
// ============================================================

/**
 * Cloudflare AI Background Removal
 */
async function removeBackgroundWithCloudflareAI(
    ai: CloudflareAI,
    imageUrl: string
): Promise<{ success: boolean; imageBuffer?: ArrayBuffer; error?: string }> {
    try {
        logger.debug('🤖 Using Cloudflare AI for background removal...');
        
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const imageBuffer = await response.arrayBuffer();
        
        const result = await ai.run('@cf/bria/rmbg-1.4', {
            image: [...new Uint8Array(imageBuffer)]
        });
        
        return { success: true, imageBuffer: result };
    } catch (error: any) {
        logger.error('Cloudflare AI failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * withoutBG API Background Removal (Free, Hugging Face Spaces)
 */
async function removeBackgroundWithWithoutBG(
    imageUrl: string
): Promise<{ success: boolean; imageDataUrl?: string; maskDataUrl?: string; error?: string }> {
    try {
        console.log('🎨 [removeBackgroundWithWithoutBG] Starting... imageUrl:', imageUrl?.substring(0, 100));
        
        let requestBody: any;
        
        if (imageUrl.startsWith('data:')) {
            logger.debug('📦 Detected base64 data URL, extracting base64 data...');
            
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }
            
            const base64Data = matches[2];
            logger.debug(`📊 Base64 data length: ${base64Data.length} characters`);
            
            requestBody = {
                image_base64: base64Data,
                return_mask: true
            };
        } else {
            requestBody = {
                image_url: imageUrl,
                return_mask: true
            };
        }
        
        console.log('📡 [removeBackgroundWithWithoutBG] Sending request to withoutBG API...');
        console.log('📡 Request body:', JSON.stringify(requestBody).substring(0, 200));
        
        const response = await fetch('https://jinkedon-withoutbg-api.hf.space/api/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📡 [removeBackgroundWithWithoutBG] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [removeBackgroundWithWithoutBG] API error:', errorText);
            throw new Error(`withoutBG API failed: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📡 [removeBackgroundWithWithoutBG] Got result:', result?.success);
        
        if (!result.success || !result.image_data) {
            throw new Error(result.error || 'Invalid response from withoutBG API');
        }
        
        logger.debug('✅ withoutBG Focus background removal completed');
        logger.debug(`🎭 Mask data available: ${!!result.mask_data}`);
        
        return {
            success: true,
            imageDataUrl: result.image_data,
            maskDataUrl: result.mask_data
        };
    } catch (error: any) {
        logger.error('withoutBG API failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fal.ai BRIA RMBG API (Cloud-based)
 */
async function callBriaApi(
    imageUrl: string,
    apiKey: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
        logger.debug('🌐 Calling Fal.ai BRIA RMBG API...');
        
        const submitResponse = await fetch('https://queue.fal.run/fal-ai/birefnet', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image_url: imageUrl })
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Fal.ai submit failed: ${submitResponse.status} - ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { request_id?: string; status?: string; response_url?: string };
        logger.debug('📤 Fal.ai job submitted:', submitResult);

        const requestId = submitResult.request_id;
        if (!requestId) {
            throw new Error('No request_id returned from Fal.ai');
        }

        // Poll for completion (max 60 seconds)
        let result: any = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const statusResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}/status`, {
                headers: { 'Authorization': `Key ${apiKey}` }
            });

            if (!statusResponse.ok) continue;

            const statusResult = await statusResponse.json() as { status: string };
            logger.debug(`📊 Fal.ai status: ${statusResult.status}`);

            if (statusResult.status === 'COMPLETED') {
                const resultResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}`, {
                    headers: { 'Authorization': `Key ${apiKey}` }
                });
                if (resultResponse.ok) {
                    result = await resultResponse.json();
                    break;
                }
            } else if (statusResult.status === 'FAILED') {
                throw new Error('Fal.ai processing failed');
            }
        }

        if (!result) {
            throw new Error('Fal.ai processing timeout');
        }

        const outputUrl = result.image?.url;
        if (!outputUrl) {
            throw new Error('No output image URL from Fal.ai');
        }

        logger.debug('Fal.ai BRIA processing complete:', outputUrl);
        return { success: true, imageUrl: outputUrl };

    } catch (error: any) {
        logger.error('Fal.ai BRIA API error:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================
// API Endpoints
// ============================================================

/**
 * POST /api/remove-bg - Basic background removal using Cloudflare AI
 */
bgRemoval.post('/api/remove-bg', async (c) => {
    try {
        const body = await c.req.parseBody();
        const imageUrl = body['imageUrl'] as string;
        
        if (!imageUrl) {
            return c.json({ error: 'imageUrl is required' }, 400);
        }

        logger.debug('🚀 Using Cloudflare AI for background removal');
        
        const result = await removeBackgroundWithCloudflareAI(c.env.AI, imageUrl);
        
        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Cloudflare AI processing failed');
        }

        const base64 = btoa(new Uint8Array(result.imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const processedDataUrl = `data:image/png;base64,${base64}`;

        return c.json({
            success: true,
            processedUrl: processedDataUrl,
            message: 'Background removed using Cloudflare AI (Free)'
        });

    } catch (error: any) {
        logError('Background removal (basic)', error);
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

/**
 * POST /api/remove-bg-image/:imageId - BG removal for product images
 */
bgRemoval.post('/api/remove-bg-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        let model = 'cloudflare-ai';
        let useBriaApi = false;
        
        try {
             const body = await c.req.json();
             if (body && body.model) model = body.model;
             if (body && body.useBriaApi) useBriaApi = body.useBriaApi;
        } catch (e) {
            // No JSON body or parse error, use defaults
        }
        
        let originalUrl: string;
        let sku: string;
        let filenamePart: string;
        let companyId: string;
        
        if (imageId.startsWith('r2_')) {
            const R2_PUBLIC_URL = getR2PublicUrl(c.env);
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length >= 2) {
                sku = parts[0];
                filenamePart = parts.slice(1).join('_');
                companyId = getCompanyId(c);
                
                console.log('🔍 Debug info:', JSON.stringify({
                    imageId,
                    sku,
                    filenamePart,
                    companyId,
                    cookies: c.req.header('Cookie'),
                    R2_PUBLIC_URL
                }, null, 2));
                
                const extensions = ['jpg', 'jpeg', 'png', 'webp'];
                const companyIds = [companyId, 'relight', 'saisunsatsuei', 'test_company']; // Try multiple company IDs
                let found = false;
                let actualCompanyId = companyId;
                
                // Try each company ID and extension combination
                for (const tryCompanyId of companyIds) {
                    for (const ext of extensions) {
                        const testKey = `${tryCompanyId}/${sku}/${filenamePart}.${ext}`;
                        
                        // Try R2 head first (local/production R2 bucket)
                        if (c.env.PRODUCT_IMAGES) {
                            const obj = await c.env.PRODUCT_IMAGES.head(testKey);
                            if (obj) {
                                originalUrl = `${R2_PUBLIC_URL}/${testKey}`;
                                actualCompanyId = tryCompanyId;
                                found = true;
                                console.log(`✅ Found R2 image via R2 API: ${testKey}`);
                                break;
                            }
                        }
                        
                        // Fallback: Try HTTP HEAD request to public R2 URL
                        // (This works when local R2 doesn't have the file but production R2 does)
                        if (!found) {
                            const testUrl = `${R2_PUBLIC_URL}/${testKey}`;
                            try {
                                const headResponse = await fetch(testUrl, { method: 'HEAD' });
                                if (headResponse.ok) {
                                    originalUrl = testUrl;
                                    actualCompanyId = tryCompanyId;
                                    found = true;
                                    console.log(`✅ Found R2 image via HTTP HEAD: ${testKey}`);
                                    break;
                                }
                            } catch (e) {
                                // Ignore fetch errors
                            }
                        }
                    }
                    if (found) break;
                }
                
                if (!found) {
                    // Image not found in R2 - return 404
                    console.error(`❌ Image not found in R2 after trying multiple company IDs`);
                    return c.json({ 
                        error: `Image not found: ${imageId}. Please upload the image first.`,
                        details: `Searched for: ${companyIds.map(cid => `${cid}/${sku}/${filenamePart}.{jpg,jpeg,png,webp}`).join(', ')}`
                    }, 404);
                }
                
                // Update companyId to the one that actually worked
                // (overwrite the original variable so subsequent code uses the correct company ID)
                companyId = actualCompanyId;
            } else {
                return c.json({ error: 'Invalid R2 image ID format' }, 400);
            }
            
            logger.debug(`📸 Processing R2 image: ${imageId} -> ${originalUrl}`);
        } else {
            return c.json({ error: 'Unsupported image ID format. Use r2_{SKU}_{filename} format.' }, 400);
        }

        // Priority 1: Fal.ai BRIA API
        const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY;
        const isBriaKeyValid = briaApiKey && briaApiKey !== 'demo' && briaApiKey !== 'your-fal-api-key-here';
        
        if (isBriaKeyValid && (useBriaApi || model === 'bria')) {
            logger.debug('🌐 Using Fal.ai BRIA RMBG 2.0 API (cloud-based)');
            
            if (!originalUrl.startsWith('data:')) {
                const briaResult = await callBriaApi(originalUrl, briaApiKey);
                
                if (briaResult.success && briaResult.imageUrl) {
                    const imageResponse = await fetch(briaResult.imageUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    
                    const parts = imageId.replace('r2_', '').split('_');
                    const sku = parts[0];
                    const filenamePart = parts.slice(1).join('_');
                    const companyId = getCompanyId(c);
                    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                    
                    if (c.env.PRODUCT_IMAGES) {
                        await c.env.PRODUCT_IMAGES.put(r2Key, imageBuffer, {
                            httpMetadata: { contentType: 'image/png' }
                        });
                        logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`);
                        await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                    }
                    
                    const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
                    logger.debug(`✅ Processed image saved to R2 and DB status updated: ${r2Key}`);

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl,
                        message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)'
                    });
                } else {
                    logger.error('BRIA API failed, falling back:', briaResult.error);
                }
            } else {
                logger.warn('Data URL detected, falling back to withoutBG');
            }
        }

        // Priority 2: withoutBG Focus (Always try first for URL images)
        const isBase64Image = originalUrl.startsWith('data:');
        
        console.log('🔍 isBase64Image:', isBase64Image, 'originalUrl:', originalUrl?.substring(0, 100));
        
        if (!isBase64Image) {
            console.log('🚀 Starting withoutBG Focus model for background removal (URL mode)');
            
            try {
                console.log('📡 Calling removeBackgroundWithWithoutBG...');
                const result = await removeBackgroundWithWithoutBG(originalUrl);
                console.log('📡 withoutBG result:', result ? 'Got result' : 'No result', result?.success);
                
                if (!result.success || !result.imageDataUrl) {
                    throw new Error(result.error || 'withoutBG processing failed');
                }

                console.log('✅ withoutBG success, converting base64 to bytes...');
                const base64Data = result.imageDataUrl.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                console.log(`📊 Converted ${bytes.length} bytes`);
                
                const parts = imageId.replace('r2_', '').split('_');
                const sku = parts[0];
                const filenamePart = parts.slice(1).join('_');
                // Use companyId from the outer scope (already found the correct one)
                const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                
                console.log(`📤 Uploading to R2: ${r2Key}`);
                if (c.env.PRODUCT_IMAGES) {
                    await c.env.PRODUCT_IMAGES.put(r2Key, bytes, {
                        httpMetadata: { contentType: 'image/png' }
                    });
                    console.log(`✅ Uploaded processed image to R2: ${r2Key}`);
                    // Temporarily skip DB update to test
                    // await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                }
                
                const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
                console.log(`🎉 Success! Processed URL: ${processedUrl}`);

                return c.json({ 
                    success: true,
                    imageId,
                    processedUrl,
                    message: 'Background removed using withoutBG Focus (Free)'
                });
            } catch (apiError: any) {
                console.error('❌ withoutBG processing error:', apiError.message);
                console.error('❌ Error stack:', apiError.stack);
                // Fall through to Cloudflare AI
            }
        } else {
            logger.debug('📦 Base64 image detected - skipping withoutBG (not supported)');
        }

        // Priority 3: Cloudflare AI (Fallback)
        if (c.env.AI) {
            logger.debug('🤖 Using Cloudflare AI @cf/bria/rmbg-2.0 as fallback');
            
            try {
                const result = await removeBackgroundWithCloudflareAI(c.env.AI, originalUrl);
                
                if (result.success && result.imageBuffer) {
                    const parts = imageId.replace('r2_', '').split('_');
                    const sku = parts[0];
                    const filenamePart = parts.slice(1).join('_');
                    const companyId = getCompanyId(c);
                    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                    
                    if (c.env.PRODUCT_IMAGES) {
                        await c.env.PRODUCT_IMAGES.put(r2Key, result.imageBuffer, {
                            httpMetadata: { contentType: 'image/png' }
                        });
                        logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`);
                        await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                    }
                    
                    const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
                    logger.debug(`✅ Processed image saved to R2: ${r2Key}`);

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl,
                        message: 'Background removed using Cloudflare AI (Free)'
                    });
                } else {
                    logger.error('❌ Cloudflare AI failed:', result.error);
                    throw new Error(result.error || 'Cloudflare AI processing failed');
                }
            } catch (aiError: any) {
                logger.error('❌ Cloudflare AI error:', aiError.message);
                throw aiError;
            }
        }

        // No more services available
        logger.error('❌ All background removal services failed');
        throw new Error('Background removal failed: All services are unavailable. Please try again later.');

    } catch (error: any) {
        logError('Background removal (image ID)', error);
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

/**
 * POST /api/remove-bg-measurement/:sku - BG removal for measurement images
 */
bgRemoval.post('/api/remove-bg-measurement/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        
        logger.debug(`🎯 Starting background removal for measurement image: SKU ${sku}, Company ${companyId}`);
        
        const result = await c.env.DB.prepare(`
            SELECT COALESCE(measurement_image_url, annotated_image_url) as image_url
            FROM product_items
            WHERE sku = ? AND company_id = ?
            LIMIT 1
        `).bind(sku, companyId).first();
        
        if (!result || !result.image_url) {
            return c.json({ error: 'Measurement image not found for this SKU' }, 404);
        }
        
        const originalUrl = result.image_url as string;
        logger.debug(`📸 Original measurement image URL: ${originalUrl}`);
        
        logger.debug('🚀 Using withoutBG Focus model for measurement image');
        const bgResult = await removeBackgroundWithWithoutBG(originalUrl);
        
        if (!bgResult.success || !bgResult.imageDataUrl) {
            throw new Error(bgResult.error || 'withoutBG processing failed');
        }
        
        logger.debug('✅ withoutBG processing completed, returning data URL to client');
        logger.debug(`🎭 Mask data available: ${!!bgResult.maskDataUrl}`);
        
        return c.json({
            success: true,
            sku,
            processedDataUrl: bgResult.imageDataUrl,
            maskDataUrl: bgResult.maskDataUrl,
            message: 'Measurement image background removed, ready for resize'
        });
        
    } catch (error: any) {
        logError('Measurement image BG removal', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

/**
 * POST /api/upload-processed-measurement/:sku - Upload processed measurement image
 */
bgRemoval.post('/api/upload-processed-measurement/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        const body = await c.req.json();
        
        logger.debug(`📤 Uploading resized measurement image: SKU ${sku}, Company ${companyId}`);
        
        if (!body.imageDataUrl) {
            return c.json({ error: 'imageDataUrl is required' }, 400);
        }
        
        const base64Data = body.imageDataUrl.split(',')[1];
        const processedImageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        
        const timestamp = Date.now();
        const r2Key = `${companyId}/${sku}/measurement_${timestamp}_p.png`;
        
        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, processedImageBuffer, {
                httpMetadata: { contentType: 'image/png' }
            });
            logger.debug(`✅ Uploaded resized measurement image to R2: ${r2Key}`);
        }
        
        const processedUrl = ImageUrlHelper.toFullUrl(r2Key);
        
        // Upload mask image if provided
        let maskUrl = null;
        if (body.maskDataUrl) {
            logger.debug(`🎭 Uploading mask image for SKU ${sku}`);
            const maskBase64Data = body.maskDataUrl.split(',')[1];
            const maskImageBuffer = Uint8Array.from(atob(maskBase64Data), c => c.charCodeAt(0)).buffer;
            
            const maskR2Key = `${companyId}/${sku}/mask_${timestamp}.png`;
            
            if (c.env.PRODUCT_IMAGES) {
                await c.env.PRODUCT_IMAGES.put(maskR2Key, maskImageBuffer, {
                    httpMetadata: { contentType: 'image/png' }
                });
                logger.debug(`✅ Uploaded mask image to R2: ${maskR2Key}`);
            }
            
            maskUrl = ImageUrlHelper.toFullUrl(maskR2Key);
        }
        
        await c.env.DB.prepare(`
            UPDATE product_items
            SET measurement_image_url = ?, mask_image_url = ?, updated_at = ?
            WHERE sku = ? AND company_id = ?
        `).bind(processedUrl, maskUrl, new Date().toISOString(), sku, companyId).run();
        
        logger.debug(`✅ Updated product_items with resized measurement image URL and mask URL`);
        
        return c.json({
            success: true,
            sku,
            processedUrl,
            maskUrl,
            message: 'Resized measurement image uploaded successfully'
        });
        
    } catch (error: any) {
        logError('Measurement image upload', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

/**
 * POST /api/upload-processed-image/:sku - Upload processed image
 */
bgRemoval.post('/api/upload-processed-image/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        const { imageDataUrl, filenamePart } = await c.req.json();
        
        if (!imageDataUrl || !imageDataUrl.startsWith('data:image/png;base64,')) {
            return c.json({ error: 'Invalid image data' }, 400);
        }
        
        if (!filenamePart) {
            return c.json({ error: 'filenamePart is required' }, 400);
        }
        
        logger.debug(`📤 Uploading processed image for SKU ${sku}, filename: ${filenamePart}`);
        
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
        logger.debug(`🗂️ R2 key: ${r2Key}`);
        
        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
                httpMetadata: { contentType: 'image/png' }
            });
            
            logger.debug(`✅ Processed image uploaded to R2: ${r2Key}`);
            
            const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`;
            logger.debug(`🌐 Public URL: ${processedUrl}`);
            
            return c.json({
                success: true,
                sku,
                processedUrl,
                r2Key,
                message: 'Processed image uploaded successfully'
            });
        } else {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }
    } catch (error: any) {
        logError('Upload processed image', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500);
    }
});

export default bgRemoval

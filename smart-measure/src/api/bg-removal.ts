import { Hono } from 'hono'
import { getR2PublicUrl } from '../helpers/r2-url'
import type { AppEnv, CloudflareAI } from '../types/bindings'
import { getCompanyId } from '../helpers/auth'
import { ImageUrlHelper } from '../helpers/image-url'
import { Buffer } from 'node:buffer'
import { createSafeErrorResponse, ErrorCode, logError } from '../helpers/error-handler'
import { markImageAsProcessed, markImageAsFinal } from '../helpers/image-status'
import { logger } from '../helpers/logger'

const bgRemoval = new Hono<AppEnv>()

// --- Helper: Cloudflare AI Background Removal (stub - was referenced but undefined) ---
async function removeBackgroundWithCloudflareAI(ai: CloudflareAI, imageUrl: string): Promise<{ success: boolean; imageBuffer?: ArrayBuffer; error?: string }> {
    try {
        logger.debug('🤖 Using Cloudflare AI for background removal...');
        
        // Fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const imageBuffer = await response.arrayBuffer();
        
        // Call Cloudflare AI
        const result = await ai.run('@cf/bria/rmbg-2.0', {
            image: [...new Uint8Array(imageBuffer)]
        });
        
        return { success: true, imageBuffer: result };
    } catch (error: any) {
        logger.error(' Cloudflare AI failed:', error.message);
        return { success: false, error: error.message };
    }
}

bgRemoval.post('/api/remove-bg', async (c) => {
    try {
        const body = await c.req.parseBody();
        const imageUrl = body['imageUrl'] as string;
        const model = (body['model'] as string) || 'cloudflare-ai';  // Default to Cloudflare AI (free, built-in)
        
        if (!imageUrl) {
            return c.json({ error: 'imageUrl is required' }, 400);
        }

        // Use Cloudflare AI Workers for background removal (Free, built-in)
        logger.debug('🚀 Using Cloudflare AI for background removal');
        
        const result = await removeBackgroundWithCloudflareAI(c.env.AI, imageUrl);
        
        if (!result.success || !result.imageBuffer) {
            throw new Error(result.error || 'Cloudflare AI processing failed');
        }

        // Convert to base64 data URL
        const base64 = btoa(new Uint8Array(result.imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const processedDataUrl = `data:image/png;base64,${base64}`;

        return c.json({
            success: true,
            processedUrl: processedDataUrl,
            message: 'Background removed using Cloudflare AI (Free)'
        });

    } catch (error: any) {
        logError('Background removal (basic)', error, { imageUrl, model });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});

// --- Helper: withoutBG API Background Removal (Free, Hugging Face Spaces) ---
async function removeBackgroundWithWithoutBG(imageUrl: string): Promise<{ success: boolean; imageDataUrl?: string; maskDataUrl?: string; error?: string }> {
    try {
        logger.debug('🎨 Using withoutBG Focus model (Hugging Face Spaces)...');
        
        let requestBody: any;
        
        // Check if it's a base64 data URL
        if (imageUrl.startsWith('data:')) {
            logger.debug('📦 Detected base64 data URL, extracting base64 data...');
            
            // Extract base64 data from data URL
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }
            
            const base64Data = matches[2];
            logger.debug(`📊 Base64 data length: ${base64Data.length} characters`);
            
            // Use image_base64 parameter for base64 data
            requestBody = {
                image_base64: base64Data,
                return_mask: true  // Request mask image
            };
        } else {
            // Regular URL
            requestBody = {
                image_url: imageUrl,
                return_mask: true  // Request mask image
            };
        }
        
        // Call Hugging Face Space API (Flask/Docker API)
        const response = await fetch('https://jinkedon-withoutbg-api.hf.space/api/remove-bg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`withoutBG API failed: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Flask returns: { success: true, image_data: "data:image/png;base64,...", mask_data: "data:image/png;base64,..." }
        if (!result.success || !result.image_data) {
            throw new Error(result.error || 'Invalid response from withoutBG API');
        }
        
        logger.debug('✅ withoutBG Focus background removal completed');
        logger.debug(`🎭 Mask data available: ${!!result.mask_data}`);
        
        return {
            success: true,
            imageDataUrl: result.image_data,  // Already a data URL
            maskDataUrl: result.mask_data  // Mask image as data URL
        };
    } catch (error: any) {
        logger.error(' withoutBG API failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// --- Helper: Call Fal.ai BRIA RMBG API (Cloud-based, no local memory issues) ---
async function callBriaApi(imageUrl: string, apiKey: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
        logger.debug('🌐 Calling Fal.ai BRIA RMBG API...');
        
        // Step 1: Submit the job to Fal.ai
        const submitResponse = await fetch('https://queue.fal.run/fal-ai/birefnet', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl,
            })
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Fal.ai submit failed: ${submitResponse.status} - ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { request_id?: string; status?: string; response_url?: string };
        logger.debug('📤 Fal.ai job submitted:', submitResult);

        // Step 2: Poll for result (Fal.ai queue system)
        const requestId = submitResult.request_id;
        if (!requestId) {
            throw new Error('No request_id returned from Fal.ai');
        }

        // Poll for completion (max 60 seconds)
        let result: any = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            const statusResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}/status`, {
                headers: {
                    'Authorization': `Key ${apiKey}`,
                }
            });

            if (!statusResponse.ok) {
                continue;
            }

            const statusResult = await statusResponse.json() as { status: string };
            logger.debug(`📊 Fal.ai status: ${statusResult.status}`);

            if (statusResult.status === 'COMPLETED') {
                // Get the result
                const resultResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}`, {
                    headers: {
                        'Authorization': `Key ${apiKey}`,
                    }
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

        // Get the output image URL
        const outputUrl = result.image?.url;
        if (!outputUrl) {
            throw new Error('No output image URL from Fal.ai');
        }

        logger.debug(' Fal.ai BRIA processing complete:', outputUrl);
        return { success: true, imageUrl: outputUrl };

    } catch (error: any) {
        logger.error(' Fal.ai BRIA API error:', error.message);
        return { success: false, error: error.message };
    }
}


// --- Helper: Add white background to transparent PNG ---
async function addWhiteBackground(imageUrl: string): Promise<string> {
    // Fetch the transparent PNG
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    
    // Return as data URL (PNG with transparency)
    // Note: Client-side can add white background, or we can process it here
    const base64 = btoa(
        new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    return `data:image/png;base64,${base64}`;
}

bgRemoval.post('/api/remove-bg-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        let model = 'cloudflare-ai';  // Default to Cloudflare AI (free, built-in)
        let useBriaApi = false;  // Whether to use Fal.ai BRIA API
        
        try {
             // Try to parse body if exists for model selection
             const body = await c.req.json();
             if (body && body.model) {
                 model = body.model;
             }
             if (body && body.useBriaApi) {
                 useBriaApi = body.useBriaApi;
             }
        } catch (e) {
            // No JSON body or parse error, ignore and use default
        }
        
        // Check image ID format and get original URL
        let originalUrl: string;
        let isR2Image = false;
        let isProductItemImage = false;
        let dbImageId: number | null = null;
        let productId: number | null = null;
        let itemId: number | null = null;
        let imageIndex: number | null = null;
        
        if (imageId.startsWith('r2_')) {
            // R2 image format: r2_{SKU}_{filename_without_ext}
            isR2Image = true;
            const R2_PUBLIC_URL = getR2PublicUrl(c.env);
            
            // Extract SKU and filename: r2_1025L280003_image1 -> 1025L280003/image1.jpg
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length >= 2) {
                const sku = parts[0];
                const filenamePart = parts.slice(1).join('_');
                const companyId = getCompanyId(c);
                
                // Try common image extensions
                const extensions = ['jpg', 'jpeg', 'png', 'webp'];
                let found = false;
                
                for (const ext of extensions) {
                    const testKey = `${companyId}/${sku}/${filenamePart}.${ext}`;
                    const testUrl = `${R2_PUBLIC_URL}/${testKey}`;
                    
                    // Test if file exists in R2
                    if (c.env.PRODUCT_IMAGES) {
                        const obj = await c.env.PRODUCT_IMAGES.head(testKey);
                        if (obj) {
                            originalUrl = testUrl;
                            found = true;
                            logger.debug(`✅ Found R2 image: ${testKey}`);
                            break;
                        }
                    }
                }
                
                if (!found) {
                    // Fallback: assume .jpg
                    originalUrl = `${R2_PUBLIC_URL}/${sku}/${filenamePart}.jpg`;
                    logger.debug(`⚠️ Assuming JPG format: ${originalUrl}`);
                }
            } else {
                return c.json({ error: 'Invalid R2 image ID format' }, 400);
            }
            
            logger.debug(`📸 Processing R2 image: ${imageId} -> ${originalUrl}`);
        } else {
            // Legacy format or unknown
            return c.json({ error: 'Unsupported image ID format. Use r2_{SKU}_{filename} format.' }, 400);
        }

        // ==========================================
        // Priority 0: Use withoutBG Focus (Free, Hugging Face Spaces) - Always try first for URL images
        // ==========================================
        const isBase64Image = originalUrl.startsWith('data:');
        
        if (!isBase64Image) {
            logger.debug('🚀 Using withoutBG Focus model for background removal (URL mode)');
            
            try {
                const result = await removeBackgroundWithWithoutBG(originalUrl);
                
                if (!result.success || !result.imageDataUrl) {
                    throw new Error(result.error || 'withoutBG processing failed');
                }

                // Convert data URL to binary buffer for R2 upload
                const base64Data = result.imageDataUrl.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Upload to R2 bucket
                const parts = imageId.replace('r2_', '').split('_');
                const sku = parts[0];
                const filenamePart = parts.slice(1).join('_');
                const companyId = getCompanyId(c);
                const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                
                if (c.env.PRODUCT_IMAGES) {
                    await c.env.PRODUCT_IMAGES.put(r2Key, bytes, {
                        httpMetadata: {
                            contentType: 'image/png'
                        }
                    });
                    logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`);
                    
                    // Update image status in DB
                    await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                }
                
                // Get R2 public URL
                const R2_PUBLIC_URL = getR2PublicUrl(c.env);
                const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
                
                logger.debug(`✅ Processed image saved to R2 and status updated: ${r2Key}`);

                return c.json({ 
                    success: true,
                    imageId,
                    processedUrl: processedUrl,
                    message: 'Background removed using withoutBG Focus (Free)'
                });
            } catch (apiError: any) {
                logger.error('❌ withoutBG API failed:', apiError.message);
                // Fall through to try Cloudflare AI as fallback
            }
        } else {
            logger.debug('📦 Base64 image detected - skipping withoutBG (not supported)');
        }

        // ==========================================
        // Priority 1: Use Cloudflare AI (Fallback for base64 or if withoutBG fails)
        // ==========================================
        if (c.env.AI) {
            logger.debug('🤖 Using Cloudflare AI @cf/bria/rmbg-2.0 for background removal');
            
            try {
                const result = await removeBackgroundWithCloudflareAI(c.env.AI, originalUrl);
                
                if (result.success && result.imageBuffer) {
                    // Upload to R2 bucket
                    const parts = imageId.replace('r2_', '').split('_');
                    const sku = parts[0];
                    const filenamePart = parts.slice(1).join('_');
                    const companyId = getCompanyId(c);
                    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                    
                    if (c.env.PRODUCT_IMAGES) {
                        await c.env.PRODUCT_IMAGES.put(r2Key, result.imageBuffer, {
                            httpMetadata: {
                                contentType: 'image/png'
                            }
                        });
                        logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`);
                        
                        // Update image status in DB
                        await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                    }
                    
                    // Get R2 public URL
                    const R2_PUBLIC_URL = getR2PublicUrl(c.env);
                    const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
                    
                    logger.debug(`✅ Processed image saved to R2 and status updated: ${r2Key}`);

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl: processedUrl,
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

        // ==========================================
        // Priority 1: Use Fal.ai BRIA API if configured (Cloud-based, no OOM issues)
        // ==========================================
        const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY;
        const isBriaKeyValid = briaApiKey && briaApiKey !== 'demo' && briaApiKey !== 'your-fal-api-key-here';
        
        if (isBriaKeyValid && (useBriaApi || model === 'bria')) {
            logger.debug('🌐 Using Fal.ai BRIA RMBG 2.0 API (cloud-based)');
            
            // For data URLs, we need to upload first or use local processing
            if (originalUrl.startsWith('data:')) {
                logger.warn(' Data URL detected, falling back to local rembg for BRIA');
            } else {
                const briaResult = await callBriaApi(originalUrl, briaApiKey);
                
                if (briaResult.success && briaResult.imageUrl) {
                    // Fetch the processed image
                    const imageResponse = await fetch(briaResult.imageUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    
                    // Upload to R2 bucket
                    // 新形式: {company_id}/{SKU}/{filename}_p.png（processedフォルダ廃止）
                    // 例: r2_1025L280001_1025L280001_1 → test_company/1025L280001/1025L280001_1_p.png
                    const parts = imageId.replace('r2_', '').split('_');
                    const sku = parts[0];
                    const filenamePart = parts.slice(1).join('_');
                    const companyId = getCompanyId(c);
                    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                    
                    if (c.env.PRODUCT_IMAGES) {
                        await c.env.PRODUCT_IMAGES.put(r2Key, imageBuffer, {
                            httpMetadata: {
                                contentType: 'image/png'
                            }
                        });
                        logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`);
                        
                        // Update DB status to eliminate N+1 R2 queries
                        await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart);
                    }
                    
                    // Get R2 public URL
                    const R2_PUBLIC_URL = getR2PublicUrl(c.env);
                    const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
                    
                    logger.debug(`✅ Processed image saved to R2 and DB status updated: ${r2Key}`);

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl: processedUrl,
                        message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)'
                    });
                } else {
                    logger.error(' BRIA API failed, falling back to local rembg:', briaResult.error);
                }
            }
        }

        // No more background removal services available
        logger.error('❌ All background removal services failed');
        throw new Error('Background removal failed: All services are unavailable. Please try again later.');

    } catch (error: any) {
        logError('Background removal (image ID)', error, { imageId, model });
        // Temporary debug: return actual error message
        return c.json({ 
            success: false, 
            error: error.message || String(error),
            stack: error.stack,
            errorCode: 'EXTERNAL_API_ERROR' 
        }, 500);
    }
});

// --- API: Remove Background for Measurement Image ---
bgRemoval.post('/api/remove-bg-measurement/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        
        logger.debug(`🎯 Starting background removal for measurement image: SKU ${sku}, Company ${companyId}`);
        
        // Get measurement image URL from product_items
        // Priority: measurement_image_url > annotated_image_url
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
        
        // Use withoutBG Focus model for background removal
        logger.debug('🚀 Using withoutBG Focus model for measurement image');
        const bgResult = await removeBackgroundWithWithoutBG(originalUrl);
        
        if (!bgResult.success || !bgResult.imageDataUrl) {
            throw new Error(bgResult.error || 'withoutBG processing failed');
        }
        
        // Return the processed image as data URL (no upload yet)
        // Client will resize and center, then upload via separate endpoint
        logger.debug('✅ withoutBG processing completed, returning data URL to client');
        logger.debug(`🎭 Mask data available: ${!!bgResult.maskDataUrl}`);
        
        return c.json({
            success: true,
            sku,
            processedDataUrl: bgResult.imageDataUrl,
            maskDataUrl: bgResult.maskDataUrl,  // Include mask data URL
            message: 'Measurement image background removed, ready for resize'
        });
        
    } catch (error: any) {
        logError('Measurement image BG removal', error, { sku });
        return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500);
    }
});


bgRemoval.post('/api/upload-processed-measurement/:sku', async (c) => {
    try {
        const sku = c.req.param('sku');
        const companyId = getCompanyId(c);
        const body = await c.req.json();
        
        logger.debug(`📤 Uploading resized measurement image: SKU ${sku}, Company ${companyId}`);
        
        if (!body.imageDataUrl) {
            return c.json({ error: 'imageDataUrl is required' }, 400);
        }
        
        // Convert data URL to buffer
        const base64Data = body.imageDataUrl.split(',')[1];
        const processedImageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        
        // Upload to R2
        const timestamp = Date.now();
        const r2Key = `${companyId}/${sku}/measurement_${timestamp}_p.png`;
        
        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, processedImageBuffer, {
                httpMetadata: {
                    contentType: 'image/png'
                }
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
                    httpMetadata: {
                        contentType: 'image/png'
                    }
                });
                logger.debug(`✅ Uploaded mask image to R2: ${maskR2Key}`);
            }
            
            maskUrl = ImageUrlHelper.toFullUrl(maskR2Key);
        }
        
        // Update product_items with processed measurement image URL and mask URL
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


// NOTE: Mask APIs (update-mask, save-mask, regenerate-with-mask) have been moved to
// features/mask/api/mask.ts


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
        
        // Decode base64
        const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        // Generate R2 key: {company_id}/{sku}/{filenamePart}_p.png (overwrite existing)
        const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
        
        logger.debug(`🗂️ R2 key: ${r2Key}`);
        
        if (c.env.PRODUCT_IMAGES) {
            // Upload to R2 (overwrite existing _p.png)
            await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
                httpMetadata: {
                    contentType: 'image/png'
                }
            });
            
            logger.debug(`✅ Processed image uploaded to R2: ${r2Key}`);
            
            // Build public URL
            const R2_PUBLIC_URL = getR2PublicUrl(c.env);
            const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
            
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

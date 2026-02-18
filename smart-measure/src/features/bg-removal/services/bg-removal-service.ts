/**
 * Background Removal Orchestration Service
 * Coordinates all background removal methods with priority fallback
 */
import type { AppEnv } from '../../../types/bindings'
import type { Context } from 'hono'
import type { BgRemovalResult } from '../types'
import { removeBackgroundWithCloudflareAI } from './cloudflare-ai'
import { removeBackgroundWithWithoutBG } from './withoutbg'
import { callBriaApi, isBriaApiKeyValid } from './bria-api'
import { uploadProcessedImageToR2, uploadAndUpdateDatabase, base64ToBuffer } from '../helpers/r2-uploader'
import { logger } from '../../../shared/helpers/logger'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'

/**
 * Remove background for product image
 * Priority order:
 * 1. withoutBG Focus API (free, Hugging Face Spaces)
 * 2. Cloudflare AI (fallback)
 * 3. Fal.ai BRIA API (if API key configured)
 */
export async function removeProductImageBackground(
  c: Context<AppEnv>,
  originalUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string,
  options?: {
    model?: string
    useBriaApi?: boolean
  }
): Promise<{ success: true; processedUrl: string; maskUrl?: string | null; message: string } | { success: false; error: string }> {
  const { model = 'cloudflare-ai', useBriaApi = false } = options || {}
  
  // Priority 1: Fal.ai BRIA API (if explicitly requested or API key configured)
  const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY
  const isBriaValid = isBriaApiKeyValid(briaApiKey)
  
  if (isBriaValid && (useBriaApi || model === 'bria')) {
    logger.debug('🌐 Using Fal.ai BRIA RMBG 2.0 API (cloud-based)')
    
    if (!originalUrl.startsWith('data:')) {
      const briaResult = await callBriaApi(originalUrl, briaApiKey)
      
      if (briaResult.success && briaResult.imageUrl) {
        const imageResponse = await fetch(briaResult.imageUrl)
        const imageBuffer = await imageResponse.arrayBuffer()
        
        const { publicUrl } = await uploadAndUpdateDatabase(
          c.env.PRODUCT_IMAGES,
          c.env.DB,
          getR2PublicUrl(c.env),
          {
            companyId,
            sku,
            filenamePart,
            imageBuffer
          }
        )
        
        logger.debug(`✅ Processed with BRIA API: ${publicUrl}`)
        
        return {
          success: true,
          processedUrl: publicUrl,
          maskUrl: null,
          message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)'
        }
      } else {
        logger.error('BRIA API failed, falling back:', briaResult.error)
      }
    } else {
      logger.warn('Data URL detected, falling back to withoutBG')
    }
  }
  
  // Priority 2: withoutBG Focus (free, always try first for URL images)
  const isBase64Image = originalUrl.startsWith('data:')
  
  if (!isBase64Image) {
    console.log('🚀 Starting withoutBG Focus model for background removal (URL mode)')
    
    try {
      const result = await removeBackgroundWithWithoutBG(originalUrl)
      console.log('📦 [bg-removal-service] withoutBG result:', { 
        success: result.success, 
        hasImage: !!result.imageDataUrl,
        hasMask: !!result.maskDataUrl 
      })
      
      if (result.success && result.imageDataUrl) {
        console.log('✅ withoutBG success, converting base64 to bytes...')
        
        const bytes = base64ToBuffer(result.imageDataUrl)
        
        const { publicUrl } = await uploadAndUpdateDatabase(
          c.env.PRODUCT_IMAGES,
          c.env.DB,
          getR2PublicUrl(c.env),
          {
            companyId,
            sku,
            filenamePart,
            imageBuffer: bytes
          }
        )
        
        console.log(`🎉 Success! Processed URL: ${publicUrl}`)
        
        // マスク画像も保存（Hugging Faceから返される）
        let maskUrl: string | null = null;
        console.log(`🎭 Mask data available: ${!!result.maskDataUrl}`);
        if (result.maskDataUrl) {
          try {
            console.log('🎭 Saving mask image...');
            const maskBytes = base64ToBuffer(result.maskDataUrl);
            console.log(`🎭 Mask bytes length: ${maskBytes.length}`);
            const timestamp = Date.now();
            const maskKey = `${companyId}/${sku}/${filenamePart}_mask_${timestamp}.png`;
            
            await c.env.PRODUCT_IMAGES.put(maskKey, maskBytes, {
              httpMetadata: { contentType: 'image/png' }
            });
            
            maskUrl = `${getR2PublicUrl(c.env)}/${maskKey}`;
            console.log(`✅ Mask saved to R2: ${maskUrl}`);
            
            // D1にマスク画像URLを保存（背景削除マスクはmask_image_url_r2に保存）
            await c.env.DB.prepare(`
              UPDATE product_items
              SET mask_image_url_r2 = ?,
                  updated_at = ?
              WHERE sku = ? AND company_id = ?
            `).bind(maskUrl, new Date().toISOString(), sku, companyId).run();
            
            console.log('✅ Mask URL saved to D1 (mask_image_url_r2)');
          } catch (maskError: any) {
            console.error('❌ Failed to save mask:', maskError);
            console.error('❌ Error details:', {
              message: maskError.message,
              stack: maskError.stack
            });
          }
        } else {
          console.log('⚠️ No mask data returned from withoutBG API');
        }
        
        return {
          success: true,
          processedUrl: publicUrl,
          maskUrl: maskUrl,
          message: 'Background removed using withoutBG Focus (Free)'
        }
      }
    } catch (apiError: any) {
      console.error('❌ withoutBG processing error:', apiError.message)
      // Fall through to Cloudflare AI
    }
  } else {
    logger.debug('📦 Base64 image detected - skipping withoutBG (not supported)')
  }
  
  // Priority 3: Cloudflare AI (fallback)
  if (c.env.AI) {
    logger.debug('🤖 Using Cloudflare AI @cf/bria/rmbg-1.4 as fallback')
    
    try {
      const result = await removeBackgroundWithCloudflareAI(c.env.AI, originalUrl)
      
      if (result.success && result.imageBuffer) {
        const { publicUrl } = await uploadAndUpdateDatabase(
          c.env.PRODUCT_IMAGES,
          c.env.DB,
          getR2PublicUrl(c.env),
          {
            companyId,
            sku,
            filenamePart,
            imageBuffer: result.imageBuffer
          }
        )
        
        logger.debug(`✅ Processed with Cloudflare AI: ${publicUrl}`)
        
        return {
          success: true,
          processedUrl: publicUrl,
          maskUrl: null,
          message: 'Background removed using Cloudflare AI (Free)'
        }
      } else {
        logger.error('❌ Cloudflare AI failed:', result.error)
        throw new Error(result.error || 'Cloudflare AI processing failed')
      }
    } catch (aiError: any) {
      logger.error('❌ Cloudflare AI error:', aiError.message)
      throw aiError
    }
  }
  
  // No more services available
  logger.error('❌ All background removal services failed')
  return {
    success: false,
    error: 'Background removal failed: All services are unavailable. Please try again later.'
  }
}

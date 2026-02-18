/**
 * Background Removal API Routes
 * 
 * Endpoints:
 *   POST /api/remove-bg - Basic BG removal (Cloudflare AI)
 *   POST /api/remove-bg-image/:imageId - BG removal for product images
 *   POST /api/remove-bg-measurement/:sku - BG removal for measurement images
 *   POST /api/upload-processed-measurement/:sku - Upload processed measurement image
 *   POST /api/upload-processed-image/:sku - Upload processed image
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { ImageUrlHelper } from '../../image-editor/helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

// Services
import { removeBackgroundWithCloudflareAI } from '../services/cloudflare-ai'
import { removeBackgroundWithWithoutBG } from '../services/withoutbg'
import { removeProductImageBackground } from '../services/bg-removal-service'

// Helpers
import { parseImageId, resolveR2ImageUrl, getSearchedPaths } from '../helpers/image-resolver'
import { base64ToBuffer } from '../helpers/r2-uploader'

const bgRemoval = new Hono<AppEnv>()

// Apply Firebase authentication to all background removal endpoints
bgRemoval.use('*', requireFirebaseAuth)

/**
 * POST /api/remove-bg - Basic background removal using Cloudflare AI
 */
bgRemoval.post('/api/remove-bg', async (c) => {
  try {
    const body = await c.req.parseBody()
    const imageUrl = body['imageUrl'] as string
    
    if (!imageUrl) {
      return c.json({ error: 'imageUrl is required' }, 400)
    }

    logger.debug('🚀 Using Cloudflare AI for background removal')
    
    const result = await removeBackgroundWithCloudflareAI(c.env.AI, imageUrl)
    
    if (!result.success || !result.imageBuffer) {
      throw new Error(result.error || 'Cloudflare AI processing failed')
    }

    const base64 = btoa(
      new Uint8Array(result.imageBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte), 
        ''
      )
    )
    const processedDataUrl = `data:image/png;base64,${base64}`

    return c.json({
      success: true,
      processedUrl: processedDataUrl,
      message: 'Background removed using Cloudflare AI (Free)'
    })

  } catch (error: any) {
    logError('Background removal (basic)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

/**
 * POST /api/remove-bg-image/:imageId - BG removal for product images
 */
bgRemoval.post('/api/remove-bg-image/:imageId', async (c) => {
  try {
    const imageId = c.req.param('imageId')
    let model = 'cloudflare-ai'
    let useBriaApi = false
    
    // Parse optional JSON body
    try {
      const body = await c.req.json()
      if (body && body.model) model = body.model
      if (body && body.useBriaApi) useBriaApi = body.useBriaApi
    } catch (e) {
      // No JSON body or parse error, use defaults
    }
    
    // Parse image ID
    const parsed = parseImageId(imageId)
    if (!parsed) {
      return c.json({ error: 'Invalid R2 image ID format. Use r2_{SKU}_{filename} format.' }, 400)
    }
    
    const { sku, filenamePart } = parsed
    
    // Get company_id from authenticated user (authentication required)
    const user = c.get('user') as { companyId?: string } | undefined
    const userCompanyId = user?.companyId
    
    if (!userCompanyId) {
      return c.json({ 
        error: 'Authentication required. Please log in.',
        errorCode: 'AUTH_REQUIRED'
      }, 401)
    }
    
    const r2PublicUrl = getR2PublicUrl(c.env)
    
    console.log('🔍 Debug info:', JSON.stringify({
      imageId,
      sku,
      filenamePart,
      userCompanyId,
      r2PublicUrl
    }, null, 2))
    
    // Resolve R2 image URL (only in user's company)
    const resolved = await resolveR2ImageUrl(
      c.env.PRODUCT_IMAGES,
      r2PublicUrl,
      userCompanyId,
      sku,
      filenamePart,
      c.env.DB
    )
    
    if (!resolved) {
      return c.json({ 
        error: `Image not found: ${imageId}. Please upload the image first.`,
        details: `Searched in company: ${userCompanyId}, SKU: ${sku}`
      }, 404)
    }
    
    logger.debug(`📸 Processing R2 image: ${imageId} -> ${resolved.originalUrl}`)
    
    // Remove background using orchestration service
    const result = await removeProductImageBackground(
      c,
      resolved.originalUrl,
      resolved.companyId,
      sku,
      filenamePart,
      { model, useBriaApi }
    )
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return c.json({ 
      success: true,
      imageId,
      processedUrl: result.processedUrl,
      maskUrl: result.maskUrl || null,
      message: result.message
    })

  } catch (error: any) {
    logError('Background removal (image ID)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

/**
 * POST /api/remove-bg-measurement/:sku - BG removal for measurement images
 */
bgRemoval.post('/api/remove-bg-measurement/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    
    logger.debug(`🎯 Starting background removal for measurement image: SKU ${sku}, Company ${companyId}`)
    
    const result = await c.env.DB.prepare(`
      SELECT COALESCE(measurement_image_url, annotated_image_url) as image_url
      FROM product_items
      WHERE sku = ? AND company_id = ?
      LIMIT 1
    `).bind(sku, companyId).first()
    
    if (!result || !result.image_url) {
      return c.json({ error: 'Measurement image not found for this SKU' }, 404)
    }
    
    const originalUrl = result.image_url as string
    logger.debug(`📸 Original measurement image URL: ${originalUrl}`)
    
    logger.debug('🚀 Using withoutBG Focus model for measurement image')
    const bgResult = await removeBackgroundWithWithoutBG(originalUrl)
    
    if (!bgResult.success || !bgResult.imageDataUrl) {
      throw new Error(bgResult.error || 'withoutBG processing failed')
    }
    
    logger.debug('✅ withoutBG processing completed, returning data URL to client')
    logger.debug(`🎭 Mask data available: ${!!bgResult.maskDataUrl}`)
    
    return c.json({
      success: true,
      sku,
      processedDataUrl: bgResult.imageDataUrl,
      maskDataUrl: bgResult.maskDataUrl,
      message: 'Measurement image background removed, ready for resize'
    })
    
  } catch (error: any) {
    logError('Measurement image BG removal', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

/**
 * POST /api/upload-processed-measurement/:sku - Upload processed measurement image
 */
bgRemoval.post('/api/upload-processed-measurement/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    const body = await c.req.json()
    
    logger.debug(`📤 Uploading resized measurement image: SKU ${sku}, Company ${companyId}`)
    
    if (!body.imageDataUrl) {
      return c.json({ error: 'imageDataUrl is required' }, 400)
    }
    
    const base64Data = body.imageDataUrl.split(',')[1]
    const processedImageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer
    
    const timestamp = Date.now()
    const r2Key = `${companyId}/${sku}/measurement_${timestamp}_p.png`
    
    if (c.env.PRODUCT_IMAGES) {
      await c.env.PRODUCT_IMAGES.put(r2Key, processedImageBuffer, {
        httpMetadata: { contentType: 'image/png' }
      })
      logger.debug(`✅ Uploaded resized measurement image to R2: ${r2Key}`)
    }
    
    const processedUrl = ImageUrlHelper.toFullUrl(r2Key)
    
    // Upload mask image if provided
    let maskUrl = null
    if (body.maskDataUrl) {
      logger.debug(`🎭 Uploading mask image for SKU ${sku}`)
      const maskBase64Data = body.maskDataUrl.split(',')[1]
      const maskImageBuffer = Uint8Array.from(atob(maskBase64Data), c => c.charCodeAt(0)).buffer
      
      const maskR2Key = `${companyId}/${sku}/mask_${timestamp}.png`
      
      if (c.env.PRODUCT_IMAGES) {
        await c.env.PRODUCT_IMAGES.put(maskR2Key, maskImageBuffer, {
          httpMetadata: { contentType: 'image/png' }
        })
        logger.debug(`✅ Uploaded mask image to R2: ${maskR2Key}`)
      }
      
      maskUrl = ImageUrlHelper.toFullUrl(maskR2Key)
    }
    
    await c.env.DB.prepare(`
      UPDATE product_items
      SET measurement_image_url = ?, mask_image_url_r2 = ?, updated_at = ?
      WHERE sku = ? AND company_id = ?
    `).bind(processedUrl, maskUrl, new Date().toISOString(), sku, companyId).run()
    
    logger.debug(`✅ Updated product_items with resized measurement image URL and mask URL (mask_image_url_r2)`)
    
    return c.json({
      success: true,
      sku,
      processedUrl,
      maskUrl,
      message: 'Resized measurement image uploaded successfully'
    })
    
  } catch (error: any) {
    logError('Measurement image upload', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

/**
 * POST /api/upload-processed-image/:sku - Upload processed image
 */
bgRemoval.post('/api/upload-processed-image/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    const { imageDataUrl, filenamePart } = await c.req.json()
    
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/png;base64,')) {
      return c.json({ error: 'Invalid image data' }, 400)
    }
    
    if (!filenamePart) {
      return c.json({ error: 'filenamePart is required' }, 400)
    }
    
    logger.debug(`📤 Uploading processed image for SKU ${sku}, filename: ${filenamePart}`)
    
    const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '')
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
    
    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`
    logger.debug(`🗂️ R2 key: ${r2Key}`)
    
    if (c.env.PRODUCT_IMAGES) {
      await c.env.PRODUCT_IMAGES.put(r2Key, buffer, {
        httpMetadata: { contentType: 'image/png' }
      })
      
      logger.debug(`✅ Processed image uploaded to R2: ${r2Key}`)
      
      const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`
      logger.debug(`🌐 Public URL: ${processedUrl}`)
      
      return c.json({
        success: true,
        sku,
        processedUrl,
        r2Key,
        message: 'Processed image uploaded successfully'
      })
    } else {
      return c.json({ error: 'R2 bucket not configured' }, 500)
    }
  } catch (error: any) {
    logError('Upload processed image', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

export default bgRemoval

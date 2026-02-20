/**
 * Background Removal API Routes
 *
 * POST /api/remove-bg                         Basic BG removal (Cloudflare AI, returns dataURL)
 * POST /api/remove-bg-image/:imageId          R2画像の背景削除（通常画像）
 * POST /api/remove-bg-measurement/:sku        採寸画像の背景削除
 * POST /api/upload-processed-measurement/:sku 採寸画像リサイズ後アップロード
 * POST /api/upload-processed-image/:sku       通常画像の処理済みアップロード
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

// Services
import { removeBackgroundWithCloudflareAI } from '../services/cloudflare-ai'
import { removeBackgroundWithWithoutBG } from '../services/withoutbg'
import { removeProductImageBackground } from '../services/bg-removal-service'

// Helpers
import { parseImageId, resolveR2ImageUrl } from '../helpers/image-resolver'
import { base64ToBuffer, uploadAndUpdateDatabase, saveMaskToR2AndDb } from '../helpers/r2-uploader'
import { markImageAsProcessed } from '../../image-editor/helpers/image-status'

const bgRemoval = new Hono<AppEnv>()
bgRemoval.use('*', requireFirebaseAuth)

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg — 基本背景削除（Cloudflare AI、dataURLを返す）
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg', async (c) => {
  try {
    const body = await c.req.parseBody()
    const imageUrl = body['imageUrl'] as string
    if (!imageUrl) return c.json({ error: 'imageUrl is required' }, 400)

    const result = await removeBackgroundWithCloudflareAI(c.env.AI, imageUrl)
    if (!result.success || !result.imageBuffer) {
      throw new Error(result.error || 'Cloudflare AI processing failed')
    }

    const base64 = btoa(
      new Uint8Array(result.imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    return c.json({
      success: true,
      processedUrl: `data:image/png;base64,${base64}`,
      message: 'Background removed using Cloudflare AI (Free)'
    })
  } catch (error: any) {
    logError('Background removal (basic)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg-image/:imageId — R2画像の背景削除（通常画像）
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg-image/:imageId', async (c) => {
  try {
    const imageId = c.req.param('imageId')
    let model = 'cloudflare-ai'
    let useBriaApi = false
    try {
      const body = await c.req.json()
      if (body?.model) model = body.model
      if (body?.useBriaApi) useBriaApi = body.useBriaApi
    } catch { /* body省略可 */ }

    const parsed = parseImageId(imageId)
    if (!parsed) return c.json({ error: 'Invalid R2 image ID format. Use r2_{SKU}_{filename}.' }, 400)
    const { sku, filenamePart } = parsed

    const user = c.get('user') as { companyId?: string } | undefined
    const userCompanyId = user?.companyId
    if (!userCompanyId) return c.json({ error: 'Authentication required.', errorCode: 'AUTH_REQUIRED' }, 401)

    const resolved = await resolveR2ImageUrl(
      c.env.PRODUCT_IMAGES, getR2PublicUrl(c.env), userCompanyId, sku, filenamePart, c.env.DB
    )
    if (!resolved) {
      return c.json({ error: `Image not found: ${imageId}`, details: `company: ${userCompanyId}, SKU: ${sku}` }, 404)
    }

    const result = await removeProductImageBackground(
      c, resolved.originalUrl, resolved.companyId, sku, filenamePart, { model, useBriaApi }
    )
    if (!result.success) throw new Error(result.error)

    return c.json({ success: true, imageId, processedUrl: result.processedUrl, maskUrl: result.maskUrl ?? null, message: result.message })
  } catch (error: any) {
    logError('Background removal (image ID)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg-measurement/:sku — 採寸画像の背景削除
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg-measurement/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)

    const row = await c.env.DB.prepare(`
      SELECT COALESCE(measurement_image_url, annotated_image_url) AS image_url
      FROM product_items WHERE sku = ? AND company_id = ? LIMIT 1
    `).bind(sku, companyId).first()

    if (!row?.image_url) return c.json({ error: 'Measurement image not found for this SKU' }, 404)

    const bgResult = await removeBackgroundWithWithoutBG(row.image_url as string)
    if (!bgResult.success || !bgResult.imageDataUrl) {
      throw new Error(bgResult.error || 'withoutBG processing failed')
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload-processed-measurement/:sku — 採寸画像リサイズ後アップロード
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/upload-processed-measurement/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    const body = await c.req.json()

    if (!body.imageDataUrl) return c.json({ error: 'imageDataUrl is required' }, 400)

    // 採寸画像は固定キー measurement_p.png
    const r2Key = `${companyId}/${sku}/measurement_p.png`
    await c.env.PRODUCT_IMAGES.put(r2Key, base64ToBuffer(body.imageDataUrl), {
      httpMetadata: { contentType: 'image/png' }
    })
    logger.debug(`✅ Uploaded resized measurement image: ${r2Key}`)

    await markImageAsProcessed(c.env.DB, sku, companyId, 'measurement')

    // マスク画像（通常画像と同じ命名規則: {filenamePart}_mask.png）
    let maskUrl: string | null = null
    if (body.maskDataUrl) {
      try {
        maskUrl = await saveMaskToR2AndDb(
          c.env.PRODUCT_IMAGES, c.env.DB, getR2PublicUrl(c.env),
          { companyId, sku, filenamePart: 'measurement', maskBytes: base64ToBuffer(body.maskDataUrl) }
        )
      } catch (maskErr: any) {
        logger.error('❌ Failed to save measurement mask:', maskErr.message)
      }
    }

    return c.json({
      success: true,
      sku,
      processedUrl: `/api/image-proxy/${sku}/measurement_p.png`,
      maskUrl,
      message: 'Resized measurement image uploaded successfully'
    })
  } catch (error: any) {
    logError('Measurement image upload', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload-processed-image/:sku — 通常画像の処理済みアップロード
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/upload-processed-image/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const user = c.get('user') as { companyId?: string } | undefined
    const companyId = user?.companyId || getCompanyId(c)
    const { imageDataUrl, filenamePart } = await c.req.json()

    if (!imageDataUrl?.startsWith('data:image/png;base64,')) return c.json({ error: 'Invalid image data' }, 400)
    if (!filenamePart) return c.json({ error: 'filenamePart is required' }, 400)

    // R2にアップロード
    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`
    await c.env.PRODUCT_IMAGES.put(r2Key, base64ToBuffer(imageDataUrl), {
      httpMetadata: { contentType: 'image/png' }
    })
    logger.debug(`✅ Uploaded processed image: ${r2Key}`)

    // DBのprocessed_imagesを更新（image-proxy経由で表示されるようにする）
    await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart)
    logger.debug(`✅ DB updated: processed_images for ${sku}/${filenamePart}`)

    const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`
    return c.json({ success: true, sku, processedUrl, r2Key, filenamePart, message: 'Processed image uploaded successfully' })
  } catch (error: any) {
    logError('Upload processed image', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

export default bgRemoval

/**
 * Mask API - HTTP層（ルーティングのみ）
 *
 * 責務: リクエスト受付・バリデーション・レスポンス整形のみ。
 * ビジネスロジック → MaskService
 * DB操作           → MaskRepository（MaskService経由で注入）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getCompanyId } from '../../auth/helpers/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import {
  createSafeErrorResponse,
  ErrorCode,
  logError,
} from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'
import { MaskRepository } from '../repositories/mask-repository'
import { MaskService } from '../services/mask-service'

const maskApi = new Hono<AppEnv>()

// Firebase認証ミドルウェアを全エンドポイントに適用
maskApi.use('*', requireFirebaseAuth)

// ── Composition Root: モジュールスコープで一度だけ生成（per-request生成を排除）──
// テストでは MaskService(mockRepo) に差し替えてテスト可能
const maskService = new MaskService(new MaskRepository())

// ─────────────────────────────────────────────
// GET /api/mask-info/:sku
// マスク情報取得（デバッグ・クライアント確認用）
// ─────────────────────────────────────────────
maskApi.get('/api/mask-info/:sku', async (c) => {
  const sku = c.req.param('sku')
  try {
    const companyId = getCompanyId(c)
    const { maskImageUrl } = await maskService.getMaskInfo(
      c.env.DB,
      sku,
      companyId
    )

    return c.json({ success: true, sku, companyId, maskImageUrl })
  } catch (error) {
    logError('Mask info', error, { sku })
    return c.json(
      createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED),
      500
    )
  }
})

// ─────────────────────────────────────────────
// POST /api/save-mask/:sku
// マスク画像の保存（R2 + DB更新）
// ─────────────────────────────────────────────
maskApi.post('/api/save-mask/:sku', async (c) => {
  const sku = c.req.param('sku')
  console.log(`🎭 [save-mask API] Request received: sku=${sku}`)
  
  try {
    const companyId = getCompanyId(c)
    console.log(`🔑 [save-mask API] Company ID: ${companyId}`)
    
    const body = await c.req.json<{
      maskDataUrl: string
      filenamePart?: string
    }>()
    
    const { maskDataUrl, filenamePart } = body
    console.log(`📦 [save-mask API] Data received: maskDataUrl length=${maskDataUrl?.length || 0}, filenamePart=${filenamePart || 'none'}`)

    // Validation
    if (!maskDataUrl || !maskDataUrl.startsWith('data:image/png;base64,')) {
      console.error(`❌ [save-mask API] Invalid mask data format`)
      return c.json({ error: 'Invalid mask data format' }, 400)
    }
    
    if (!c.env.DB) {
      console.error(`❌ [save-mask API] Database not configured`)
      return c.json({ error: 'Database not configured' }, 500)
    }
    
    if (!c.env.PRODUCT_IMAGES) {
      console.error(`❌ [save-mask API] R2 bucket not configured`)
      return c.json({ error: 'R2 bucket not configured' }, 500)
    }

    // Debug: Check R2 bucket availability
    console.log(`🔍 [save-mask API] R2 bucket available: ${!!c.env.PRODUCT_IMAGES}`)
    console.log(`🔍 [save-mask API] R2 public URL: ${getR2PublicUrl(c.env)}`)
    
    // Save mask to R2 and update DB
    console.log(`🚀 [save-mask API] Calling maskService.saveMask...`)
    const result = await maskService.saveMask(
      c.env.DB,
      c.env.PRODUCT_IMAGES,
      getR2PublicUrl(c.env),
      { sku, companyId, maskDataUrl, filenamePart }
    )
    
    console.log(`✅ [save-mask API] Success: r2Key=${result.r2Key}`)
    console.log(`✅ [save-mask API] Result:`, JSON.stringify(result, null, 2))
    
    return c.json({
      success: true,
      sku,
      companyId,
      ...result,
      message: `Mask saved: ${result.r2Key}`,
    })
  } catch (error) {
    console.error(`❌ [save-mask API] Error occurred:`, error)
    console.error(`❌ [save-mask API] Error type: ${typeof error}`)
    console.error(`❌ [save-mask API] Error message: ${error instanceof Error ? error.message : String(error)}`)
    if (error instanceof Error && error.stack) {
      console.error(`❌ [save-mask API] Stack trace:`, error.stack)
    }
    logError('Mask save', error, { sku })
    return c.json(
      createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED),
      500
    )
  }
})

// ─────────────────────────────────────────────
// POST /api/regenerate-with-mask/:sku
// 編集済みマスクで画像を再生成
// ─────────────────────────────────────────────
maskApi.post('/api/regenerate-with-mask/:sku', async (c) => {
  const sku = c.req.param('sku')
  try {
    const companyId = getCompanyId(c)
    const data = await maskService.getRegenerateData(c.env.DB, sku, companyId)

    if (!data) {
      return c.json({ error: 'Image or mask not found for this SKU' }, 404)
    }

    return c.json({
      success: true,
      sku,
      originalUrl: data.originalUrl,
      maskUrl: data.maskUrl,
    })
  } catch (error) {
    logError('Regenerate with mask', error, { sku })
    return c.json(
      createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR),
      500
    )
  }
})

// ─────────────────────────────────────────────
// POST /api/save-cropped-image/:sku
// 自由クロップした画像を保存（R2 + DB更新）
// 
// Option C実装:
// - R2に _f.png として保存
// - final_images 配列に追加
// - image_status を 'final' に更新
// ─────────────────────────────────────────────
maskApi.post('/api/save-cropped-image/:sku', async (c) => {
  const sku = c.req.param('sku')
  logger.info(`🖼️ [save-cropped] Request: sku=${sku}`)
  
  try {
    const companyId = getCompanyId(c)
    const body = await c.req.json<{
      imageDataUrl: string
      width: number
      height: number
    }>()
    
    const { imageDataUrl, width, height } = body

    // Validation
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/png;base64,')) {
      logger.warn(`❌ [save-cropped] Invalid image data format: sku=${sku}`)
      return c.json({ error: 'Invalid image data format' }, 400)
    }
    if (!c.env.DB) {
      logger.error(`❌ [save-cropped] Database not configured`)
      return c.json({ error: 'Database not configured' }, 500)
    }
    if (!c.env.PRODUCT_IMAGES) {
      logger.error(`❌ [save-cropped] R2 bucket not configured`)
      return c.json({ error: 'R2 bucket not configured' }, 500)
    }

    // Extract base64 data and convert to binary
    const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, '')
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))

    // Save to R2 with _f.png suffix (final/cropped)
    const r2Key = `products/${companyId}/${sku}_f.png`
    await c.env.PRODUCT_IMAGES.put(r2Key, binaryData, {
      httpMetadata: { contentType: 'image/png' }
    })
    logger.debug(`✅ [save-cropped] R2 upload: ${r2Key}`)

    // Get current final_images array
    const result = await c.env.DB.prepare(`
      SELECT final_images FROM product_items
      WHERE sku = ? AND company_id = ?
    `).bind(sku, companyId).first()

    let finalImages: string[] = []
    if (result?.final_images) {
      try {
        finalImages = JSON.parse(result.final_images as string)
      } catch (e) {
        logger.error(`❌ [save-cropped] Failed to parse final_images:`, e)
        finalImages = []
      }
    }

    // Add 'r2_1_1' to final_images if not already present
    // Note: This assumes the image ID is always 'r2_1_1'
    // If multiple images per SKU exist, this should be extracted from EditorState
    const imageId = 'r2_1_1'
    if (!finalImages.includes(imageId)) {
      finalImages.push(imageId)
    }

    // Update DB: Mark as final and update final_images array
    await c.env.DB.prepare(`
      UPDATE product_items
      SET 
        final_images = ?,
        image_status = 'final',
        updated_at = CURRENT_TIMESTAMP
      WHERE sku = ? AND company_id = ?
    `).bind(JSON.stringify(finalImages), sku, companyId).run()

    const publicUrl = getR2PublicUrl(c.env) + r2Key
    
    logger.info(
      `✅ [save-cropped] Success: sku=${sku}, size=${width}×${height}, key=${r2Key}`
    )
    
    return c.json({
      success: true,
      sku,
      companyId,
      r2Key,
      publicUrl,
      width,
      height,
      imageStatus: 'final',
      finalImages,
      message: `Cropped image saved: ${r2Key}`,
    })
  } catch (error) {
    logError('Cropped image save', error, { sku })
    return c.json(
      createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED),
      500
    )
  }
})

export default maskApi

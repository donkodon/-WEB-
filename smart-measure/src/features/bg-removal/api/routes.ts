/**
 * Background Removal API Routes - HTTP層（ルーティングのみ）
 *
 * POST /api/remove-bg                         Basic BG removal（dataURL返却・R2保存なし）
 * POST /api/remove-bg-image/:imageId          R2画像の背景削除（R2保存あり）
 * POST /api/remove-bg-measurement/:sku        採寸画像の背景削除（dataURL返却・R2保存なし）
 * POST /api/upload-processed-measurement/:sku 採寸画像リサイズ後アップロード
 * POST /api/upload-processed-image/:sku       通常画像の処理済みアップロード
 *
 * ── アーキテクチャ方針 ────────────────────────────────────────────────────────
 * R2保存あり → removeProductImageBackground (Orchestrator経由)
 * dataURL返却のみ → Provider クラス経由（旧サービス関数への直接依存なし）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

// Orchestrator経由 (R2保存あり)
import { removeProductImageBackground } from '../services/bg-removal-service'

// Providerクラス (dataURL返却のみ・R2保存なし)
import { CloudflareAIProvider } from '../providers/cloudflare-ai-provider'
import { WithoutBGProvider } from '../providers/withoutbg-provider'

// Helpers
import { parseImageId, resolveR2ImageUrl } from '../helpers/image-resolver'
import { base64ToBuffer, saveMaskToR2AndDb } from '../helpers/r2-uploader'
import { markImageAsProcessed } from '../../image-editor/helpers/image-status'

const bgRemoval = new Hono<AppEnv>()
bgRemoval.use('*', requireFirebaseAuth)

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg — 基本背景削除（Cloudflare AI、dataURLを返す・R2保存なし）
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg', async (c) => {
  try {
    const body = await c.req.parseBody()
    const imageUrl = body['imageUrl'] as string
    if (!imageUrl) return c.json({ error: 'imageUrl is required' }, 400)

    // CloudflareAIProvider 経由で背景削除（旧関数への直接依存なし）
    const provider = new CloudflareAIProvider(c.env.AI)
    if (!provider.isAvailable()) {
      return c.json({ error: 'Cloudflare AI binding is not configured' }, 500)
    }

    const result = await provider.removeBackground({ imageUrl })
    if (!result.success) {
      throw new Error(result.error)
    }

    const base64 = btoa(
      new Uint8Array(result.imageBuffer as ArrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte), ''
      )
    )
    return c.json({
      success: true,
      processedUrl: `data:image/png;base64,${base64}`,
      message: 'Background removed using Cloudflare AI (Free)',
    })
  } catch (error: unknown) {
    logError('Background removal (basic)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg-image/:imageId — R2画像の背景削除（Orchestrator経由・R2保存あり）
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg-image/:imageId', async (c) => {
  try {
    const imageId = c.req.param('imageId')
    let model = 'cloudflare-ai'
    let useBriaApi = false
    try {
      const body = await c.req.json() as { model?: string; useBriaApi?: boolean }
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

    // Orchestrator経由（R2保存・DB更新あり）
    const result = await removeProductImageBackground(
      c.env, resolved.originalUrl, resolved.companyId, sku, filenamePart, { model, useBriaApi }
    )
    if (!result.success) throw new Error(result.error)

    return c.json({
      success: true,
      imageId,
      processedUrl: result.processedUrl,
      maskUrl: result.maskUrl ?? null,
      message: result.message,
    })
  } catch (error: unknown) {
    logError('Background removal (image ID)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg-image-data/:imageId — R2画像の背景削除（dataURL返却のみ・R2保存なし）
// クライアントでセンタリング後に /api/upload-processed-image/:sku で保存する2段階フロー
// ─────────────────────────────────────────────────────────────────────────────
bgRemoval.post('/api/remove-bg-image-data/:imageId', async (c) => {
  try {
    const imageId = c.req.param('imageId')

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

    // WithoutBGProvider でdataURL返却のみ（R2保存はクライアントがセンタリング後に行う）
    const provider = new WithoutBGProvider()
    const result = await provider.removeBackground({ imageUrl: resolved.originalUrl })

    if (!result.success) {
      throw new Error(result.error)
    }

    const base64 = btoa(
      new Uint8Array(result.imageBuffer as Uint8Array).reduce(
        (data, byte) => data + String.fromCharCode(byte), ''
      )
    )
    const processedDataUrl = `data:image/png;base64,${base64}`

    logger.debug(`🎭 Mask data available: ${!!result.maskDataUrl} for ${sku}/${filenamePart}`)
    return c.json({
      success: true,
      imageId,
      sku,
      filenamePart,
      processedDataUrl,
      maskDataUrl: result.maskDataUrl ?? null,
      message: 'Background removed, ready for client-side centering',
    })
  } catch (error: unknown) {
    logError('Background removal (image data)', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/remove-bg-measurement/:sku — 採寸画像の背景削除（dataURL返却・R2保存なし）
// クライアントでリサイズ後に /api/upload-processed-measurement/:sku で保存する2段階フロー
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

    // WithoutBGProvider 経由（旧関数への直接依存なし）
    // dataURLを返すだけでR2保存はしない（クライアントでリサイズ後に別エンドポイントへ）
    const provider = new WithoutBGProvider()
    const result = await provider.removeBackground({ imageUrl: row.image_url as string })

    if (!result.success) {
      throw new Error(result.error)
    }

    // imageBuffer → dataURL に変換（クライアントがキャンバス処理するために必要）
    const base64 = btoa(
      new Uint8Array(result.imageBuffer as Uint8Array).reduce(
        (data, byte) => data + String.fromCharCode(byte), ''
      )
    )
    const imageDataUrl = `data:image/png;base64,${base64}`

    logger.debug(`🎭 Mask data available: ${!!result.maskDataUrl}`)
    return c.json({
      success: true,
      sku,
      processedDataUrl: imageDataUrl,
      maskDataUrl: result.maskDataUrl ?? null,
      message: 'Measurement image background removed, ready for resize',
    })
  } catch (error: unknown) {
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
    const body = await c.req.json() as { imageDataUrl?: string; maskDataUrl?: string }

    if (!body.imageDataUrl) return c.json({ error: 'imageDataUrl is required' }, 400)

    // 採寸画像は固定キー measurement_p.png
    const r2Key = `${companyId}/${sku}/measurement_p.png`
    await c.env.PRODUCT_IMAGES.put(r2Key, base64ToBuffer(body.imageDataUrl), {
      httpMetadata: { contentType: 'image/png' },
    })
    logger.debug(`✅ Uploaded resized measurement image: ${r2Key}`)

    await markImageAsProcessed(c.env.DB, sku, companyId, 'measurement')

    let maskUrl: string | null = null
    if (body.maskDataUrl) {
      try {
        maskUrl = await saveMaskToR2AndDb(
          c.env.PRODUCT_IMAGES, c.env.DB, getR2PublicUrl(c.env),
          { companyId, sku, filenamePart: 'measurement', maskBytes: base64ToBuffer(body.maskDataUrl) }
        )
      } catch (maskErr: unknown) {
        logger.error('❌ Failed to save measurement mask:', maskErr instanceof Error ? maskErr.message : String(maskErr))
      }
    }

    return c.json({
      success: true,
      sku,
      processedUrl: `/api/image-proxy/${sku}/measurement_p.png`,
      maskUrl,
      message: 'Resized measurement image uploaded successfully',
    })
  } catch (error: unknown) {
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
    const { imageDataUrl, filenamePart, maskDataUrl } = await c.req.json() as {
      imageDataUrl?: string
      filenamePart?: string
      maskDataUrl?: string | null
    }

    if (!imageDataUrl?.startsWith('data:image/png;base64,')) return c.json({ error: 'Invalid image data' }, 400)
    if (!filenamePart) return c.json({ error: 'filenamePart is required' }, 400)

    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`
    await c.env.PRODUCT_IMAGES.put(r2Key, base64ToBuffer(imageDataUrl), {
      httpMetadata: { contentType: 'image/png' },
    })
    logger.debug(`✅ Uploaded processed image: ${r2Key}`)

    await markImageAsProcessed(c.env.DB, sku, companyId, filenamePart)
    logger.debug(`✅ DB updated: processed_images for ${sku}/${filenamePart}`)

    // マスク画像も保存（ある場合）
    let maskUrl: string | null = null
    if (maskDataUrl) {
      try {
        maskUrl = await saveMaskToR2AndDb(
          c.env.PRODUCT_IMAGES, c.env.DB, getR2PublicUrl(c.env),
          { companyId, sku, filenamePart, maskBytes: base64ToBuffer(maskDataUrl) }
        )
        logger.debug(`🎭 Mask saved: ${maskUrl}`)
      } catch (maskErr: unknown) {
        logger.error('❌ Failed to save mask:', maskErr instanceof Error ? maskErr.message : String(maskErr))
      }
    }

    const processedUrl = `${getR2PublicUrl(c.env)}/${r2Key}`
    return c.json({
      success: true,
      sku,
      processedUrl,
      maskUrl,
      r2Key,
      filenamePart,
      message: 'Processed image uploaded successfully',
    })
  } catch (error: unknown) {
    logError('Upload processed image', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

export default bgRemoval

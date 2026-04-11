/**
 * Image Download & Save API
 *
 * GET  /api/download-image/:imageId            オリジナル画像URL取得（image-proxy経由）
 * GET  /api/download-processed-image/:imageId  処理済み画像をbase64で取得
 * GET  /api/download-product-data/:imageId     最優先画像DL（f > p > original > image-upload-api）
 * POST /api/save-edited-image/:imageId         最終編集済み画像をR2に保存
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { markImageAsFinal } from '../helpers/image-status'
import { getImageUploadApiUrl } from '../helpers/image-url'
import { logger } from '../../../shared/helpers/logger'
import {
  parseImageId,
  resolveR2Image,
  findOriginalImageKey,
  r2ObjectToDataUrl,
  buildDownloadFilename,
} from '../helpers/image-id-parser'

const download = new Hono<AppEnv>()

// ────────────────────────────────────────────────
// GET /api/download-image/:imageId
// オリジナル画像の image-proxy URL を返す
// ────────────────────────────────────────────────
download.get('/api/download-image/:imageId', async (c) => {
  const imageId = c.req.param('imageId')
  try {
    const parsed = parseImageId(imageId)
    if (!parsed) {
      return c.json({ error: 'Invalid image ID format' }, 400)
    }
    const { sku, filenamePart } = parsed
    const companyId = getCompanyId(c)
    logger.debug('[DOWNLOAD-ORIGINAL]', { imageId, sku, filenamePart, companyId })

    const found = await findOriginalImageKey(c.env.PRODUCT_IMAGES, companyId, sku, filenamePart)
    if (!found) {
      return c.json({ error: 'Image not found', message: 'オリジナル画像が見つかりません' }, 404)
    }

    const proxyUrl = `/api/image-proxy/${sku}/${filenamePart}.${found.ext}`
    const filename = `${sku}_${filenamePart}_original.${found.ext}`
    return c.json({ imageUrl: proxyUrl, filename, sku })
  } catch (error: any) {
    logError('Download image', error, { imageId })
    return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500)
  }
})

// ────────────────────────────────────────────────
// GET /api/download-processed-image/:imageId
// 白抜き済み(_p.png)画像を base64 data URL で返す
// ────────────────────────────────────────────────
download.get('/api/download-processed-image/:imageId', async (c) => {
  const imageId = c.req.param('imageId')
  try {
    const parsed = parseImageId(imageId)
    if (!parsed) {
      return c.json({ error: 'Invalid image ID format' }, 400)
    }
    const { sku, filenamePart } = parsed
    const companyId = getCompanyId(c)
    logger.debug('[DOWNLOAD-PROCESSED]', { imageId, sku, companyId })

    // processed のみ取得（final / original はスキップ）
    const resolved = await resolveR2Image(
      c.env.PRODUCT_IMAGES, companyId, sku, filenamePart,
      { skipFinal: true, skipOriginal: true }
    )

    if (!resolved) {
      return c.json({
        error: 'No processed image available',
        message: '白抜き処理が完了していません',
      }, 404)
    }

    const dataUrl = await r2ObjectToDataUrl(resolved.r2Object, resolved.mimeType)
    const filename = `${sku}_${filenamePart}_processed.png`
    logger.debug(`[DOWNLOAD-PROCESSED] base64 length=${dataUrl.length}`)

    return c.json({ imageUrl: dataUrl, filename, sku, status: 'completed' })
  } catch (error: any) {
    logError('Download processed image', error, { imageId })
    return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500)
  }
})

// ────────────────────────────────────────────────
// GET /api/download-product-data/:imageId
// 商品データDL用：f > p > original(R2) > image-upload-api
// requireFirebaseAuth で認証必須
// ────────────────────────────────────────────────
download.get('/api/download-product-data/:imageId', requireFirebaseAuth, async (c) => {
  const imageId = c.req.param('imageId')
  try {
    const parsed = parseImageId(imageId)
    if (!parsed) {
      return c.json({ error: 'Invalid image ID format' }, 400)
    }
    const { sku, filenamePart } = parsed
    const companyId = getCompanyId(c)
    logger.debug('[DOWNLOAD-PRODUCT-DATA]', { imageId, sku, filenamePart, companyId })

    // Step 1-3: R2 から f → p → original を探索
    const resolved = await resolveR2Image(c.env.PRODUCT_IMAGES, companyId, sku, filenamePart)

    if (resolved) {
      // R2 から見つかった場合 — proxy URL を返す
      const keyFilename = resolved.key.split('/').pop()!
      const imageUrl = `/api/image-proxy/${sku}/${keyFilename}`
      const filename = buildDownloadFilename(sku, filenamePart, resolved.variant, resolved.key)
      logger.debug('[DOWNLOAD-PRODUCT-DATA] R2 hit', { variant: resolved.variant, key: resolved.key })
      return c.json({ imageUrl, filename, sku, status: resolved.variant })
    }

    // Step 4: image-upload-api 経由でオリジナルを探索
    const fallbackResult = await fetchFromImageUploadApi(c.env, companyId, sku, filenamePart)
    if (fallbackResult) {
      return c.json(fallbackResult)
    }

    // Step 5: どこにも見つからない
    return c.json({
      error: 'No image available',
      message: '画像が見つかりません（R2 / image-upload-api の両方で見つかりませんでした）',
    }, 404)
  } catch (error: any) {
    logError('Download product data', error, { imageId })
    return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500)
  }
})

// ────────────────────────────────────────────────
// POST /api/save-edited-image/:imageId
// 最終編集済み画像を R2 に保存 + DB ステータス更新
// ────────────────────────────────────────────────
download.post('/api/save-edited-image/:imageId', requireFirebaseAuth, async (c) => {
  const imageId = c.req.param('imageId')
  try {
    const body = await c.req.json()
    const imageData: string | undefined = body.imageData
    if (!imageData) {
      return c.json({ error: 'imageData is required' }, 400)
    }

    const parsed = parseImageId(imageId)
    if (!parsed) {
      return c.json({ error: 'Invalid imageId format' }, 400)
    }
    const { sku, filenamePart } = parsed

    const user = c.get('user') as { companyId?: string } | undefined
    const companyId = user?.companyId || getCompanyId(c)
    logger.debug('[SAVE-EDITED]', { imageId, sku, companyId })

    const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`

    // base64 → binary
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const binaryString = atob(base64Data)
    const imageBuffer = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      imageBuffer[i] = binaryString.charCodeAt(i)
    }

    logger.debug(`[SAVE-EDITED] size=${imageBuffer.length} bytes, key=${finalKey}`)

    await c.env.PRODUCT_IMAGES.put(finalKey, imageBuffer, {
      httpMetadata: { contentType: 'image/png' },
    })

    await markImageAsFinal(c.env.DB, sku, companyId, filenamePart)
    logger.debug(`[SAVE-EDITED] done: ${finalKey}`)

    return c.json({ success: true, imageId, finalKey, message: 'Final image saved successfully' })
  } catch (error: any) {
    logError('Save edited image', error, { imageId })
    return c.json(createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED), 500)
  }
})

// ── Private: image-upload-api fallback ─────────

const FALLBACK_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

async function fetchFromImageUploadApi(
  env: AppEnv['Bindings'],
  companyId: string,
  sku: string,
  filenamePart: string,
): Promise<{ imageUrl: string; filename: string; sku: string; status: string } | null> {
  const baseUrl = getImageUploadApiUrl(env)

  for (const ext of FALLBACK_EXTENSIONS) {
    const testUrl = `${baseUrl}/${companyId}/${sku}/${filenamePart}.${ext}`
    try {
      const headRes = await fetch(testUrl, { method: 'HEAD' })
      if (!headRes.ok) continue

      // HEAD が 200 → 本体を取得して base64 化
      const res = await fetch(testUrl)
      if (!res.ok) continue

      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext
      const dataUrl = `data:image/${mime};base64,${btoa(binary)}`
      const filename = `${filenamePart}_original.${ext}`

      logger.debug(`[FALLBACK] Found via image-upload-api: ${testUrl}`)
      return { imageUrl: dataUrl, filename, sku, status: 'original' }
    } catch {
      // 次の拡張子を試す
    }
  }
  return null
}

export default download

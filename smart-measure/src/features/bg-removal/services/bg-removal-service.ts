/**
 * Background Removal Orchestration Service
 *
 * Priority:
 *   1. withoutBG Focus API (Free, Hugging Face Spaces) — mask付き
 *   2. Cloudflare AI (@cf/bria/rmbg-1.4) — fallback、maskなし
 *   3. Fal.ai BRIA API — API key設定時または明示的に指定した場合
 */
import type { HonoContext } from '../../../types/bindings'
import { logger } from '../../../shared/helpers/logger'
import { removeBackgroundWithWithoutBG } from './withoutbg'
import { removeBackgroundWithCloudflareAI } from './cloudflare-ai'
import { callBriaApi, isBriaApiKeyValid } from './bria-api'
import { base64ToBuffer, uploadAndUpdateDatabase, saveMaskToR2AndDb } from '../helpers/r2-uploader'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'

export type BgRemovalSuccess = { success: true; processedUrl: string; maskUrl: string | null; message: string }
export type BgRemovalFailure = { success: false; error: string }
export type BgRemovalServiceResult = BgRemovalSuccess | BgRemovalFailure

export async function removeProductImageBackground(
  c: HonoContext,
  originalUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string,
  options?: { model?: string; useBriaApi?: boolean }
): Promise<BgRemovalServiceResult> {
  const { model = 'cloudflare-ai', useBriaApi = false } = options ?? {}
  const r2PublicUrl = getR2PublicUrl(c.env)

  // ── Priority 1: Fal.ai BRIA API ────────────────────────────────────────────
  const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY
  if (isBriaApiKeyValid(briaApiKey) && (useBriaApi || model === 'bria')) {
    logger.debug('🌐 Using Fal.ai BRIA RMBG 2.0 API')
    if (!originalUrl.startsWith('data:')) {
      const briaResult = await callBriaApi(originalUrl, briaApiKey!)
      if (briaResult.success && briaResult.imageUrl) {
        const imageBuffer = await fetch(briaResult.imageUrl).then(r => r.arrayBuffer())
        const { publicUrl } = await uploadAndUpdateDatabase(
          c.env.PRODUCT_IMAGES, c.env.DB, r2PublicUrl,
          { companyId, sku, filenamePart, imageBuffer }
        )
        return { success: true, processedUrl: publicUrl, maskUrl: null, message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)' }
      }
      logger.error('BRIA API failed, falling back:', briaResult.error)
    }
  }

  // ── Priority 2: withoutBG Focus API (mask付き) ─────────────────────────────
  if (!originalUrl.startsWith('data:')) {
    logger.debug('🚀 Starting withoutBG Focus model')
    try {
      const result = await removeBackgroundWithWithoutBG(originalUrl)
      logger.debug(`📦 withoutBG result: success=${result.success}, hasMask=${!!result.maskDataUrl}`)

      if (result.success && result.imageDataUrl) {
        // 処理済み画像をR2保存 + D1のprocessed_imagesを更新
        const { publicUrl } = await uploadAndUpdateDatabase(
          c.env.PRODUCT_IMAGES, c.env.DB, r2PublicUrl,
          { companyId, sku, filenamePart, imageBuffer: base64ToBuffer(result.imageDataUrl) }
        )

        // マスク画像をR2保存 + D1のmask_images_r2を更新
        let maskUrl: string | null = null
        if (result.maskDataUrl) {
          try {
            maskUrl = await saveMaskToR2AndDb(
              c.env.PRODUCT_IMAGES, c.env.DB, r2PublicUrl,
              { companyId, sku, filenamePart, maskBytes: base64ToBuffer(result.maskDataUrl) }
            )
          } catch (maskErr: any) {
            logger.error('❌ Failed to save mask:', maskErr.message)
          }
        } else {
          logger.warn('⚠️ No mask data returned from withoutBG API')
        }

        return { success: true, processedUrl: publicUrl, maskUrl, message: 'Background removed using withoutBG Focus (Free)' }
      }
    } catch (apiError: any) {
      logger.error('❌ withoutBG error:', apiError.message)
      // fallthrough to Cloudflare AI
    }
  } else {
    logger.debug('📦 Base64 image — skipping withoutBG (URL only)')
  }

  // ── Priority 3: Cloudflare AI (maskなし fallback) ──────────────────────────
  if (c.env.AI) {
    logger.debug('🤖 Using Cloudflare AI @cf/bria/rmbg-1.4 as fallback')
    const result = await removeBackgroundWithCloudflareAI(c.env.AI, originalUrl)
    if (result.success && result.imageBuffer) {
      const { publicUrl } = await uploadAndUpdateDatabase(
        c.env.PRODUCT_IMAGES, c.env.DB, r2PublicUrl,
        { companyId, sku, filenamePart, imageBuffer: result.imageBuffer }
      )
      return { success: true, processedUrl: publicUrl, maskUrl: null, message: 'Background removed using Cloudflare AI (Free)' }
    }
    throw new Error(result.error || 'Cloudflare AI processing failed')
  }

  return { success: false, error: 'Background removal failed: all services unavailable.' }
}

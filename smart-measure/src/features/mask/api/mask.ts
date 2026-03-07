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
import { MaskRepository } from '../repositories/mask-repository'
import { MaskService } from '../services/mask-service'

const maskApi = new Hono<AppEnv>()

// Firebase認証ミドルウェアを全エンドポイントに適用
// TEMPORARY: Allow fallback to cookie-based company_id for debugging
// maskApi.use('*', requireFirebaseAuth)

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
  logger.info(`🔵 === MASK SAVE REQUEST START === SKU: ${sku}`)
  try {
    // Check user context from Firebase auth
    const user = c.get?.('user') as { companyId?: string; email?: string; uid?: string } | undefined
    logger.info(`🔐 Firebase user context:`, {
      hasUser: !!user,
      uid: user?.uid,
      email: user?.email,
      companyId: user?.companyId
    })
    
    const companyId = getCompanyId(c)
    logger.info(`👤 Company ID (final): ${companyId}`)
    
    if (!companyId || companyId === 'test_company') {
      logger.warn(`⚠️ Using fallback company ID: ${companyId}`)
    }
    
    const body = await c.req.json()
    const { maskDataUrl, filenamePart } = body
    logger.info(`📦 Request body: filenamePart=${filenamePart}, maskDataUrl length=${maskDataUrl?.length || 0}`)

    // ── バリデーション ──
    if (!maskDataUrl || !maskDataUrl.startsWith('data:image/png;base64,')) {
      logger.warn(`❌ Invalid mask data: ${maskDataUrl?.substring(0, 50)}...`)
      return c.json({ error: 'Invalid mask data' }, 400)
    }
    if (!c.env.DB) {
      logger.error(`❌ DB not configured!`)
      return c.json({ error: 'Database not configured' }, 500)
    }
    if (!c.env.PRODUCT_IMAGES) {
      logger.error(`❌ R2 bucket not configured!`)
      return c.json({ error: 'R2 bucket not configured' }, 500)
    }
    logger.debug(`✅ Environment check passed:`, {
      hasDB: !!c.env.DB,
      hasR2: !!c.env.PRODUCT_IMAGES,
      r2PublicUrl: getR2PublicUrl(c.env)
    })

    // ── ビジネスロジックはServiceに委譲 ──
    logger.info(`📥 Step A: Preparing to save mask`)
    logger.info(`📥 Parameters:`, { sku, companyId, filenamePart, maskDataUrlLength: maskDataUrl.length })
    
    try {
      logger.info(`📥 Step B: Calling maskService.saveMask`)
      const result = await maskService.saveMask(
        c.env.DB,
        c.env.PRODUCT_IMAGES,
        getR2PublicUrl(c.env),
        { sku, companyId, maskDataUrl, filenamePart }
      )
      logger.info(`✅ Step C: Mask saved successfully: ${result.r2Key} → ${result.maskUrl}`)
      
      return c.json({
        success: true,
        sku,
        companyId,
        ...result,
        message: `Mask saved: ${result.r2Key}`,
      })
    } catch (serviceError) {
      logger.error(`❌ Step B failed: maskService.saveMask threw error:`, {
        errorMessage: serviceError instanceof Error ? serviceError.message : String(serviceError),
        errorName: serviceError instanceof Error ? serviceError.name : 'Unknown',
        errorStack: serviceError instanceof Error ? serviceError.stack : undefined
      })
      throw serviceError
    }
  } catch (error) {
    logError('Mask save', error, { sku })
    logger.error(`❌ Mask save exception:`, {
      sku,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    })
    return c.json(
      {
        ...createSafeErrorResponse(error, ErrorCode.UPLOAD_FAILED),
        debug: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined
        }
      },
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

export default maskApi

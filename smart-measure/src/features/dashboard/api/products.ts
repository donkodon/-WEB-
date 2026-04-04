/**
 * products.ts - HTTP層（ルーティングのみ）
 * ビジネスロジックは DashboardService へ、DB操作は DashboardRepository へ委譲
 */
import { Hono } from 'hono'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId, FIXED_COMPANY_ID } from '../../auth/helpers/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { DashboardRepository } from '../repositories/dashboard-repository'
import { DashboardService } from '../services/dashboard-service'

const productsRouter = new Hono<AppEnv>()

// Apply Firebase authentication to all dashboard API endpoints
productsRouter.use('*', requireFirebaseAuth)

// Composition Root: モジュールスコープで一度だけ生成（per-request生成を排除）
const dashboardService = new DashboardService(new DashboardRepository())

// --- API: Dashboard Products with Pagination ---
productsRouter.get('/api/dashboard/products', async (c) => {
  let page = 1
  let perPage = 12

  try {
    const user = c.get('user')
    const companyId = user?.companyId || FIXED_COMPANY_ID
    logger.debug(`📊 API Dashboard request: user=${user?.email}, company_id=${companyId}`)

    page = parseInt(c.req.query('page') || '1', 10)
    perPage = parseInt(c.req.query('perPage') || '12', 10)
    const startDate = c.req.query('startDate') || null
    const endDate = c.req.query('endDate') || null

    const validationError = dashboardService.validatePagination(page, perPage)
    if (validationError) {
      return c.json({ success: false, error: validationError }, 400)
    }

    logger.debug(`📊 API Dashboard request: company_id=${companyId}, page=${page}, perPage=${perPage}, startDate=${startDate}, endDate=${endDate}`)

    // Get base URL from request headers
    const protocol = c.req.header('x-forwarded-proto') || 'https'
    const host = c.req.header('host') || 'smart-measure.pages.dev'
    const baseUrl = `${protocol}://${host}`
    logger.debug(`🌐 Base URL: ${baseUrl}`)

    const r2PublicUrl = getR2PublicUrl(c.env)
    const result = await dashboardService.getDashboardProducts(
      c.env.DB, 
      companyId, 
      page, 
      perPage, 
      r2PublicUrl, 
      baseUrl,
      startDate,
      endDate
    )

    return c.json({ success: true, ...result })

  } catch (error: unknown) {
    logError('Dashboard API', error, { page, perPage })
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500)
  }
})

// --- API: Bulk Import for Mobile App (JSON Format) ---
productsRouter.post('/api/products/bulk-import', async (c) => {
  try {
    const body = await c.req.json() as { products?: unknown[] }
    const { products } = body

    if (!products || !Array.isArray(products)) {
      return c.json({ success: false, error: 'Invalid request: products array required' }, 400)
    }

    const companyId = getCompanyId(c)
    logger.debug(`📦 CSV Import: company_id=${companyId}, products=${products.length}`)

    const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev'

    const result = await dashboardService.bulkImportWithMobileSync(
      c.env.DB, companyId,
      products as import('../../../shared/interfaces/dashboard-repository.interface').ImportProduct[],
      MOBILE_API_URL
    )

    return c.json({
      success: true,
      message: 'マスタデータを更新しました',
      inserted: result.inserted,
      updated: result.updated,
      total: result.total,
      mobileSynced: result.mobileSynced,
    })

  } catch (error: unknown) {
    logError('Bulk import', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500)
  }
})

// --- API: Export Data (For External Apps) ---
productsRouter.get('/api/products/list', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, sku, name, brand, size, color,
           price_sale, stock_quantity, status,
           barcode, rank, created_at
    FROM product_master
    ORDER BY id DESC
  `).all()

  return c.json({
    source: 'SmartMeasure API',
    timestamp: new Date().toISOString(),
    count: result.results.length,
    products: result.results,
  })
})

// --- API: Search Product by SKU (for Mobile App) ---
productsRouter.get('/api/products/search', async (c) => {
  try {
    const sku = c.req.query('sku')
    if (!sku) {
      return c.json({ success: false, error: 'SKU parameter required' }, 400)
    }

    const companyId = getCompanyId(c)
    const r2PublicUrl = getR2PublicUrl(c.env)
    const searchResult = await dashboardService.searchProductBySku(c.env.DB, sku, companyId, r2PublicUrl)
    if (!searchResult) {
      return c.json({ success: false, error: 'Product not found' }, 404)
    }

    const capturedItems = searchResult.images.map((img, index) => ({
      id: `mobile_${index}`,
      sku,
      item_code: img.filename.replace('.jpg', ''),
      image_urls: JSON.stringify([img.url]),
      source: 'mobile',
      condition: 'Unknown',
      photographed_at: img.uploaded,
    }))

    return c.json({
      success: true,
      product: {
        ...searchResult.product,
        hasCapturedData: searchResult.hasCapturedData,
        capturedItems,
        latestItem: capturedItems.length > 0 ? capturedItems[0] : null,
        capturedCount: searchResult.capturedCount,
        mobileAppImageCount: searchResult.images.length,
      },
    })

  } catch (error: unknown) {
    logError('Product search', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500)
  }
})

// --- API: Download Product Data (Images + CSV) with Billing ---
productsRouter.post('/api/products/download', async (c) => {
  try {
    const { imageIds, skus } = await c.req.json()

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return c.json({ success: false, error: 'Image IDs required' }, 400)
    }
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return c.json({ success: false, error: 'SKUs required for billing' }, 400)
    }

    const companyId = getCompanyId(c)
    logger.debug(`📦 Product download request: company_id=${companyId}, images=${imageIds.length}, skus=${skus.length}`)

    const sessionId = crypto.randomUUID()
    return c.json({ success: true, sessionId, imageIds, skus, message: 'Download authorized' })

  } catch (error: unknown) {
    logError('Product download', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500)
  }
})

export default productsRouter

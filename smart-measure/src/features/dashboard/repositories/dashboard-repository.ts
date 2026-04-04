/**
 * DashboardRepository - ダッシュボードのDB操作実装クラス
 */
import type {
  IDashboardRepository,
  DashboardDataResult,
  DashboardProductRecord,
  DashboardImageRecord,
  ImportProduct,
  BulkImportResult,
  ProductWithImages,
} from '../../../shared/interfaces/dashboard-repository.interface'
import { ImageUrlHelper, getImageUploadApiUrl } from '../../image-editor/helpers/image-url'
import { getImageDisplayUrl } from '../../image-editor/helpers/image-status'
import { logger } from '../../../shared/helpers/logger'

// ── 補助関数: ページネーション計算 ───────────────────────────────────────────
function buildPagination(page: number, perPage: number, total: number) {
  const totalPages = Math.ceil(total / perPage)
  return { page, perPage, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
}

// ── 補助関数: 通常画像のレコードを生成 ──────────────────────────────────────
function buildImageRecord(
  sku: string, imageUrl: string, index: number,
  processedImages: string[], finalImages: string[],
  companyId: string, updatedAt: string, imageUploadApiUrl: string,
  baseUrl: string
): DashboardImageRecord | null {
  const r2Path = (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))
    ? ImageUrlHelper.toR2Path(imageUrl) : imageUrl
  const pathParts = r2Path.split('/')
  const filename = pathParts[pathParts.length - 1]
  const r2Key = r2Path.startsWith(`${companyId}/`) ? r2Path : `${companyId}/${r2Path}`
  const _proxyUrl = `${imageUploadApiUrl}/${r2Key}`
  const imageId = `r2_${sku}_${filename.replace(/\.[^/.]+$/, '')}`
  const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '')
  const imageStatus = getImageDisplayUrl(sku, filenameWithoutExt, processedImages, finalImages, companyId, updatedAt)
  const status = imageStatus.status === 'final' ? 'final' : imageStatus.status === 'processed' ? 'processed' : 'ready'
  const fileExtension = filename.match(/\.[^/.]+$/)?.[0] || '.jpg'
  // Use absolute URLs for production environment
  const originalUrl = `${baseUrl}/api/image-proxy/${sku}/${filenameWithoutExt}${fileExtension}`
  const processedUrlFull = imageStatus.url && !imageStatus.url.startsWith('http') ? `${baseUrl}${imageStatus.url}` : imageStatus.url
  return {
    id: imageId, original_url: originalUrl,
    processed_url: processedUrlFull, display_url: processedUrlFull, status,
    created_at: new Date().toISOString(), filename, sku, sequence: index + 1, is_main: index === 0, updated_at: updatedAt,
  }
}

// ── 補助関数: 採寸画像レコードを生成（存在する場合のみ） ──────────────────
function buildMeasurementImageRecord(
  sku: string, annotatedImageUrl: string | undefined, maskImageUrl: string | null,
  processedImages: string[], imageCount: number, updatedAt: string,
  baseUrl: string
): DashboardImageRecord | null {
  if (!annotatedImageUrl) return null
  const isProcessed = processedImages.includes('measurement')
  // Use absolute URLs for production environment
  const processedUrl = isProcessed
    ? `${baseUrl}/api/image-proxy/${sku}/measurement_p.png?v=${new Date(updatedAt).getTime()}` : null
  // Convert relative URLs to absolute
  const absoluteAnnotatedUrl = annotatedImageUrl && !annotatedImageUrl.startsWith('http')
    ? `${baseUrl}${annotatedImageUrl}` : annotatedImageUrl
  const absoluteMaskUrl = maskImageUrl && !maskImageUrl.startsWith('http')
    ? `${baseUrl}${maskImageUrl}` : maskImageUrl
  return {
    id: `measurement_${sku}`, original_url: absoluteAnnotatedUrl,
    processed_url: processedUrl, display_url: processedUrl || absoluteAnnotatedUrl,
    mask_url: absoluteMaskUrl || null, status: isProcessed ? 'completed' : 'measurement',
    created_at: new Date().toISOString(), filename: 'measurement.png',
    sku, sequence: imageCount + 1, is_main: false, is_measurement: true, updated_at: updatedAt,
  }
}

// ── 補助関数: DB結果を DashboardProductRecord マップに変換 ──────────────────
function buildSkuMap(
  itemsResult: { results: Record<string, unknown>[] },
  masterMap: Map<string, Record<string, unknown>>,
  companyId: string, imageUploadApiUrl: string,
  baseUrl: string
): Map<string, DashboardProductRecord> {
  const skuMap = new Map<string, DashboardProductRecord>()
  for (const item of itemsResult.results) {
    const pi = item as Record<string, unknown>
    const sku = pi.sku as string
    let imageUrls: string[] = []
    try { imageUrls = JSON.parse(pi.image_urls as string || '[]') } catch {
      logger.error(`❌ Failed to parse image_urls for SKU ${sku}`); continue
    }
    if (imageUrls.length === 0) continue

    const pm = masterMap.get(sku)
    if (!skuMap.has(sku)) {
      skuMap.set(sku, {
        id: sku, sku,
        name: pm?.name as string || `商品 ${sku}`,
        brand: pm?.brand as string | null ?? null,
        size: pm?.size as string | null ?? null,
        color: pm?.color as string | null ?? null,
        price_sale: pm?.price_sale as number || 0,
        barcode: pm?.barcode as string | null ?? null,
        category: pm?.category as string | null ?? null,
        rank: pm?.rank as string | null ?? null,
        images: [], has_measurement: false,
      } satisfies DashboardProductRecord)
    }

    const productData = skuMap.get(sku)!
    if (pi.has_measurement) productData.has_measurement = true

    let processedImages: string[] = []
    let finalImages: string[] = []
    try {
      processedImages = JSON.parse(pi.processed_images as string || '[]')
      finalImages = JSON.parse(pi.final_images as string || '[]')
    } catch { /* ignore */ }

    const updatedAt = pi.updated_at as string || new Date().toISOString()
    for (let i = 0; i < imageUrls.length; i++) {
      const record = buildImageRecord(sku, imageUrls[i], i, processedImages, finalImages, companyId, updatedAt, imageUploadApiUrl, baseUrl)
      if (record) productData.images.push(record)
    }

    // 背景削除マスク(mask_image_url_r2)を優先、なければ採寸マスク(mask_image_url)
    const maskUrl = (pi.mask_image_url_r2 as string | null) || (pi.mask_image_url as string | null)
    const measureRecord = buildMeasurementImageRecord(
      sku, pi.annotated_image_url as string | undefined,
      maskUrl,
      processedImages, imageUrls.length, updatedAt,
      baseUrl
    )
    if (measureRecord && productData.has_measurement) productData.images.push(measureRecord)
  }
  return skuMap
}

export class DashboardRepository implements IDashboardRepository {
  async fetchDashboardProducts(
    db: D1Database, companyId: string, page: number, perPage: number, r2PublicUrl: string,
    baseUrl?: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<DashboardDataResult> {
    // Default to production URL if not provided
    const finalBaseUrl = baseUrl || 'https://smart-measure.pages.dev'
    logger.debug(`📊 Fetching dashboard: company_id=${companyId}, page=${page}, baseUrl=${finalBaseUrl}, startDate=${startDate}, endDate=${endDate}`)

    // Build date filter conditions
    let dateFilter = ''
    const bindParams: (string | number)[] = [companyId]
    
    if (startDate && endDate) {
      // Date range filter: startDate 00:00:00 to endDate 23:59:59
      dateFilter = ' AND DATE(pi.photographed_at) >= DATE(?) AND DATE(pi.photographed_at) <= DATE(?)'
      bindParams.push(startDate, endDate)
    } else if (startDate) {
      // Single date filter: exact date match (00:00:00 to 23:59:59)
      dateFilter = ' AND DATE(pi.photographed_at) = DATE(?)'
      bindParams.push(startDate)
    } else if (endDate) {
      // End date only: up to end date
      dateFilter = ' AND DATE(pi.photographed_at) <= DATE(?)'
      bindParams.push(endDate)
    }

    const countResult = await db.prepare(`
      SELECT COUNT(DISTINCT pi.sku) as total FROM product_items pi
      WHERE pi.company_id = ? AND pi.image_urls IS NOT NULL AND pi.image_urls != '[]'${dateFilter}
    `).bind(...bindParams).first<{ total: number }>()

    const total = countResult?.total || 0
    const totalPages = Math.ceil(total / perPage)
    const emptyPagination = buildPagination(page, perPage, total)
    if (total === 0 || page > totalPages) {
      return { products: [], pagination: { ...emptyPagination, hasNext: false } }
    }

    const offset = (page - 1) * perPage
    const paginatedSkus = await db.prepare(`
      SELECT DISTINCT pi.sku 
      FROM product_items pi
      WHERE pi.company_id = ? AND pi.image_urls IS NOT NULL AND pi.image_urls != '[]'${dateFilter}
      ORDER BY pi.photographed_at DESC, pi.sku
      LIMIT ? OFFSET ?
    `).bind(...bindParams, perPage, offset).all<{ sku: string }>()

    const skuList = paginatedSkus.results.map((r: { sku: string }) => r.sku)
    if (skuList.length === 0) {
      return { products: [], pagination: { ...emptyPagination, hasNext: false } }
    }

    const placeholders = skuList.map(() => '?').join(',')
    const masterResult = await db.prepare(`
      SELECT sku, name, brand, size, color, price_sale, barcode, category, rank
      FROM product_master WHERE sku IN (${placeholders}) ORDER BY sku
    `).bind(...skuList).all()

    const masterMap = new Map<string, Record<string, unknown>>()
    for (const item of masterResult.results) masterMap.set(item.sku as string, item as Record<string, unknown>)

    const itemsResult = await db.prepare(`
      SELECT sku, image_urls, updated_at,
             CASE WHEN ai_landmarks IS NOT NULL THEN 1 ELSE 0 END as has_measurement,
             COALESCE(annotated_image_url, measurement_image_url) as annotated_image_url,
             mask_image_url,
             mask_image_url_r2,
             COALESCE(processed_images, '[]') as processed_images,
             COALESCE(final_images, '[]') as final_images,
             COALESCE(image_status, 'original') as image_status
      FROM product_items
      WHERE company_id = ? AND sku IN (${placeholders}) AND image_urls IS NOT NULL AND image_urls != '[]'
    `).bind(companyId, ...skuList).all()

    const imageUploadApiUrl = getImageUploadApiUrl({ IMAGE_UPLOAD_API_URL: r2PublicUrl })
    const skuMap = buildSkuMap(itemsResult, masterMap, companyId, imageUploadApiUrl, finalBaseUrl)

    const products: DashboardProductRecord[] = []
    for (const sku of skuList) {
      const product = skuMap.get(sku)
      if (product && product.images.length > 0) products.push(product)
    }
    logger.debug(`📄 Page ${page}/${totalPages}: ${products.length} products`)
    return { products, pagination: buildPagination(page, perPage, total) }
  }

  async bulkImportProducts(db: D1Database, companyId: string, products: ImportProduct[]): Promise<BulkImportResult> {
    let inserted = 0, updated = 0
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO product_master (
        sku, barcode, name, brand, category, size, color, price_sale, status, company_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
        (SELECT created_at FROM product_master WHERE sku = ? AND company_id = ?), ?
      ))
    `)
    const batch = []
    for (const product of products) {
      if (!product.sku) continue
      const existing = await db.prepare('SELECT sku FROM product_master WHERE sku = ? AND company_id = ?')
        .bind(product.sku, companyId).first()
      existing ? updated++ : inserted++
      const now = new Date().toISOString()
      batch.push(stmt.bind(
        product.sku, product.barcode ?? null, product.name || 'Unknown Product',
        product.brand ?? null, product.category ?? null, product.size ?? null,
        product.color ?? null, product.price || 0, 'Active', companyId,
        product.sku, companyId, now
      ))
      if (batch.length >= 50) { await db.batch(batch); batch.length = 0 }
    }
    if (batch.length > 0) await db.batch(batch)
    return { inserted, updated, total: products.length }
  }

  async findProductWithImages(
    db: D1Database, sku: string, companyId: string
  ): Promise<ProductWithImages> {
    const product = await db.prepare(`
      SELECT sku, barcode, name, brand, category, size, color,
             price_sale as price, status, created_at, created_at as updated_at
      FROM product_master WHERE sku = ?
    `).bind(sku).first()
    if (!product) return { product: null, imageUrls: [], updatedAt: null }

    const productItem = await db.prepare(
      `SELECT image_urls, updated_at FROM product_items WHERE sku = ? AND company_id = ? LIMIT 1`
    ).bind(sku, companyId).first()

    let imageUrls: string[] = []
    if (productItem?.image_urls) {
      try { imageUrls = JSON.parse(productItem.image_urls as string || '[]') } catch { /* ignore */ }
    }
    return { product: product as Record<string, unknown>, imageUrls, updatedAt: productItem?.updated_at as string | null }
  }
}

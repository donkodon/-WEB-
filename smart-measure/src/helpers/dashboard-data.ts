import type { AppEnv } from '../types/bindings'
import type { ProductMaster, ProductItem, DashboardProduct } from '../types/database'
import { ImageUrlHelper, getImageUploadApiUrl } from './image-url'
import { getImageDisplayUrl } from './image-status'
import { logger } from './logger'

export interface DashboardDataOptions {
  companyId: string
  page?: number
  perPage?: number
  env: AppEnv['Bindings']
}

export interface DashboardDataResult {
  products: DashboardProduct[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * Fetch dashboard products data with pagination
 * 
 * PERFORMANCE OPTIMIZED:
 * - Uses SQL-level pagination (LIMIT/OFFSET) instead of loading all rows into memory
 * - Only fetches product_items that have images (JOIN-based filtering)
 * - COUNT query runs separately for pagination metadata
 */
export async function fetchDashboardData(options: DashboardDataOptions): Promise<DashboardDataResult> {
  const { companyId, page = 1, perPage = 12, env } = options
  
  logger.debug(`📊 Fetching dashboard data: company_id=${companyId}, page=${page}, perPage=${perPage}`)
  
  // ========================================
  // Step 1: Count total SKUs that have images (for pagination metadata)
  // ========================================
  const countResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT pi.sku) as total
    FROM product_items pi
    WHERE pi.company_id = ?
      AND pi.image_urls IS NOT NULL 
      AND pi.image_urls != '[]'
  `).bind(companyId).first<{ total: number }>()
  
  const total = countResult?.total || 0
  const totalPages = Math.ceil(total / perPage)
  
  logger.debug(`📦 Total SKUs with images: ${total}, Pages: ${totalPages}`)
  
  if (total === 0 || page > totalPages) {
    return {
      products: [],
      pagination: { page, perPage, total, totalPages, hasNext: false, hasPrev: page > 1 }
    }
  }
  
  // ========================================
  // Step 2: Get paginated SKU list (only SKUs that have images)
  // ========================================
  const offset = (page - 1) * perPage
  
  const paginatedSkus = await env.DB.prepare(`
    SELECT DISTINCT pi.sku
    FROM product_items pi
    WHERE pi.company_id = ?
      AND pi.image_urls IS NOT NULL 
      AND pi.image_urls != '[]'
    ORDER BY pi.sku
    LIMIT ? OFFSET ?
  `).bind(companyId, perPage, offset).all<{ sku: string }>()
  
  const skuList = paginatedSkus.results.map(r => r.sku)
  
  if (skuList.length === 0) {
    return {
      products: [],
      pagination: { page, perPage, total, totalPages, hasNext: false, hasPrev: page > 1 }
    }
  }
  
  logger.debug(`📄 Page ${page}: Fetching data for ${skuList.length} SKUs`)
  
  // ========================================
  // Step 3: Fetch product_master data for these SKUs only
  // ========================================
  const placeholders = skuList.map(() => '?').join(',')
  
  const productMasterResult = await env.DB.prepare(`
    SELECT 
      sku, name, brand, size, color,
      price_sale, barcode, category, rank
    FROM product_master
    WHERE sku IN (${placeholders})
    ORDER BY sku
  `).bind(...skuList).all()
  
  // Build SKU -> master data map
  const masterMap = new Map<string, any>()
  for (const item of productMasterResult.results) {
    const pm = item as ProductMaster
    masterMap.set(pm.sku, pm)
  }
  
  // ========================================
  // Step 4: Fetch product_items data for these SKUs only
  // ========================================
  const productItemsResult = await env.DB.prepare(`
    SELECT sku, image_urls, updated_at, 
           CASE WHEN ai_landmarks IS NOT NULL THEN 1 ELSE 0 END as has_measurement,
           COALESCE(measurement_image_url, annotated_image_url) as measurement_image_url,
           mask_image_url,
           COALESCE(processed_images, '[]') as processed_images,
           COALESCE(final_images, '[]') as final_images,
           COALESCE(image_status, 'original') as image_status
    FROM product_items
    WHERE company_id = ?
      AND sku IN (${placeholders})
      AND image_urls IS NOT NULL 
      AND image_urls != '[]'
  `).bind(companyId, ...skuList).all()
  
  logger.debug(`✅ Retrieved ${productItemsResult.results.length} product_items for page ${page}`)
  
  const IMAGE_UPLOAD_API_URL = getImageUploadApiUrl(env)
  
  // ========================================
  // Step 5: Build product objects with images
  // ========================================
  const skuMap = new Map<string, DashboardProduct>()
  
  for (const item of productItemsResult.results) {
    const pi = item as ProductItem & { has_measurement?: number; measurement_image_url?: string }
    const sku = pi.sku
    
    // Parse image_urls
    let imageUrls: string[] = []
    try {
      imageUrls = JSON.parse(pi.image_urls || '[]')
    } catch (e) {
      logger.error(`❌ Failed to parse image_urls for SKU ${sku}:`, e)
      continue
    }
    
    if (imageUrls.length === 0) continue
    
    // Get master data (may not exist)
    const pm = masterMap.get(sku)
    
    // Create product entry
    if (!skuMap.has(sku)) {
      skuMap.set(sku, {
        id: sku,
        sku: sku,
        name: pm?.name || `商品 ${sku}`,
        brand: pm?.brand || null,
        size: pm?.size || null,
        color: pm?.color || null,
        price_sale: pm?.price_sale || 0,
        barcode: pm?.barcode || null,
        category: pm?.category || null,
        rank: pm?.rank || null,
        images: [],
        has_measurement: false
      })
    }
    
    const productData = skuMap.get(sku)!
    
    // Set has_measurement flag
    if (pi.has_measurement) {
      productData.has_measurement = true
    }
    
    // Parse processed/final image lists
    let processedImages: string[] = []
    let finalImages: string[] = []
    try {
      processedImages = JSON.parse(pi.processed_images || '[]')
      finalImages = JSON.parse(pi.final_images || '[]')
    } catch (e) {
      logger.error(`❌ Failed to parse image status for SKU ${sku}:`, e)
    }
    
    const updatedAt = pi.updated_at || new Date().toISOString()
    
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i]
      
      let r2Path = imageUrl
      
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        r2Path = ImageUrlHelper.toR2Path(imageUrl)
      }
      
      const pathParts = r2Path.split('/')
      const filename = pathParts[pathParts.length - 1]
      
      let r2Key = r2Path
      if (!r2Path.startsWith(`${companyId}/`)) {
        r2Key = `${companyId}/${r2Path}`
      }
      
      const proxyUrl = `${IMAGE_UPLOAD_API_URL}/${r2Key}`
      const imageId = `r2_${sku}_${filename.replace(/\.[^/.]+$/, '')}`
      
      const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '')
      
      const imageStatus = getImageDisplayUrl(
        sku,
        filenameWithoutExt,
        processedImages,
        finalImages,
        companyId
      )
      
      const displayUrl = imageStatus.url
      const status = imageStatus.status === 'final' ? 'final' : 
                    imageStatus.status === 'processed' ? 'processed' : 'ready'
      
      productData.images.push({
        id: imageId,
        original_url: proxyUrl,
        processed_url: displayUrl,
        display_url: displayUrl,
        status: status,
        created_at: new Date().toISOString(),
        filename: filename,
        sku: sku,
        sequence: i + 1,
        is_main: i === 0,
        updated_at: updatedAt
      })
    }
    
    // Add measurement image if available
    const measurementImageUrl = pi.measurement_image_url
    const maskImageUrl = pi.mask_image_url
    if (measurementImageUrl && productData.has_measurement) {
      const measurementImageId = `measurement_${sku}`
      const isProcessed = measurementImageUrl.includes('_p.png')
      
      productData.images.push({
        id: measurementImageId,
        original_url: measurementImageUrl,
        processed_url: isProcessed ? measurementImageUrl : null,
        display_url: measurementImageUrl,
        mask_url: maskImageUrl || null,
        status: isProcessed ? 'completed' : 'measurement',
        created_at: new Date().toISOString(),
        filename: 'measurement.png',
        sku: sku,
        sequence: imageUrls.length + 1,
        is_main: false,
        is_measurement: true,
        updated_at: updatedAt
      })
    }
  }
  
  // ========================================
  // Step 6: Convert to array, preserving SKU order
  // ========================================
  const products: DashboardProduct[] = []
  for (const sku of skuList) {
    const product = skuMap.get(sku)
    if (product && product.images.length > 0) {
      products.push(product)
    }
  }
  
  logger.debug(`📄 Page ${page}/${totalPages}: Returning ${products.length} products`)
  
  return {
    products,
    pagination: {
      page,
      perPage,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }
}

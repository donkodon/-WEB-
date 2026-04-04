/**
 * DashboardService - ダッシュボードのビジネスロジック
 * 非依存: HonoContext (c.env) → HTTP層から完全分離
 */
import type { IDashboardRepository, DashboardDataResult, BulkImportResult, ImportProduct } from '../../../shared/interfaces/dashboard-repository.interface'
import { logger } from '../../../shared/helpers/logger'

export interface MobileApiSyncResult {
  synced: number
  error: string | null
}

export interface BulkImportWithSyncResult extends BulkImportResult {
  mobileSynced: number
}

export interface ProductSearchResult {
  product: Record<string, unknown>
  images: MobileImage[]
  hasCapturedData: boolean
  capturedCount: number
}

export interface MobileImage {
  url: string
  filename: string
  uploaded: string
  size?: number
}

export class DashboardService {
  constructor(private readonly dashboardRepo: IDashboardRepository) {}

  /**
   * ダッシュボード商品一覧取得（ページネーション付き）
   */
  async getDashboardProducts(
    db: D1Database,
    companyId: string,
    page: number,
    perPage: number,
    r2PublicUrl: string,
    baseUrl?: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<DashboardDataResult> {
    logger.debug(`📊 DashboardService.getDashboardProducts: company=${companyId}, page=${page}, startDate=${startDate}, endDate=${endDate}`)
    return this.dashboardRepo.fetchDashboardProducts(db, companyId, page, perPage, r2PublicUrl, baseUrl, startDate, endDate)
  }

  /**
   * 商品マスタ一括インポート（モバイルAPI同期付き）
   */
  async bulkImportWithMobileSync(
    db: D1Database,
    companyId: string,
    products: ImportProduct[],
    mobileApiUrl: string
  ): Promise<BulkImportWithSyncResult> {
    logger.debug(`📦 BulkImport: company=${companyId}, count=${products.length}`)

    // D1へのインポート
    const importResult = await this.dashboardRepo.bulkImportProducts(db, companyId, products)

    // モバイルAPI同期（失敗してもimportは成功扱い）
    const syncResult = await this.syncToMobileApi(mobileApiUrl, products)
    if (syncResult.error) {
      logger.warn(`⚠️ Mobile sync failed: ${syncResult.error}`)
    }

    return { ...importResult, mobileSynced: syncResult.synced }
  }

  /**
   * 商品検索（SKUで商品＋画像一覧を取得）
   */
  async searchProductBySku(
    db: D1Database,
    sku: string,
    companyId: string,
    r2PublicUrl: string
  ): Promise<ProductSearchResult | null> {
    const result = await this.dashboardRepo.findProductWithImages(db, sku, companyId)
    if (!result.product) return null

    const mobileImages: MobileImage[] = result.imageUrls.map((url) => {
      const parts = url.split('/')
      const filename = parts[parts.length - 1]
      return { url, filename, uploaded: result.updatedAt || new Date().toISOString() }
    })

    // フォールバック: R2 Public URLから直接確認（ローカル開発用）
    const images =
      mobileImages.length > 0
        ? mobileImages
        : await this.probeR2Images(sku, r2PublicUrl)

    return {
      product: result.product,
      images,
      hasCapturedData: images.length > 0,
      capturedCount: images.length,
    }
  }

  /**
   * ページネーションパラメータのバリデーション
   */
  validatePagination(page: number, perPage: number): string | null {
    if (page < 1 || perPage < 1 || perPage > 100) {
      return 'Invalid pagination parameters. Page must be >= 1, perPage must be between 1 and 100.'
    }
    return null
  }

  // ---- Private helpers ----

  private async syncToMobileApi(
    mobileApiUrl: string,
    products: ImportProduct[]
  ): Promise<MobileApiSyncResult> {
    try {
      const response = await fetch(`${mobileApiUrl}/api/products/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      })
      if (response.ok) {
        const data = (await response.json()) as { inserted: number; updated: number }
        const synced = (data.inserted || 0) + (data.updated || 0)
        logger.debug(`✅ Mobile sync: ${synced} products`)
        return { synced, error: null }
      }
      const text = await response.text()
      return { synced: 0, error: `HTTP ${response.status}: ${text}` }
    } catch (e) {
      return { synced: 0, error: String(e) }
    }
  }

  private async probeR2Images(sku: string, r2PublicUrl: string): Promise<MobileImage[]> {
    const images: MobileImage[] = []
    logger.debug(`🔄 Probing R2 images for SKU: ${sku}`)
    for (let i = 1; i <= 10; i++) {
      try {
        const imageUrl = `${r2PublicUrl}/${sku}_${i}.jpg`
        const res = await fetch(imageUrl, { method: 'HEAD' })
        if (!res.ok) break
        const contentLength = res.headers.get('content-length')
        const lastModified = res.headers.get('last-modified')
        images.push({
          url: imageUrl,
          filename: `${sku}_${i}.jpg`,
          uploaded: lastModified || new Date().toISOString(),
          size: contentLength ? parseInt(contentLength) : 0,
        })
      } catch {
        break
      }
    }
    logger.debug(`📱 Found ${images.length} R2 images for SKU: ${sku}`)
    return images
  }
}

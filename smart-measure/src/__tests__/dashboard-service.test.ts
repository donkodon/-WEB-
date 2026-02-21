/* eslint-disable max-lines-per-function */
/**
 * DashboardService ユニットテスト
 * IDashboardRepository をモックして、ビジネスロジックのみを検証
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardService } from '../features/dashboard/services/dashboard-service'
import type { IDashboardRepository, DashboardDataResult, BulkImportResult, ProductWithImages, ImportProduct } from '../shared/interfaces/dashboard-repository.interface'

// ---- モックリポジトリ ----
function createMockRepo(overrides: Partial<IDashboardRepository> = {}): IDashboardRepository {
  return {
    fetchDashboardProducts: vi.fn().mockResolvedValue({
      products: [],
      pagination: { page: 1, perPage: 12, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    } as DashboardDataResult),
    bulkImportProducts: vi.fn().mockResolvedValue({
      inserted: 2, updated: 1, total: 3,
    } as BulkImportResult),
    findProductWithImages: vi.fn().mockResolvedValue({
      product: { sku: 'SKU001', name: 'Test Product' },
      imageUrls: ['https://r2.example.com/company1/SKU001/img1.jpg'],
      updatedAt: '2026-02-21T00:00:00.000Z',
    } as ProductWithImages),
    ...overrides,
  }
}

// ---- モックD1Database ----
const mockDb = {} as D1Database

describe('DashboardService', () => {
  let service: DashboardService
  let mockRepo: IDashboardRepository

  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo = createMockRepo()
    service = new DashboardService(mockRepo)
  })

  // ---- validatePagination ----
  describe('validatePagination', () => {
    it('有効なパラメータはnullを返す', () => {
      expect(service.validatePagination(1, 12)).toBeNull()
      expect(service.validatePagination(5, 100)).toBeNull()
    })

    it('page < 1 はエラーメッセージを返す', () => {
      expect(service.validatePagination(0, 12)).not.toBeNull()
      expect(service.validatePagination(-1, 12)).not.toBeNull()
    })

    it('perPage < 1 はエラーメッセージを返す', () => {
      expect(service.validatePagination(1, 0)).not.toBeNull()
    })

    it('perPage > 100 はエラーメッセージを返す', () => {
      expect(service.validatePagination(1, 101)).not.toBeNull()
    })

    it('perPage = 100 は有効', () => {
      expect(service.validatePagination(1, 100)).toBeNull()
    })
  })

  // ---- getDashboardProducts ----
  describe('getDashboardProducts', () => {
    it('リポジトリのfetchDashboardProductsを呼び出す', async () => {
      const result = await service.getDashboardProducts(mockDb, 'company1', 1, 12, 'https://r2.example.com')

      expect(mockRepo.fetchDashboardProducts).toHaveBeenCalledOnce()
      expect(mockRepo.fetchDashboardProducts).toHaveBeenCalledWith(
        mockDb, 'company1', 1, 12, 'https://r2.example.com'
      )
      expect(result.pagination.page).toBe(1)
    })

    it('リポジトリが返すデータをそのまま返す', async () => {
      const mockData: DashboardDataResult = {
        products: [{ id: 'SKU001', sku: 'SKU001', name: 'Product A', brand: null, size: null, color: null, price_sale: 1000, barcode: null, category: null, rank: null, images: [], has_measurement: false }],
        pagination: { page: 2, perPage: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: true },
      }
      vi.mocked(mockRepo.fetchDashboardProducts).mockResolvedValue(mockData)

      const result = await service.getDashboardProducts(mockDb, 'company1', 2, 10, 'https://r2.example.com')
      expect(result.products).toHaveLength(1)
      expect(result.pagination.total).toBe(25)
    })
  })

  // ---- bulkImportWithMobileSync ----
  describe('bulkImportWithMobileSync', () => {
    const testProducts: ImportProduct[] = [
      { sku: 'SKU001', name: 'Product A' },
      { sku: 'SKU002', name: 'Product B' },
      { sku: 'SKU003', name: 'Product C' },
    ]

    it('リポジトリのbulkImportProductsを呼び出す', async () => {
      // モバイルAPIのfetchをモック（失敗させる）
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const result = await service.bulkImportWithMobileSync(
        mockDb, 'company1', testProducts, 'https://mobile-api.example.com'
      )

      expect(mockRepo.bulkImportProducts).toHaveBeenCalledWith(mockDb, 'company1', testProducts)
      expect(result.inserted).toBe(2)
      expect(result.updated).toBe(1)
      expect(result.total).toBe(3)
      vi.unstubAllGlobals()
    })

    it('モバイルAPI成功時はmobileSyncedを返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ inserted: 2, updated: 1 }),
      }))

      const result = await service.bulkImportWithMobileSync(
        mockDb, 'company1', testProducts, 'https://mobile-api.example.com'
      )

      expect(result.mobileSynced).toBe(3)
      vi.unstubAllGlobals()
    })

    it('モバイルAPIが失敗してもimportは成功する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const result = await service.bulkImportWithMobileSync(
        mockDb, 'company1', testProducts, 'https://mobile-api.example.com'
      )

      expect(result.inserted).toBe(2)
      expect(result.updated).toBe(1)
      expect(result.mobileSynced).toBe(0) // 同期失敗でも0を返す
      vi.unstubAllGlobals()
    })

    it('モバイルAPIがHTTPエラーを返す場合もimportは成功する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }))

      const result = await service.bulkImportWithMobileSync(
        mockDb, 'company1', testProducts, 'https://mobile-api.example.com'
      )

      expect(result.inserted).toBe(2)
      expect(result.mobileSynced).toBe(0)
      vi.unstubAllGlobals()
    })
  })

  // ---- searchProductBySku ----
  describe('searchProductBySku', () => {
    it('商品が見つかった場合はSearchResultを返す', async () => {
      const result = await service.searchProductBySku(mockDb, 'SKU001', 'company1', 'https://r2.example.com')

      expect(result).not.toBeNull()
      expect(result!.product.sku).toBe('SKU001')
      expect(result!.images).toHaveLength(1)
      expect(result!.hasCapturedData).toBe(true)
      expect(result!.capturedCount).toBe(1)
    })

    it('商品が見つからない場合はnullを返す', async () => {
      vi.mocked(mockRepo.findProductWithImages).mockResolvedValue({
        product: null,
        imageUrls: [],
        updatedAt: null,
      })

      const result = await service.searchProductBySku(mockDb, 'NOTFOUND', 'company1', 'https://r2.example.com')
      expect(result).toBeNull()
    })

    it('画像URLがない場合はimagesが空の配列を返す（R2 probeは実際のfetchを呼ぶためモック）', async () => {
      vi.mocked(mockRepo.findProductWithImages).mockResolvedValue({
        product: { sku: 'SKU002', name: 'Product B' },
        imageUrls: [], // 画像なし
        updatedAt: null,
      })
      // R2 probeのfetchをモック（最初のリクエストで404を返す）
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

      const result = await service.searchProductBySku(mockDb, 'SKU002', 'company1', 'https://r2.example.com')

      expect(result).not.toBeNull()
      expect(result!.images).toHaveLength(0)
      expect(result!.hasCapturedData).toBe(false)
      vi.unstubAllGlobals()
    })

    it('imageUrlsから画像情報を正しくマッピングする', async () => {
      vi.mocked(mockRepo.findProductWithImages).mockResolvedValue({
        product: { sku: 'SKU001', name: 'Test' },
        imageUrls: [
          'https://r2.example.com/company1/SKU001/img1.jpg',
          'https://r2.example.com/company1/SKU001/img2.jpg',
        ],
        updatedAt: '2026-02-21T00:00:00.000Z',
      })

      const result = await service.searchProductBySku(mockDb, 'SKU001', 'company1', 'https://r2.example.com')

      expect(result!.images).toHaveLength(2)
      expect(result!.images[0].filename).toBe('img1.jpg')
      expect(result!.images[1].filename).toBe('img2.jpg')
      expect(result!.images[0].uploaded).toBe('2026-02-21T00:00:00.000Z')
    })
  })
})

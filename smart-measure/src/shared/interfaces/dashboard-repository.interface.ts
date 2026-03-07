/**
 * IDashboardRepository - ダッシュボードDB操作の抽象インターフェース
 * products.ts / DashboardService が直接D1に触れないようにするための境界層
 */

export interface DashboardDataResult {
  products: DashboardProductRecord[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface DashboardProductRecord {
  id: string
  sku: string
  name: string
  brand: string | null
  size: string | null
  color: string | null
  price_sale: number
  barcode: string | null
  category: string | null
  rank: string | null
  images: DashboardImageRecord[]
  has_measurement: boolean
}

export interface DashboardImageRecord {
  id: string
  original_url: string
  processed_url: string | null
  display_url: string
  mask_url?: string | null
  status: string
  created_at: string
  filename: string
  sku: string
  sequence: number
  is_main: boolean
  is_measurement?: boolean
  updated_at: string
}

export interface ImportProduct {
  sku: string
  barcode?: string | null
  name?: string
  brand?: string | null
  category?: string | null
  size?: string | null
  color?: string | null
  price?: number
}

export interface BulkImportResult {
  inserted: number
  updated: number
  total: number
}

export interface ProductWithImages {
  product: Record<string, unknown> | null
  imageUrls: string[]
  updatedAt: string | null
}

export interface IDashboardRepository {
  fetchDashboardProducts(
    db: D1Database,
    companyId: string,
    page: number,
    perPage: number,
    r2PublicUrl: string,
    baseUrl?: string
  ): Promise<DashboardDataResult>

  bulkImportProducts(
    db: D1Database,
    companyId: string,
    products: ImportProduct[]
  ): Promise<BulkImportResult>

  findProductWithImages(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<ProductWithImages>
}

/**
 * IMeasurementRepository - 採寸DB操作の抽象インターフェース
 */
export interface ProductMasterRecord {
  category: string | null
  name: string | null
}

export interface MeasurementRecord {
  id: number
  sku: string
  item_code: string
  image_urls: string[]
  ai_landmarks: Record<string, unknown>
  manual_landmarks: Record<string, unknown> | null
  reference_object: { pixelPerCm?: number }
  measurements: Record<string, unknown>
  annotated_image_url: string | null
  measurement_image_url: string | null
  measurement_status: string | null
  measurement_category: string | null
  measured_at: string | null
}

export interface ExistingItemRecord {
  id: number
  item_code: string
}

export interface SaveMeasurementParams {
  sku: string
  companyId: string
  imageUrl: string
  garmentClass: string
  landmarks: unknown
  pixelPerCm: number
  measurements: unknown
  measurementImageUrl: string
  maskImageUrl: string | null
}

/**
 * MeasurementData - 採寸取得結果の共有型
 * measurement-service の getMeasurementData() が返す型
 */
export interface MeasurementData {
  id: number
  sku: string
  item_code: string
  image_url: string | null
  annotated_image_url: string | null
  measurement_image_url: string | null
  landmarks: Record<string, unknown>
  pixel_per_cm: number
  measurements: Record<string, unknown>
  measurement_status: string | null
  measurement_category: string | null
  measured_at: string | null
}

export interface IMeasurementRepository {
  findProductMaster(db: D1Database, sku: string, companyId: string): Promise<ProductMasterRecord | null>
  findMeasurementBySku(db: D1Database, sku: string, companyId: string): Promise<MeasurementRecord | null>
  findExistingItem(db: D1Database, sku: string, companyId: string, imageUrl: string): Promise<ExistingItemRecord | null>
  updateMeasurement(db: D1Database, id: number, params: SaveMeasurementParams): Promise<void>
  generateNextItemCode(db: D1Database, sku: string): Promise<string>
  insertMeasurement(db: D1Database, itemCode: string, params: SaveMeasurementParams): Promise<void>
  updateManualLandmarks(db: D1Database, id: number, manualLandmarks: unknown, measurements: unknown): Promise<void>
}

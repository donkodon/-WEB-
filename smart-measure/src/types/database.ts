// Database table types for type-safe SQL queries

// Product Master table
export interface ProductMaster {
  sku: string
  name: string | null
  brand: string | null
  brand_kana: string | null
  size: string | null
  color: string | null
  category_major: string | null
  category_minor: string | null
  price_purchase: number | null
  price_sale: number | null
  price_reference: number | null
  price_list: number | null
  stock_quantity: number | null
  barcode: string | null
  rank: string | null
  season: string | null
  buyer: string | null
  store_name: string | null
  storage_location: string | null
  status: string | null
  created_at: string
  updated_at: string
  category?: string | null // Legacy field for compatibility
}

// Product Items table
export interface ProductItem {
  id: number
  company_id: string
  sku: string
  image_urls: string // JSON array
  processed_images: string // JSON array
  final_images: string // JSON array
  image_status: 'original' | 'processed' | 'final'
  ai_landmarks: string | null // JSON object
  annotated_image_url: string | null
  mask_image_url: string | null
  measurement_image_url: string | null
  created_at: string
  updated_at: string
  has_measurement?: number // Computed field (0 or 1)
}

// Dashboard view - combination of ProductMaster + ProductItem
export interface DashboardProduct {
  id: string // SKU
  sku: string
  name: string
  brand: string | null
  size: string | null
  color: string | null
  price_sale: number
  barcode: string | null
  category: string | null
  rank: string | null
  images: Array<{
    url: string
    status: 'original' | 'processed' | 'final'
    hasMeasurement: boolean
    measurementUrl?: string
    maskUrl?: string
  }>
  has_measurement: boolean
}

// CSV Export row type
export interface CsvExportRow {
  sku: string
  name: string | null
  brand: string | null
  brand_kana: string | null
  size: string | null
  color: string | null
  category_major: string | null
  category_minor: string | null
  price_purchase: number | null
  price_sale: number | null
  price_reference: number | null
  price_list: number | null
  stock_quantity: number | null
  barcode: string | null
  rank: string | null
  season: string | null
  buyer: string | null
  store_name: string | null
  storage_location: string | null
  status: string | null
  image_id: number | null
  image_url: string | null
  processed_image_url: string | null
  final_image_url: string | null
  image_status: string | null
  measurement_image_url: string | null
  mask_image_url: string | null
  ai_landmarks: string | null
  created_at: string | null
  updated_at: string | null
}

// Sync API product type
export interface SyncProduct {
  sku: string
  name: string | null
  brand: string | null
  size: string | null
  color: string | null
  price_sale: number | null
  barcode: string | null
  category: string | null
}

/**
 * IEditorRepository - 画像エディタのDB操作インターフェース
 *
 * editor.tsx が直接 DB に依存しないようにするための抽象境界。
 * テスト時は MockEditorRepository に差し替えてDB不要でテスト可能。
 */

// ── 型定義 ───────────────────────────────────────────────────────────────────

/** 採寸画像取得結果 */
export interface MeasurementImageRecord {
  originalUrl: string
  processedImages: string[]
  maskImageUrl: string | null
  updatedAt: string
  brightness: number
  whiteBalance: number
  hue: number
  cropX: number | null
  cropY: number | null
  cropSize: number | null
  cropEnabled: boolean
}

/** r2_画像取得結果 */
export interface R2ImageRecord {
  updatedAt: string
  processedImages: string[]
  finalImages: string[]
  maskImages: Array<{ filename: string; url: string }>
  brightness: number
  whiteBalance: number
  hue: number
  cropX: number | null
  cropY: number | null
  cropSize: number | null
  cropEnabled: boolean
}

// ── インターフェース ─────────────────────────────────────────────────────────

export interface IEditorRepository {
  /**
   * 採寸画像の情報を取得する（measurement_{sku} 形式のID用）
   */
  findMeasurementImage(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<MeasurementImageRecord | null>

  /**
   * SKU から company_id を取得する（未認証アクセス時のフォールバック）
   */
  findCompanyIdBySku(
    db: D1Database,
    sku: string
  ): Promise<string | null>

  /**
   * r2_ 形式の画像IDに対応する画像ステータスを取得する
   */
  findImageStatus(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<R2ImageRecord | null>
}

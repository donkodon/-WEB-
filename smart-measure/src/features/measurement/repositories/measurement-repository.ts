/**
 * MeasurementRepository - 採寸DB操作の実装クラス
 * 責務: SQLクエリの実行のみ。
 */
import type {
  IMeasurementRepository,
  ProductMasterRecord,
  MeasurementRecord,
  ExistingItemRecord,
  SaveMeasurementParams,
} from '../../../shared/interfaces/measurement-repository.interface'
import { logger } from '../../../shared/helpers/logger'

export class MeasurementRepository implements IMeasurementRepository {
  async findProductMaster(db: D1Database, sku: string, companyId: string): Promise<ProductMasterRecord | null> {
    const result = await db.prepare(
      `SELECT category, name FROM product_master WHERE sku = ? AND company_id = ? LIMIT 1`
    ).bind(sku, companyId).first()
    if (!result) return null
    return { category: result.category as string | null, name: result.name as string | null }
  }

  async findMeasurementBySku(db: D1Database, sku: string, companyId: string): Promise<MeasurementRecord | null> {
    const result = await db.prepare(`
      SELECT id, sku, item_code, image_urls,
             ai_landmarks, manual_landmarks, reference_object, measurements,
             annotated_image_url, measurement_image_url,
             measurement_status, measurement_category, measured_at
      FROM product_items
      WHERE sku = ? AND company_id = ? AND ai_landmarks IS NOT NULL
      ORDER BY measured_at DESC LIMIT 1
    `).bind(sku, companyId).first()
    if (!result) return null

    const parse = (v: unknown, fallback: unknown = {}) => {
      try { return JSON.parse(v as string) } catch { return fallback }
    }
    return {
      id: result.id as number,
      sku: result.sku as string,
      item_code: result.item_code as string,
      image_urls: parse(result.image_urls, []) as string[],
      ai_landmarks: parse(result.ai_landmarks, {}) as Record<string, unknown>,
      manual_landmarks: result.manual_landmarks ? parse(result.manual_landmarks, null) as Record<string, unknown> : null,
      reference_object: parse(result.reference_object, {}) as { pixelPerCm?: number },
      measurements: parse(result.measurements, {}) as Record<string, unknown>,
      annotated_image_url: result.annotated_image_url as string | null,
      measurement_image_url: result.measurement_image_url as string | null,
      measurement_status: result.measurement_status as string | null,
      measurement_category: result.measurement_category as string | null,
      measured_at: result.measured_at as string | null,
    }
  }

  async findExistingItem(db: D1Database, sku: string, companyId: string, imageUrl: string): Promise<ExistingItemRecord | null> {
    const result = await db.prepare(`
      SELECT id, item_code FROM product_items
      WHERE sku = ? AND company_id = ? AND json_extract(image_urls, '$[0]') = ? LIMIT 1
    `).bind(sku, companyId, imageUrl).first()
    if (!result) return null
    return { id: result.id as number, item_code: result.item_code as string }
  }

  async updateMeasurement(db: D1Database, id: number, params: SaveMeasurementParams): Promise<void> {
    const now = new Date().toISOString()
    await db.prepare(`
      UPDATE product_items
      SET ai_landmarks = ?, reference_object = ?, measurements = ?,
          annotated_image_url = ?, mask_image_url = ?,
          measurement_status = ?, measurement_category = ?,
          measured_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(params.landmarks), JSON.stringify({ pixelPerCm: params.pixelPerCm }),
      JSON.stringify(params.measurements), params.measurementImageUrl, params.maskImageUrl,
      'auto', params.garmentClass, now, now, id
    ).run()
    logger.debug(`🔄 Updated measurement: id=${id}`)
  }

  async generateNextItemCode(db: D1Database, sku: string): Promise<string> {
    const result = await db.prepare(
      `SELECT item_code FROM product_items WHERE sku = ? ORDER BY created_at DESC LIMIT 1`
    ).bind(sku).first()
    if (result) {
      const baseCode = (result.item_code as string).split('-')[0]
      const nextNum = parseInt((result.item_code as string).split('-').pop() || '0') + 1
      return `${baseCode}-${String(nextNum).padStart(3, '0')}`
    }
    return `${sku}-001`
  }

  async insertMeasurement(db: D1Database, itemCode: string, params: SaveMeasurementParams): Promise<void> {
    const now = new Date().toISOString()
    await db.prepare(`
      INSERT INTO product_items (
        sku, item_code, company_id, image_urls,
        ai_landmarks, reference_object, measurements,
        annotated_image_url, mask_image_url,
        measurement_status, measurement_category, measured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      params.sku, itemCode, params.companyId, JSON.stringify([params.imageUrl]),
      JSON.stringify(params.landmarks), JSON.stringify({ pixelPerCm: params.pixelPerCm }),
      JSON.stringify(params.measurements), params.measurementImageUrl, params.maskImageUrl,
      'auto', params.garmentClass, now, now
    ).run()
    logger.debug(`💾 Inserted measurement: item_code=${itemCode}`)
  }

  async updateManualLandmarks(db: D1Database, id: number, manualLandmarks: unknown, measurements: unknown): Promise<void> {
    await db.prepare(`
      UPDATE product_items
      SET manual_landmarks = ?, measurements = ?,
          measurement_status = 'manual_adjusted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(JSON.stringify(manualLandmarks), JSON.stringify(measurements), id).run()
    logger.debug(`✅ Manual landmarks saved: id=${id}`)
  }
}

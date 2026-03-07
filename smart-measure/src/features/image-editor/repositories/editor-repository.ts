/**
 * EditorRepository - D1 を使った画像エディタのDB操作実装
 *
 * 責務: SQLクエリの実行のみ。ビジネスロジックは持たない。
 */

import type {
  IEditorRepository,
  MeasurementImageRecord,
  R2ImageRecord,
} from '../../../shared/interfaces/editor-repository.interface'

export class EditorRepository implements IEditorRepository {
  async findMeasurementImage(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<MeasurementImageRecord | null> {
    const result = await db
      .prepare(
        `SELECT
           COALESCE(annotated_image_url, measurement_image_url) as original_url,
           COALESCE(processed_images, '[]') as processed_images,
           mask_image_url_r2,
           mask_image_url,
           updated_at,
           COALESCE(brightness, 0) as brightness,
           COALESCE(white_balance, 5500) as white_balance,
           COALESCE(hue, 0) as hue,
           crop_x,
           crop_y,
           crop_size,
           COALESCE(crop_enabled, 0) as crop_enabled
         FROM product_items
         WHERE sku = ? AND company_id = ?
         LIMIT 1`
      )
      .bind(sku, companyId)
      .first()

    if (!result?.original_url) return null

    let processedImages: string[] = []
    try {
      processedImages = JSON.parse((result.processed_images as string) || '[]')
    } catch {
      processedImages = []
    }

    return {
      originalUrl: result.original_url as string,
      processedImages,
      maskImageUrl:
        ((result.mask_image_url_r2 || result.mask_image_url) as string) ?? null,
      updatedAt: (result.updated_at as string) ?? new Date().toISOString(),
      brightness: (result.brightness as number) ?? 0,
      whiteBalance: (result.white_balance as number) ?? 5500,
      hue: (result.hue as number) ?? 0,
      cropX: (result.crop_x as number) ?? null,
      cropY: (result.crop_y as number) ?? null,
      cropSize: (result.crop_size as number) ?? null,
      cropEnabled: Boolean(result.crop_enabled),
    }
  }

  async findCompanyIdBySku(
    db: D1Database,
    sku: string
  ): Promise<string | null> {
    const result = await db
      .prepare(
        `SELECT company_id FROM product_items WHERE sku = ? LIMIT 1`
      )
      .bind(sku)
      .first()

    return (result?.company_id as string) ?? null
  }

  async findImageStatus(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<R2ImageRecord | null> {
    const result = await db
      .prepare(
        `SELECT
           updated_at,
           COALESCE(processed_images, '[]') as processed_images,
           COALESCE(final_images, '[]') as final_images,
           COALESCE(mask_images_r2, '[]') as mask_images_r2,
           COALESCE(brightness, 0) as brightness,
           COALESCE(white_balance, 5500) as white_balance,
           COALESCE(hue, 0) as hue,
           crop_x,
           crop_y,
           crop_size,
           COALESCE(crop_enabled, 0) as crop_enabled
         FROM product_items
         WHERE sku = ? AND company_id = ?
         LIMIT 1`
      )
      .bind(sku, companyId)
      .first()

    if (!result) return null

    let processedImages: string[] = []
    let finalImages: string[] = []
    let maskImages: Array<{ filename: string; url: string }> = []

    try {
      processedImages = JSON.parse((result.processed_images as string) || '[]')
    } catch { processedImages = [] }

    try {
      finalImages = JSON.parse((result.final_images as string) || '[]')
    } catch { finalImages = [] }

    try {
      maskImages = JSON.parse((result.mask_images_r2 as string) || '[]')
    } catch { maskImages = [] }

    return {
      updatedAt: (result.updated_at as string) ?? new Date().toISOString(),
      processedImages,
      finalImages,
      maskImages,
      brightness: (result.brightness as number) ?? 0,
      whiteBalance: (result.white_balance as number) ?? 5500,
      hue: (result.hue as number) ?? 0,
      cropX: (result.crop_x as number) ?? null,
      cropY: (result.crop_y as number) ?? null,
      cropSize: (result.crop_size as number) ?? null,
      cropEnabled: Boolean(result.crop_enabled),
    }
  }
}

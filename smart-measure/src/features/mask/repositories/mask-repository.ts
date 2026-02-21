/**
 * MaskRepository - D1を使ったマスクデータのDB操作実装
 *
 * 責務: SQLクエリの実行のみ。ビジネスロジックは持たない。
 * テスト: このクラスは D1 に依存するため、テストでは IMaskRepository を
 *         実装した MockMaskRepository に差し替えて使う。
 */

import type {
  IMaskRepository,
  MaskRecord,
  ImageUrlRecord,
  RegenerateRecord,
} from '../../../shared/interfaces/mask-repository.interface'

export class MaskRepository implements IMaskRepository {
  async findMaskUrl(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<MaskRecord> {
    const result = await db
      .prepare(
        `SELECT mask_image_url_r2
         FROM product_items
         WHERE sku = ? AND company_id = ?
         LIMIT 1`
      )
      .bind(sku, companyId)
      .first()

    return {
      maskImageUrl: (result?.mask_image_url_r2 as string) ?? null,
    }
  }

  async findImageUrls(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<ImageUrlRecord> {
    const result = await db
      .prepare(
        `SELECT image_urls
         FROM product_items
         WHERE sku = ? AND company_id = ?
         LIMIT 1`
      )
      .bind(sku, companyId)
      .first()

    let imageUrls: string[] = []
    try {
      imageUrls = JSON.parse((result?.image_urls as string) || '[]')
    } catch {
      imageUrls = []
    }

    return { imageUrls }
  }

  async updateMaskUrl(
    db: D1Database,
    sku: string,
    companyId: string,
    maskUrl: string
  ): Promise<void> {
    await db
      .prepare(
        `UPDATE product_items
         SET mask_image_url_r2 = ?, updated_at = CURRENT_TIMESTAMP
         WHERE sku = ? AND company_id = ?`
      )
      .bind(maskUrl, sku, companyId)
      .run()
  }

  async findForRegenerate(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<RegenerateRecord | null> {
    const result = await db
      .prepare(
        `SELECT
           COALESCE(measurement_image_url, annotated_image_url) as image_url,
           mask_image_url_r2
         FROM product_items
         WHERE sku = ? AND company_id = ?
         LIMIT 1`
      )
      .bind(sku, companyId)
      .first()

    if (!result?.image_url || !result?.mask_image_url_r2) {
      return null
    }

    return {
      imageUrl: result.image_url as string,
      maskImageUrl: result.mask_image_url_r2 as string,
    }
  }
}

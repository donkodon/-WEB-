/**
 * IMaskRepository - マスクデータのDB操作インターフェース
 *
 * このインターフェースに依存することで：
 * - テスト時: MockMaskRepository に差し替え可能（D1不要）
 * - 将来: DB種類変更時も mask.ts / MaskService は無変更
 */

export interface MaskRecord {
  maskImageUrl: string | null
}

export interface ImageUrlRecord {
  imageUrls: string[]
}

export interface RegenerateRecord {
  imageUrl: string
  maskImageUrl: string
}

export interface IMaskRepository {
  /**
   * SKU に紐づくマスク画像URLを取得する
   */
  findMaskUrl(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<MaskRecord>

  /**
   * マスク保存時のファイル名を解決するための image_urls を取得する
   */
  findImageUrls(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<ImageUrlRecord>

  /**
   * mask_image_url_r2 を更新する
   */
  updateMaskUrl(
    db: D1Database,
    sku: string,
    companyId: string,
    maskUrl: string
  ): Promise<void>

  /**
   * 再生成に必要な元画像URLとマスクURLを取得する
   */
  findForRegenerate(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<RegenerateRecord | null>
}

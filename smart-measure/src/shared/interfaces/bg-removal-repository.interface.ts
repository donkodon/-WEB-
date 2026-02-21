/**
 * IBgRemovalRepository - R2/D1操作の抽象インターフェース
 *
 * 設計方針:
 *   - BgRemovalOrchestrator が R2/D1 に直接依存しないようにする
 *   - テスト時は MockBgRemovalRepository で DB/R2 不要でテスト可能
 */

/** R2保存 + D1更新の結果 */
export interface UploadResult {
  r2Key: string
  publicUrl: string
}

/** マスク保存の引数 */
export interface SaveMaskParams {
  companyId: string
  sku: string
  filenamePart: string
  maskBytes: Uint8Array
}

/** 処理済み画像保存の引数 */
export interface UploadProcessedParams {
  companyId: string
  sku: string
  filenamePart: string
  imageBuffer: ArrayBuffer | Uint8Array
}

export interface IBgRemovalRepository {
  /**
   * 処理済み画像をR2に保存し、D1の processed_images / image_status を更新する
   */
  uploadProcessedAndUpdateDb(params: UploadProcessedParams): Promise<UploadResult>

  /**
   * マスク画像をR2に保存し、D1の mask_images_r2（JSON配列）を更新する
   */
  saveMaskAndUpdateDb(params: SaveMaskParams): Promise<string>  // returns maskUrl
}

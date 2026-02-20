/**
 * R2 Upload Helper for Background Removal
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { R2UploadOptions } from '../types'
import { logger } from '../../../shared/helpers/logger'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { markImageAsProcessed } from '../../image-editor/helpers/image-status'

/**
 * Convert base64 data URL to Uint8Array
 * Accepts "data:image/png;base64,xxx" or raw base64 string
 */
export function base64ToBuffer(dataUrl: string): Uint8Array {
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  logger.debug(`📊 base64ToBuffer: ${bytes.length} bytes`)
  return bytes
}

/**
 * Upload processed image to R2 storage
 * Naming convention: {companyId}/{sku}/{filenamePart}_p.png
 */
export async function uploadProcessedImageToR2(
  bucket: R2Bucket,
  options: R2UploadOptions
): Promise<string> {
  const { companyId, sku, filenamePart, imageBuffer, contentType = 'image/png' } = options
  const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`
  logger.debug(`📤 Uploading processed image to R2: ${r2Key}`)
  await bucket.put(r2Key, imageBuffer, { httpMetadata: { contentType } })
  logger.debug(`✅ Uploaded processed image: ${r2Key}`)
  return r2Key
}

/**
 * Upload processed image and update processed_images / image_status in D1
 */
export async function uploadAndUpdateDatabase(
  bucket: R2Bucket,
  db: D1Database,
  r2PublicUrl: string,
  options: R2UploadOptions
): Promise<{ r2Key: string; publicUrl: string }> {
  const r2Key = await uploadProcessedImageToR2(bucket, options)
  await markImageAsProcessed(db, options.sku, options.companyId, options.filenamePart)
  const publicUrl = `${r2PublicUrl}/${r2Key}`
  logger.debug(`✅ DB status updated: ${r2Key}`)
  return { r2Key, publicUrl }
}

/**
 * マスク画像をR2に保存し、D1の mask_images_r2（JSON配列）を更新する
 * - 同一 filenamePart のエントリは上書き、新規は追加
 * - maskKey命名規則: {companyId}/{sku}/{filenamePart}_mask.png（タイムスタンプなし）
 */
export async function saveMaskToR2AndDb(
  bucket: R2Bucket,
  db: D1Database,
  r2PublicUrl: string,
  params: { companyId: string; sku: string; filenamePart: string; maskBytes: Uint8Array }
): Promise<string> {
  const { companyId, sku, filenamePart, maskBytes } = params
  const maskKey = `${companyId}/${sku}/${filenamePart}_mask.png`

  // R2に保存
  await bucket.put(maskKey, maskBytes, { httpMetadata: { contentType: 'image/png' } })
  const maskUrl = `${r2PublicUrl}/${maskKey}`
  logger.debug(`✅ Mask saved to R2: ${maskUrl}`)

  // D1の mask_images_r2（JSON配列）を更新
  const existing = await db.prepare(`
    SELECT mask_images_r2 FROM product_items
    WHERE sku = ? AND company_id = ?
  `).bind(sku, companyId).first()

  let maskImages: Array<{ filename: string; url: string }> = []
  try {
    const raw = existing?.mask_images_r2 as string | null
    if (raw && raw !== '[]') maskImages = JSON.parse(raw)
  } catch {
    maskImages = []
  }

  const idx = maskImages.findIndex(m => m.filename === filenamePart)
  if (idx >= 0) {
    maskImages[idx] = { filename: filenamePart, url: maskUrl }
  } else {
    maskImages.push({ filename: filenamePart, url: maskUrl })
  }

  await db.prepare(`
    UPDATE product_items
    SET mask_images_r2 = ?, updated_at = ?
    WHERE sku = ? AND company_id = ?
  `).bind(JSON.stringify(maskImages), new Date().toISOString(), sku, companyId).run()

  logger.debug(`✅ mask_images_r2 updated: ${JSON.stringify(maskImages)}`)
  return maskUrl
}

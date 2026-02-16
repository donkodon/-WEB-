/**
 * R2 Upload Helper for Background Removal
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { R2UploadOptions } from '../types'
import { logger } from '../../../shared/helpers/logger'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { markImageAsProcessed } from '../../image-editor/helpers/image-status'

/**
 * Upload processed image to R2 storage
 * Naming convention: {companyId}/{sku}/{filename}_p.png
 */
export async function uploadProcessedImageToR2(
  bucket: R2Bucket,
  options: R2UploadOptions
): Promise<string> {
  const { companyId, sku, filenamePart, imageBuffer, contentType = 'image/png' } = options
  
  const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`
  
  console.log(`📤 Uploading to R2: ${r2Key}`)
  
  await bucket.put(r2Key, imageBuffer, {
    httpMetadata: { contentType }
  })
  
  logger.debug(`✅ Uploaded processed image to R2: ${r2Key}`)
  
  return r2Key
}

/**
 * Upload processed image and update database
 */
export async function uploadAndUpdateDatabase(
  bucket: R2Bucket,
  db: D1Database,
  r2PublicUrl: string,
  options: R2UploadOptions
): Promise<{ r2Key: string; publicUrl: string }> {
  const r2Key = await uploadProcessedImageToR2(bucket, options)
  
  // Update database status
  await markImageAsProcessed(db, options.sku, options.companyId, options.filenamePart)
  
  const publicUrl = `${r2PublicUrl}/${r2Key}`
  logger.debug(`✅ Database status updated for: ${r2Key}`)
  
  return { r2Key, publicUrl }
}

/**
 * Convert base64 data URL to Uint8Array
 */
export function base64ToBuffer(dataUrl: string): Uint8Array {
  const base64Data = dataUrl.split(',')[1]
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  console.log(`📊 Converted ${bytes.length} bytes`)
  return bytes
}

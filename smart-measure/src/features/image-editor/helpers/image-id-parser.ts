/**
 * Image ID Parser & R2 Image Resolver
 *
 * imageId 形式: "r2_{sku}_{filenamePart}"
 *   例: r2_1025L280001_1025L280001_5
 *        → sku = "1025L280001", filenamePart = "1025L280001_5"
 *
 * R2 キー構造:
 *   {companyId}/{sku}/{filenamePart}.jpg       ← オリジナル
 *   {companyId}/{sku}/{filenamePart}_p.png     ← 白抜き (processed)
 *   {companyId}/{sku}/{filenamePart}_f.png     ← 最終編集 (final)
 */

import { logger } from '../../../shared/helpers/logger'

// ── Types ──────────────────────────────────────

export interface ParsedImageId {
  sku: string
  filenamePart: string
}

export type ImageVariant = 'final' | 'processed' | 'original'

export interface ResolvedImage {
  r2Object: R2ObjectBody
  key: string
  variant: ImageVariant
  mimeType: string
}

// ── imageId Parser ─────────────────────────────

/**
 * Parse imageId into SKU and filename part.
 * Format: "r2_{sku}_{filenamePart}"
 *   - parts[1] = sku
 *   - parts[2..] joined with "_" = filenamePart
 *
 * @returns ParsedImageId or null if invalid
 */
export function parseImageId(imageId: string): ParsedImageId | null {
  if (!imageId || !imageId.startsWith('r2_')) {
    return null
  }
  const parts = imageId.split('_')
  if (parts.length < 3) {
    return null
  }
  const sku = parts[1]
  const filenamePart = parts.slice(2).join('_')
  if (!sku || !filenamePart) {
    return null
  }
  return { sku, filenamePart }
}

// ── R2 Image Resolver ──────────────────────────

const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

/**
 * Resolve the best available image from R2 with priority:
 *   1. _f.png (final edited)
 *   2. _p.png (processed / bg-removed)
 *   3. original (try multiple extensions)
 *
 * Uses .get() to return the full R2ObjectBody for immediate use.
 */
export async function resolveR2Image(
  bucket: R2Bucket,
  companyId: string,
  sku: string,
  filenamePart: string,
  options?: { skipFinal?: boolean; skipProcessed?: boolean; skipOriginal?: boolean }
): Promise<ResolvedImage | null> {
  const prefix = `${companyId}/${sku}/${filenamePart}`

  // 1. Final edited image
  if (!options?.skipFinal) {
    const finalKey = `${prefix}_f.png`
    const obj = await safeGet(bucket, finalKey)
    if (obj) {
      logger.debug(`✅ [R2-RESOLVE] Found final: ${finalKey}`)
      return { r2Object: obj, key: finalKey, variant: 'final', mimeType: 'image/png' }
    }
  }

  // 2. Processed (bg-removed) image
  if (!options?.skipProcessed) {
    const processedKey = `${prefix}_p.png`
    const obj = await safeGet(bucket, processedKey)
    if (obj) {
      logger.debug(`✅ [R2-RESOLVE] Found processed: ${processedKey}`)
      return { r2Object: obj, key: processedKey, variant: 'processed', mimeType: 'image/png' }
    }
  }

  // 3. Original image (try multiple extensions)
  if (!options?.skipOriginal) {
    for (const ext of ORIGINAL_EXTENSIONS) {
      const originalKey = `${prefix}${ext}`
      const obj = await safeGet(bucket, originalKey)
      if (obj) {
        const mime = ext === '.webp' ? 'image/webp'
          : ext === '.png' ? 'image/png'
          : 'image/jpeg'
        logger.debug(`✅ [R2-RESOLVE] Found original: ${originalKey}`)
        return { r2Object: obj, key: originalKey, variant: 'original', mimeType: mime }
      }
    }
  }

  return null
}

/**
 * Check if an original image exists in R2 (HEAD only, no body fetch).
 * Returns the key and extension if found.
 */
export async function findOriginalImageKey(
  bucket: R2Bucket,
  companyId: string,
  sku: string,
  filenamePart: string
): Promise<{ key: string; ext: string } | null> {
  const prefix = `${companyId}/${sku}/${filenamePart}`
  for (const ext of ORIGINAL_EXTENSIONS) {
    const key = `${prefix}${ext}`
    const head = await safeHead(bucket, key)
    if (head) {
      return { key, ext: ext.replace('.', '') }
    }
  }
  return null
}

// ── R2 Object → base64 Data URL ────────────────

/**
 * Convert an R2ObjectBody to a base64 data URL.
 */
export async function r2ObjectToDataUrl(
  r2Object: R2ObjectBody,
  mimeType: string
): Promise<string> {
  const arrayBuffer = await r2Object.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return `data:${mimeType};base64,${base64}`
}

// ── Filename Generator ─────────────────────────

/**
 * Generate a download filename from image metadata.
 */
export function buildDownloadFilename(
  sku: string,
  filenamePart: string,
  variant: ImageVariant,
  key: string
): string {
  const ext = key.split('.').pop() || 'png'
  return `${sku}_${filenamePart}_${variant}.${ext}`
}

// ── Internal Helpers ───────────────────────────

async function safeGet(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  try {
    return await bucket.get(key)
  } catch {
    return null
  }
}

async function safeHead(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  try {
    return await bucket.head(key)
  } catch {
    return null
  }
}

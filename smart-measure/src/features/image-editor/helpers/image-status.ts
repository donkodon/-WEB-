/**
 * Image Status Helper
 * 
 * Manages image processing status to eliminate N+1 R2 API calls
 */

import type { D1Database } from '@cloudflare/workers-types'
import { logger } from '../../../shared/helpers/logger'

/**
 * Image processing status
 */
export type ImageStatus = 'original' | 'processed' | 'final'

/**
 * Update processed images list for a SKU
 * Call this after background removal (_p.png created)
 */
export async function markImageAsProcessed(
  db: D1Database,
  sku: string,
  companyId: string,
  filenameWithoutExt: string
): Promise<void> {
  // Get current processed_images list
  const result = await db.prepare(`
    SELECT processed_images FROM product_items
    WHERE sku = ? AND company_id = ?
  `).bind(sku, companyId).first();
  
  if (!result) {
    logger.warn(`⚠️ SKU ${sku} not found in product_items`);
    return;
  }
  
  // Parse current list
  let processedImages: string[] = [];
  try {
    processedImages = JSON.parse((result.processed_images as string) || '[]');
  } catch (e) {
    logger.error('Failed to parse processed_images:', e);
    processedImages = [];
  }
  
  // Add new filename if not already present
  if (!processedImages.includes(filenameWithoutExt)) {
    processedImages.push(filenameWithoutExt);
  }
  
  // Update DB
  await db.prepare(`
    UPDATE product_items
    SET processed_images = ?,
        image_status = 'processed',
        updated_at = CURRENT_TIMESTAMP
    WHERE sku = ? AND company_id = ?
  `).bind(JSON.stringify(processedImages), sku, companyId).run();
  
  logger.debug(`✅ Marked image as processed: ${sku}/${filenameWithoutExt}`);
}

/**
 * Update final images list for a SKU
 * Call this after editing (_f.png created)
 */
export async function markImageAsFinal(
  db: D1Database,
  sku: string,
  companyId: string,
  filenameWithoutExt: string
): Promise<void> {
  // Get current final_images list
  const result = await db.prepare(`
    SELECT final_images FROM product_items
    WHERE sku = ? AND company_id = ?
  `).bind(sku, companyId).first();
  
  if (!result) {
    logger.warn(`⚠️ SKU ${sku} not found in product_items`);
    return;
  }
  
  // Parse current list
  let finalImages: string[] = [];
  try {
    finalImages = JSON.parse((result.final_images as string) || '[]');
  } catch (e) {
    logger.error('Failed to parse final_images:', e);
    finalImages = [];
  }
  
  // Add new filename if not already present
  if (!finalImages.includes(filenameWithoutExt)) {
    finalImages.push(filenameWithoutExt);
  }
  
  // Update DB
  await db.prepare(`
    UPDATE product_items
    SET final_images = ?,
        image_status = 'final',
        updated_at = CURRENT_TIMESTAMP
    WHERE sku = ? AND company_id = ?
  `).bind(JSON.stringify(finalImages), sku, companyId).run();
  
  logger.debug(`✅ Marked image as final: ${sku}/${filenameWithoutExt}`);
}

/**
 * Get image display URL based on status (no R2 API calls)
 * 
 * @param sku - Product SKU
 * @param filenameWithoutExt - Image filename without extension
 * @param processedImages - List of processed image filenames
 * @param finalImages - List of final image filenames
 * @param companyId - Company ID
 * @returns Display URL and status
 */
export function getImageDisplayUrl(
  sku: string,
  filenameWithoutExt: string,
  processedImages: string[],
  finalImages: string[],
  companyId: string,
  updatedAt?: string
): { url: string; status: ImageStatus } {
  // Use updatedAt timestamp for cache busting (more stable than Date.now())
  const cacheParam = updatedAt ? `?v=${new Date(updatedAt).getTime()}` : `?v=${Date.now()}`;
  
  // All images use image-proxy API for consistent company_id resolution and security
  // Priority: _f.png > _p.png > original
  if (finalImages.includes(filenameWithoutExt)) {
    return {
      url: `/api/image-proxy/${sku}/${filenameWithoutExt}_f.png${cacheParam}`,
      status: 'final'
    };
  }
  
  if (processedImages.includes(filenameWithoutExt)) {
    return {
      url: `/api/image-proxy/${sku}/${filenameWithoutExt}_p.png${cacheParam}`,
      status: 'processed'
    };
  }
  
  // Original image via image-proxy API (ensures proper company_id resolution)
  return {
    url: `/api/image-proxy/${sku}/${filenameWithoutExt}.jpg${cacheParam}`,
    status: 'original'
  };
}

/**
 * Batch update image status for multiple images
 * Useful for initial data migration or bulk operations
 */
export async function batchUpdateImageStatus(
  db: D1Database,
  sku: string,
  companyId: string,
  processedImages: string[],
  finalImages: string[]
): Promise<void> {
  // Determine overall status
  let status: ImageStatus = 'original';
  if (finalImages.length > 0) {
    status = 'final';
  } else if (processedImages.length > 0) {
    status = 'processed';
  }
  
  await db.prepare(`
    UPDATE product_items
    SET processed_images = ?,
        final_images = ?,
        image_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE sku = ? AND company_id = ?
  `).bind(
    JSON.stringify(processedImages),
    JSON.stringify(finalImages),
    status,
    sku,
    companyId
  ).run();
  
  logger.debug(`✅ Batch updated image status for SKU ${sku}: ${status}`);
}

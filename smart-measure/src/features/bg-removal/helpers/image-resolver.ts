/**
 * Image Resolver Helper
 * Resolves R2 image URLs and parses image IDs
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { ImageResolverResult } from '../types'
import { logger } from '../../../shared/helpers/logger'

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const COMPANY_IDS = ['relight', 'saisunsatsuei', 'test_company'] // Fallback company IDs

/**
 * Parse R2 image ID
 * Format: r2_{SKU}_{filename}
 */
export function parseImageId(imageId: string): { sku: string; filenamePart: string } | null {
  if (!imageId.startsWith('r2_')) {
    return null
  }
  
  const parts = imageId.replace('r2_', '').split('_')
  if (parts.length < 2) {
    return null
  }
  
  return {
    sku: parts[0],
    filenamePart: parts.slice(1).join('_')
  }
}

/**
 * Resolve R2 image URL
 * Tries multiple company IDs and file extensions
 */
export async function resolveR2ImageUrl(
  bucket: R2Bucket | undefined,
  r2PublicUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string
): Promise<ImageResolverResult | null> {
  const companyIds = [companyId, ...COMPANY_IDS]
  
  console.log('🔍 Resolving image:', { companyId, sku, filenamePart })
  
  // Try each company ID and extension combination
  for (const tryCompanyId of companyIds) {
    for (const ext of EXTENSIONS) {
      const testKey = `${tryCompanyId}/${sku}/${filenamePart}.${ext}`
      
      // Try R2 head first (local/production R2 bucket)
      if (bucket) {
        try {
          const obj = await bucket.head(testKey)
          if (obj) {
            const originalUrl = `${r2PublicUrl}/${testKey}`
            console.log(`✅ Found R2 image via R2 API: ${testKey}`)
            return {
              originalUrl,
              companyId: tryCompanyId,
              sku,
              filenamePart
            }
          }
        } catch (e) {
          // Continue to next attempt
        }
      }
      
      // Fallback: Try HTTP HEAD request to public R2 URL
      // (This works when local R2 doesn't have the file but production R2 does)
      try {
        const testUrl = `${r2PublicUrl}/${testKey}`
        const headResponse = await fetch(testUrl, { method: 'HEAD' })
        if (headResponse.ok) {
          console.log(`✅ Found R2 image via HTTP HEAD: ${testKey}`)
          return {
            originalUrl: testUrl,
            companyId: tryCompanyId,
            sku,
            filenamePart
          }
        }
      } catch (e) {
        // Ignore fetch errors
      }
    }
  }
  
  // Image not found
  console.error(`❌ Image not found in R2 after trying multiple company IDs`)
  return null
}

/**
 * Get searched paths for error message
 */
export function getSearchedPaths(companyIds: string[], sku: string, filenamePart: string): string {
  return companyIds
    .map(cid => `${cid}/${sku}/${filenamePart}.{jpg,jpeg,png,webp}`)
    .join(', ')
}

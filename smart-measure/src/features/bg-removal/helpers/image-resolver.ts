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
 * Prioritizes authenticated user's company_id from database
 */
export async function resolveR2ImageUrl(
  bucket: R2Bucket | undefined,
  r2PublicUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string,
  db?: D1Database,
  isAuthenticated: boolean = false
): Promise<ImageResolverResult | null> {
  let companyIdFromDb: string | null = null;
  
  if (db) {
    try {
      if (isAuthenticated && companyId) {
        // ✅ Authenticated request: verify SKU belongs to user's company
        const dbResult = await db.prepare(`
          SELECT company_id FROM product_items 
          WHERE sku = ? AND company_id = ?
          LIMIT 1
        `).bind(sku, companyId).first();
        
        if (!dbResult) {
          console.error('❌ SKU not found in user company:', { sku, companyId });
          return null;
        }
        
        companyIdFromDb = dbResult.company_id as string;
        console.log('✅ Authenticated - SKU verified for company:', companyIdFromDb);
      } else {
        // ⚠️ Unauthenticated request: query DB by SKU only
        const dbResult = await db.prepare(`
          SELECT company_id FROM product_items 
          WHERE sku = ? 
          ORDER BY updated_at DESC 
          LIMIT 1
        `).bind(sku).first();
        
        if (dbResult && dbResult.company_id) {
          companyIdFromDb = dbResult.company_id as string;
          console.log('📊 Unauthenticated - Found company_id from DB:', companyIdFromDb);
        }
      }
    } catch (error) {
      console.warn('⚠️ DB query for company_id failed:', error);
    }
  }
  
  // Build search list based on authentication status
  const companyIds = isAuthenticated && companyIdFromDb
    ? [companyIdFromDb]  // Authenticated: only user's company
    : companyIdFromDb 
      ? [companyIdFromDb, ...COMPANY_IDS]  // Unauthenticated with DB result
      : [companyId, ...COMPANY_IDS];  // Fallback to defaults
  
  console.log('🔍 Resolving image:', { companyId, sku, filenamePart, companyIdFromDb, isAuthenticated })
  
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

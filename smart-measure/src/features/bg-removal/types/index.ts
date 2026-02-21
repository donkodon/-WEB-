/**
 * Background Removal Types
 */
import type { _CloudflareAI } from '../../../types/bindings'

/**
 * Background removal result
 */
export interface BgRemovalResult {
  success: boolean
  imageBuffer?: ArrayBuffer
  imageDataUrl?: string
  maskDataUrl?: string
  error?: string
}

/**
 * Cloudflare AI result
 */
export interface CloudflareAIResult {
  success: boolean
  imageBuffer?: ArrayBuffer
  error?: string
}

/**
 * withoutBG API result
 */
export interface WithoutBGResult {
  success: boolean
  imageDataUrl?: string
  maskDataUrl?: string
  error?: string
}

/**
 * Fal.ai BRIA API result
 */
export interface BriaApiResult {
  success: boolean
  imageUrl?: string
  error?: string
}

/**
 * R2 upload options
 */
export interface R2UploadOptions {
  companyId: string
  sku: string
  filenamePart: string
  imageBuffer: ArrayBuffer | Uint8Array
  contentType?: string
}

/**
 * Image resolver result
 */
export interface ImageResolverResult {
  originalUrl: string
  companyId: string
  sku: string
  filenamePart: string
}

/**
 * Background removal request
 */
export interface BgRemovalRequest {
  imageUrl: string
  model?: 'cloudflare-ai' | 'withoutbg' | 'bria'
  useBriaApi?: boolean
}

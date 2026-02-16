/**
 * Cloudflare AI Background Removal Service
 */
import type { CloudflareAI } from '../../../types/bindings'
import type { CloudflareAIResult } from '../types'
import { logger } from '../../../shared/helpers/logger'

/**
 * Remove background using Cloudflare AI
 * Model: @cf/bria/rmbg-1.4
 */
export async function removeBackgroundWithCloudflareAI(
  ai: CloudflareAI,
  imageUrl: string
): Promise<CloudflareAIResult> {
  try {
    logger.debug('🤖 Using Cloudflare AI for background removal...')
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    const imageBuffer = await response.arrayBuffer()
    
    const result = await ai.run('@cf/bria/rmbg-1.4', {
      image: [...new Uint8Array(imageBuffer)]
    })
    
    return { success: true, imageBuffer: result }
  } catch (error: any) {
    logger.error('Cloudflare AI failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * withoutBG API Background Removal Service
 * Free background removal using Hugging Face Spaces
 * Endpoint: https://jinkedon-withoutbg-api.hf.space
 */
import type { WithoutBGResult } from '../types'
import { logger } from '../../../shared/helpers/logger'

const BASE_URL = 'https://jinkedon-withoutbg-api.hf.space'
const URL_ENDPOINT    = `${BASE_URL}/api/remove-bg-from-url`
const BASE64_ENDPOINT = `${BASE_URL}/api/remove-bg-base64`

/**
 * 背景削除（withoutBG Focus model）
 * - URL入力    → /api/remove-bg-from-url  { image_url, return_mask }
 * - base64入力 → /api/remove-bg-base64   { image_base64, return_mask }
 */
export async function removeBackgroundWithWithoutBG(imageUrl: string): Promise<WithoutBGResult> {
  try {
    let apiEndpoint: string
    let requestBody: Record<string, unknown>

    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) throw new Error('Invalid data URL format')
      apiEndpoint = BASE64_ENDPOINT
      requestBody = { image_base64: matches[2], return_mask: true }
      logger.debug(`📦 withoutBG: base64 input (${matches[2].length} chars)`)
    } else {
      apiEndpoint = URL_ENDPOINT
      requestBody = { image_url: imageUrl, return_mask: true }
      logger.debug(`🌐 withoutBG: URL input → ${imageUrl.substring(0, 80)}`)
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`withoutBG API error ${response.status}: ${text}`)
    }

    const result = await response.json() as { success: boolean; image_data?: string; mask_data?: string; error?: string }

    if (!result.success || !result.image_data) {
      throw new Error(result.error || 'Invalid response from withoutBG API')
    }

    logger.debug(`✅ withoutBG completed. hasMask=${!!result.mask_data}`)

    return { success: true, imageDataUrl: result.image_data, maskDataUrl: result.mask_data }
  } catch (error: any) {
    logger.error('withoutBG API failed:', error.message)
    return { success: false, error: error.message }
  }
}

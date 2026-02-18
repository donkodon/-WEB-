/**
 * withoutBG API Background Removal Service
 * Free background removal using Hugging Face Spaces
 */
import type { WithoutBGResult } from '../types'
import { logger } from '../../../shared/helpers/logger'

const WITHOUTBG_BASE_URL = 'https://jinkedon-withoutbg-api.hf.space'
const WITHOUTBG_URL_ENDPOINT = `${WITHOUTBG_BASE_URL}/api/remove-bg-from-url`
const WITHOUTBG_BASE64_ENDPOINT = `${WITHOUTBG_BASE_URL}/api/remove-bg-base64`

/**
 * Remove background using withoutBG Focus model
 * Supports both URL and base64 data URL formats
 * - URL入力 → /api/remove-bg-from-url (JSON: { image_url, return_mask })
 * - base64入力 → /api/remove-bg-base64 (JSON: { image_base64, return_mask })
 */
export async function removeBackgroundWithWithoutBG(
  imageUrl: string
): Promise<WithoutBGResult> {
  try {
    console.log('🎨 [removeBackgroundWithWithoutBG] Starting... imageUrl:', imageUrl?.substring(0, 100))
    
    let requestBody: any
    let apiEndpoint: string
    
    if (imageUrl.startsWith('data:')) {
      logger.debug('📦 Detected base64 data URL, extracting base64 data...')
      
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) {
        throw new Error('Invalid data URL format')
      }
      
      const base64Data = matches[2]
      logger.debug(`📊 Base64 data length: ${base64Data.length} characters`)
      
      // base64入力 → /api/remove-bg-base64
      apiEndpoint = WITHOUTBG_BASE64_ENDPOINT
      requestBody = {
        image_base64: base64Data,
        return_mask: true
      }
    } else {
      // URL入力 → /api/remove-bg-from-url
      apiEndpoint = WITHOUTBG_URL_ENDPOINT
      requestBody = {
        image_url: imageUrl,
        return_mask: true
      }
    }
    
    console.log('📡 [removeBackgroundWithWithoutBG] Sending request to withoutBG API...')
    console.log('📡 Endpoint:', apiEndpoint)
    console.log('📡 Request body:', JSON.stringify(requestBody).substring(0, 200))
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    console.log('📡 [removeBackgroundWithWithoutBG] Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [removeBackgroundWithWithoutBG] API error:', errorText)
      throw new Error(`withoutBG API failed: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    console.log('📡 [removeBackgroundWithWithoutBG] Got result:', result?.success)
    console.log('📡 [removeBackgroundWithWithoutBG] Result keys:', Object.keys(result))
    console.log('📡 [removeBackgroundWithWithoutBG] Has mask_data:', !!result.mask_data)
    
    if (!result.success || !result.image_data) {
      throw new Error(result.error || 'Invalid response from withoutBG API')
    }
    
    console.log('✅ withoutBG Focus background removal completed')
    console.log(`🎭 Mask data available: ${!!result.mask_data}`)
    if (result.mask_data) {
      console.log(`🎭 Mask data length: ${result.mask_data.length} characters`)
    } else {
      console.log('⚠️ WARNING: No mask_data in response!')
    }
    
    return {
      success: true,
      imageDataUrl: result.image_data,
      maskDataUrl: result.mask_data
    }
  } catch (error: any) {
    logger.error('withoutBG API failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Fal.ai BRIA RMBG API Service
 * Cloud-based background removal using Fal.ai
 */
import type { BriaApiResult } from '../types'
import { logger } from '../../../shared/helpers/logger'

const BRIA_SUBMIT_URL = 'https://queue.fal.run/fal-ai/birefnet'
const BRIA_STATUS_BASE = 'https://queue.fal.run/fal-ai/birefnet/requests'
const MAX_POLL_ATTEMPTS = 30
const POLL_INTERVAL_MS = 2000

/**
 * Call Fal.ai BRIA RMBG API
 * Submits job and polls for completion
 */
export async function callBriaApi(
  imageUrl: string,
  apiKey: string
): Promise<BriaApiResult> {
  try {
    logger.debug('🌐 Calling Fal.ai BRIA RMBG API...')
    
    // Submit job
    const submitResponse = await fetch(BRIA_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: imageUrl })
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      throw new Error(`Fal.ai submit failed: ${submitResponse.status} - ${errorText}`)
    }

    const submitResult = await submitResponse.json() as { 
      request_id?: string
      status?: string
      response_url?: string 
    }
    logger.debug('📤 Fal.ai job submitted:', submitResult)

    const requestId = submitResult.request_id
    if (!requestId) {
      throw new Error('No request_id returned from Fal.ai')
    }

    // Poll for completion
    let result: any = null
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      
      const statusResponse = await fetch(`${BRIA_STATUS_BASE}/${requestId}/status`, {
        headers: { 'Authorization': `Key ${apiKey}` }
      })

      if (!statusResponse.ok) continue

      const statusResult = await statusResponse.json() as { status: string }
      logger.debug(`📊 Fal.ai status: ${statusResult.status}`)

      if (statusResult.status === 'COMPLETED') {
        const resultResponse = await fetch(`${BRIA_STATUS_BASE}/${requestId}`, {
          headers: { 'Authorization': `Key ${apiKey}` }
        })
        if (resultResponse.ok) {
          result = await resultResponse.json()
          break
        }
      } else if (statusResult.status === 'FAILED') {
        throw new Error('Fal.ai processing failed')
      }
    }

    if (!result) {
      throw new Error('Fal.ai processing timeout')
    }

    const outputUrl = result.image?.url
    if (!outputUrl) {
      throw new Error('No output image URL from Fal.ai')
    }

    logger.debug('✅ Fal.ai BRIA processing complete:', outputUrl)
    return { success: true, imageUrl: outputUrl }

  } catch (error: any) {
    logger.error('Fal.ai BRIA API error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Validate Fal.ai API key
 */
export function isBriaApiKeyValid(apiKey: string | undefined): boolean {
  return !!(apiKey && apiKey !== 'demo' && apiKey !== 'your-fal-api-key-here')
}

/**
 * ReplicateService - Replicate API 呼び出し実装
 * 責務: Replicate へのHTTPリクエストとポーリングのみ。
 */
import type { IReplicateService, ReplicateResult, ReplicateMeasurementOutput } from '../../../shared/interfaces/replicate-service.interface'
import { logger } from '../../../shared/helpers/logger'

const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions'
const MODEL_VERSION = '6f4a150f6355b07eff5151b7ef49f2bf0b297bd329ee5f17a46e283f0685f926'
const MAX_POLL_ATTEMPTS = 90
const POLL_INTERVAL_MS = 2000

export class ReplicateService implements IReplicateService {
  async runMeasurement(imageUrl: string, garmentClass: string, apiKey: string): Promise<ReplicateResult> {
    logger.debug(`📤 Sending to Replicate: garment_class=${garmentClass}`)
    const createResponse = await fetch(REPLICATE_PREDICTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: MODEL_VERSION, input: { image: imageUrl, garment_class: garmentClass } }),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      logger.error('❌ Replicate submit failed:', errorText)
      return { success: false, error: `Replicate submit failed: ${errorText}` }
    }

    const prediction = await createResponse.json() as { id: string; status: string; output?: unknown }
    logger.debug(`⏳ Prediction created: ${prediction.id}`)

    let result = prediction
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      const statusRes = await fetch(`${REPLICATE_PREDICTIONS_URL}/${prediction.id}`, {
        headers: { Authorization: `Token ${apiKey}` },
      })
      result = await statusRes.json() as typeof prediction
      logger.debug(`⏳ Polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): status=${result.status}`)
      if (result.status === 'succeeded') break
      if (result.status === 'failed') return { success: false, error: 'Replicate prediction failed' }
    }

    if (result.status !== 'succeeded') return { success: false, error: 'Replicate prediction timed out' }
    logger.debug('✅ Replicate prediction succeeded')
    return { success: true, output: result.output as ReplicateMeasurementOutput }
  }
}

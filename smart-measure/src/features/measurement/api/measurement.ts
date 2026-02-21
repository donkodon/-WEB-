/**
 * measurement.ts - HTTP層（ルーティングのみ）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'
import { MeasurementRepository } from '../repositories/measurement-repository'
import { ReplicateService } from '../services/replicate-service'
import { MeasurementService } from '../services/measurement-service'

const measurement = new Hono<AppEnv>()
measurement.use('*', requireFirebaseAuth)

function createMeasurementService(): MeasurementService {
  return new MeasurementService(new MeasurementRepository(), new ReplicateService())
}

measurement.post('/api/auto-measure', async (c) => {
  try {
    const { imageId, imageUrl, sku } = await c.req.json()
    const companyId = getCompanyId(c)
    logger.debug(`🔬 Auto-measure request:`, { imageId, imageUrl, sku, companyId })

    if (!c.env.REPLICATE_API_KEY) {
      return c.json({ success: false, error: 'REPLICATE_API_KEY is not configured.' }, 500)
    }

    const service = createMeasurementService()
    const garmentClass = c.env.DEFAULT_GARMENT_CLASS || 'long sleeve top'

    if (!(await service.verifyProductExists(c.env.DB, sku, companyId))) {
      return c.json({ success: false, error: 'Product not found' }, 404)
    }

    const result = await service.autoMeasure(c.env.DB, {
      imageId, imageUrl, sku, companyId, garmentClass,
      apiKey: c.env.REPLICATE_API_KEY,
      r2Bucket: c.env.PRODUCT_IMAGES,
      r2PublicUrlFn: (key: string) => `${c.env.R2_PUBLIC_URL || ''}/${key}`,
    })

    if (!result.success) return c.json({ success: false, error: result.error }, 500)
    return c.json({ success: true, itemCode: result.itemCode, updated: result.updated,
      measurements: result.measurements, annotatedImage: result.annotatedImage, pixelPerCm: result.pixelPerCm })

  } catch (error: unknown) {
    logError('Auto-measure', error)
    return c.json(createSafeErrorResponse(error, ErrorCode.EXTERNAL_API_ERROR), 500)
  }
})

measurement.get('/api/measurements/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    logger.debug(`📊 Get measurement: SKU=${sku}, company_id=${companyId}`)

    const service = createMeasurementService()
    const data = await service.getMeasurementData(c.env.DB, sku, companyId)
    if (!data) return c.json({ success: false, error: 'No measurement data found for this SKU' }, 404)
    return c.json({ success: true, data })

  } catch (error: unknown) {
    logError('Get measurement data', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500)
  }
})

measurement.patch('/api/measurements/:sku', async (c) => {
  try {
    const sku = c.req.param('sku')
    const companyId = getCompanyId(c)
    const { manual_landmarks, measurements } = await c.req.json()
    logger.debug(`💾 Update landmarks: SKU=${sku}`)

    const service = createMeasurementService()
    const result = await service.updateManualLandmarks(c.env.DB, sku, companyId, manual_landmarks, measurements)
    if (!result.success) return c.json({ success: false, error: result.error }, 404)
    return c.json({ success: true, message: 'Landmarks updated successfully' })

  } catch (error: unknown) {
    logError('Update landmarks', error, { sku: c.req.param('sku') })
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500)
  }
})

export default measurement

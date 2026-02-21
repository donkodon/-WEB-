/**
 * MeasurementService - 採寸のビジネスロジック
 * 非依存: HonoContext (c.env) → HTTP層から完全分離
 */
import type { IMeasurementRepository } from '../../../shared/interfaces/measurement-repository.interface'
import type { IReplicateService } from '../../../shared/interfaces/replicate-service.interface'
import type { R2Bucket } from '@cloudflare/workers-types'
import { logger } from '../../../shared/helpers/logger'

export interface AutoMeasureSuccess {
  success: true; itemCode: string; updated: boolean
  measurements: Record<string, unknown>; annotatedImage: string; pixelPerCm: number
}
export interface AutoMeasureFailure { success: false; error: string }
export type AutoMeasureResult = AutoMeasureSuccess | AutoMeasureFailure

export interface MeasurementData {
  id: number; sku: string; item_code: string
  image_url: string | null; annotated_image_url: string | null; measurement_image_url: string | null
  landmarks: Record<string, unknown>; pixel_per_cm: number; measurements: Record<string, unknown>
  measurement_status: string | null; measurement_category: string | null; measured_at: string | null
}

export interface AutoMeasureParams {
  imageId: string; imageUrl: string; sku: string; companyId: string
  garmentClass: string; apiKey: string
  r2Bucket: R2Bucket | undefined
  r2PublicUrlFn: (key: string) => string
}

export class MeasurementService {
  constructor(
    private readonly measurementRepo: IMeasurementRepository,
    private readonly replicateService: IReplicateService
  ) {}

  async verifyProductExists(db: D1Database, sku: string, companyId: string): Promise<boolean> {
    return (await this.measurementRepo.findProductMaster(db, sku, companyId)) !== null
  }

  async autoMeasure(db: D1Database, params: AutoMeasureParams): Promise<AutoMeasureResult> {
    const { imageUrl, sku, companyId, garmentClass, apiKey, r2Bucket, r2PublicUrlFn } = params

    const replicateResult = await this.replicateService.runMeasurement(imageUrl, garmentClass, apiKey)
    if (!replicateResult.success) return { success: false, error: replicateResult.error }
    const output = replicateResult.output

    const timestamp = Date.now()
    let measurementImageUrl = output.image
    let maskImageUrl: string | null = output.mask ?? null

    if (r2Bucket) {
      measurementImageUrl = await this.copyImageToR2(r2Bucket, output.image,
        `${companyId}/${sku}/measurement_${timestamp}.png`, r2PublicUrlFn) ?? output.image
      if (output.mask) {
        maskImageUrl = await this.copyImageToR2(r2Bucket, output.mask,
          `${companyId}/${sku}/mask_${timestamp}.png`, r2PublicUrlFn) ?? output.mask
      }
    }

    const saveParams = {
      sku, companyId, imageUrl, garmentClass,
      landmarks: output.landmarks, pixelPerCm: output.pixel_per_cm,
      measurements: output.measurements, measurementImageUrl, maskImageUrl,
    }

    const existing = await this.measurementRepo.findExistingItem(db, sku, companyId, imageUrl)
    if (existing) {
      await this.measurementRepo.updateMeasurement(db, existing.id, saveParams)
      return { success: true, itemCode: existing.item_code, updated: true,
        measurements: output.measurements, annotatedImage: measurementImageUrl, pixelPerCm: output.pixel_per_cm }
    }

    const itemCode = await this.measurementRepo.generateNextItemCode(db, sku)
    await this.measurementRepo.insertMeasurement(db, itemCode, saveParams)
    return { success: true, itemCode, updated: false,
      measurements: output.measurements, annotatedImage: measurementImageUrl, pixelPerCm: output.pixel_per_cm }
  }

  async getMeasurementData(db: D1Database, sku: string, companyId: string): Promise<MeasurementData | null> {
    const record = await this.measurementRepo.findMeasurementBySku(db, sku, companyId)
    if (!record) return null

    let displayImageUrl: string | null = record.image_urls[0] ?? null
    if (record.measurement_image_url?.includes('_p.png')) {
      displayImageUrl = record.measurement_image_url
      logger.debug(`✅ Using processed measurement image for SKU ${sku}`)
    } else if (record.annotated_image_url) {
      displayImageUrl = record.annotated_image_url
      logger.debug(`ℹ️ Using annotated image for SKU ${sku}`)
    }

    return {
      id: record.id, sku: record.sku, item_code: record.item_code,
      image_url: displayImageUrl,
      annotated_image_url: record.annotated_image_url,
      measurement_image_url: record.measurement_image_url,
      landmarks: record.manual_landmarks ?? record.ai_landmarks,
      pixel_per_cm: record.reference_object.pixelPerCm ?? 15.0,
      measurements: record.measurements,
      measurement_status: record.measurement_status,
      measurement_category: record.measurement_category,
      measured_at: record.measured_at,
    }
  }

  async updateManualLandmarks(
    db: D1Database, sku: string, companyId: string,
    manualLandmarks: unknown, measurements: unknown
  ): Promise<{ success: boolean; error?: string }> {
    const existing = await this.measurementRepo.findMeasurementBySku(db, sku, companyId)
    if (!existing) return { success: false, error: 'No measurement data found for this SKU' }
    await this.measurementRepo.updateManualLandmarks(db, existing.id, manualLandmarks, measurements)
    return { success: true }
  }

  private async copyImageToR2(
    bucket: R2Bucket, sourceUrl: string, r2Key: string, r2PublicUrlFn: (key: string) => string
  ): Promise<string | null> {
    try {
      const res = await fetch(sourceUrl)
      if (!res.ok) { logger.error(`❌ Download failed: ${sourceUrl}`); return null }
      const buffer = await res.arrayBuffer()
      await bucket.put(r2Key, buffer, { httpMetadata: { contentType: 'image/png' } })
      const publicUrl = r2PublicUrlFn(r2Key)
      logger.debug(`✅ Saved to R2: ${publicUrl}`)
      return publicUrl
    } catch (err: unknown) {
      logger.error(`❌ R2 copy failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
}

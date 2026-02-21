/**
 * IReplicateService - Replicate API 呼び出しの抽象インターフェース
 */
export interface ReplicateMeasurementOutput {
  image: string
  mask?: string
  landmarks: Record<string, unknown>
  pixel_per_cm: number
  measurements: Record<string, unknown>
}

export interface ReplicateMeasurementResult {
  success: true
  output: ReplicateMeasurementOutput
}

export interface ReplicateMeasurementFailure {
  success: false
  error: string
}

export type ReplicateResult = ReplicateMeasurementResult | ReplicateMeasurementFailure

export interface IReplicateService {
  runMeasurement(imageUrl: string, garmentClass: string, apiKey: string): Promise<ReplicateResult>
}

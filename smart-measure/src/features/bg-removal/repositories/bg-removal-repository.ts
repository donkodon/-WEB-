/**
 * BgRemovalRepository - R2/D1 操作の実装クラス
 *
 * 責務: R2へのアップロードとD1の更新のみ
 * ビジネスロジック（プロバイダー選択・オーケストレーション）は持たない
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type {
  IBgRemovalRepository,
  UploadProcessedParams,
  UploadResult,
  SaveMaskParams,
} from '../../../shared/interfaces/bg-removal-repository.interface'
import { uploadAndUpdateDatabase, saveMaskToR2AndDb } from '../helpers/r2-uploader'
import { logger } from '../../../shared/helpers/logger'

export class BgRemovalRepository implements IBgRemovalRepository {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly db: D1Database,
    private readonly r2PublicUrl: string
  ) {}

  async uploadProcessedAndUpdateDb(params: UploadProcessedParams): Promise<UploadResult> {
    logger.debug(`📤 BgRemovalRepository.uploadProcessedAndUpdateDb: sku=${params.sku}, part=${params.filenamePart}`)
    return uploadAndUpdateDatabase(
      this.bucket,
      this.db,
      this.r2PublicUrl,
      params
    )
  }

  async saveMaskAndUpdateDb(params: SaveMaskParams): Promise<string> {
    logger.debug(`🎭 BgRemovalRepository.saveMaskAndUpdateDb: sku=${params.sku}, part=${params.filenamePart}`)
    return saveMaskToR2AndDb(
      this.bucket,
      this.db,
      this.r2PublicUrl,
      params
    )
  }
}

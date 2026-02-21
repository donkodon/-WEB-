/**
 * BgRemovalOrchestrator - 背景削除のオーケストレーター
 *
 * 責務:
 *   - プロバイダーの優先順位に従ってフォールバックしながら背景削除を実行
 *   - R2/D1への保存（IBgRemovalRepository経由）
 *   - c.env に直接依存しない → テストで完全モック可能
 *
 * 依存（インターフェース経由）:
 *   - IBgRemovalProvider[] : 背景削除プロバイダーのリスト（優先順位順）
 *   - IBgRemovalRepository : R2/D1操作
 *
 * 使い方（Composition Root）:
 *   const orchestrator = new BgRemovalOrchestrator(
 *     [new WithoutBGProvider(), new CloudflareAIProvider(c.env.AI)],
 *     new BgRemovalRepository(c.env.PRODUCT_IMAGES, c.env.DB, r2PublicUrl)
 *   )
 *   const result = await orchestrator.execute(params)
 */
import type { IBgRemovalProvider } from '../../../shared/interfaces/bg-removal-provider.interface'
import type { IBgRemovalRepository } from '../../../shared/interfaces/bg-removal-repository.interface'
import { logger } from '../../../shared/helpers/logger'
import { base64ToBuffer } from '../helpers/r2-uploader'

// ── 出力型（routes.ts が使う型） ─────────────────────────────────────────────

export interface OrchestratorSuccess {
  success: true
  processedUrl: string
  maskUrl: string | null
  message: string
}

export interface OrchestratorFailure {
  success: false
  error: string
}

export type OrchestratorResult = OrchestratorSuccess | OrchestratorFailure

// ── 実行パラメーター ──────────────────────────────────────────────────────────

export interface OrchestratorParams {
  imageUrl: string
  companyId: string
  sku: string
  filenamePart: string
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export class BgRemovalOrchestrator {
  constructor(
    private readonly providers: IBgRemovalProvider[],
    private readonly repository: IBgRemovalRepository
  ) {}

  async execute(params: OrchestratorParams): Promise<OrchestratorResult> {
    const { imageUrl, companyId, sku, filenamePart } = params

    // ── プロバイダーを優先順位順に試す ────────────────────────────────────────
    for (const provider of this.providers) {
      if (!provider.isAvailable()) {
        logger.debug(`⏭️ Skipping unavailable provider`)
        continue
      }

      logger.debug(`🚀 Trying provider...`)
      const providerResult = await provider.removeBackground({ imageUrl })

      if (!providerResult.success) {
        logger.warn(`⚠️ Provider ${providerResult.providerName} failed: ${providerResult.error}`)
        continue  // 次のプロバイダーへフォールバック
      }

      // ── 処理済み画像を R2 保存 + D1 更新 ────────────────────────────────────
      const { publicUrl } = await this.repository.uploadProcessedAndUpdateDb({
        companyId, sku, filenamePart,
        imageBuffer: providerResult.imageBuffer,
      })

      // ── マスク画像がある場合は保存 ──────────────────────────────────────────
      let maskUrl: string | null = null
      if (providerResult.maskDataUrl) {
        try {
          const maskBytes = base64ToBuffer(providerResult.maskDataUrl)
          maskUrl = await this.repository.saveMaskAndUpdateDb({
            companyId, sku, filenamePart, maskBytes,
          })
          logger.debug(`🎭 Mask saved: ${maskUrl}`)
        } catch (maskErr: unknown) {
          const msg = maskErr instanceof Error ? maskErr.message : String(maskErr)
          logger.error(`❌ Failed to save mask: ${msg}`)
          // マスク保存失敗は致命的エラーではない → 処理続行
        }
      }

      logger.debug(`✅ BgRemoval complete via ${providerResult.providerName}: ${publicUrl}`)
      return {
        success: true,
        processedUrl: publicUrl,
        maskUrl,
        message: `Background removed using ${providerResult.providerName}`,
      }
    }

    // ── すべてのプロバイダーが失敗 ────────────────────────────────────────────
    logger.error('❌ All background removal providers failed')
    return {
      success: false,
      error: 'Background removal failed: all services unavailable.',
    }
  }
}

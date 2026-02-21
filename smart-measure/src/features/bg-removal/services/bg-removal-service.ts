/**
 * bg-removal-service.ts - Composition Root（コンポジッションルート）
 *
 * 責務:
 *   - c.env から必要な値を取り出し、具体クラスをインスタンス化して注入する
 *   - BgRemovalOrchestrator.execute() を呼ぶだけ
 *
 * ビジネスロジック・API呼び出しはすべて以下に委譲:
 *   - providers/: 各プロバイダークラス
 *   - repositories/: R2/D1操作
 *   - services/bg-removal-orchestrator.ts: フォールバック制御
 */
import type { HonoContext } from '../../../types/bindings'
import { getR2PublicUrl } from '../../image-editor/helpers/r2-url'
import { WithoutBGProvider } from '../providers/withoutbg-provider'
import { BriaProvider } from '../providers/bria-provider'
import { CloudflareAIProvider } from '../providers/cloudflare-ai-provider'
import { BgRemovalRepository } from '../repositories/bg-removal-repository'
import { BgRemovalOrchestrator } from './bg-removal-orchestrator'
import type { OrchestratorResult } from './bg-removal-orchestrator'

// 後方互換のため型エイリアスを維持
export type BgRemovalSuccess = Extract<OrchestratorResult, { success: true }>
export type BgRemovalFailure = Extract<OrchestratorResult, { success: false }>
export type BgRemovalServiceResult = OrchestratorResult

/**
 * 背景削除エントリーポイント
 *
 * プロバイダー優先順位:
 *   options.useBriaApi=true または model='bria' → BriaProvider を最優先
 *   それ以外 → WithoutBGProvider → CloudflareAIProvider の順
 */
export async function removeProductImageBackground(
  c: HonoContext,
  originalUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string,
  options?: { model?: string; useBriaApi?: boolean }
): Promise<BgRemovalServiceResult> {
  const { model = 'cloudflare-ai', useBriaApi = false } = options ?? {}
  const r2PublicUrl = getR2PublicUrl(c.env)

  // ── プロバイダーを優先順位順に組み立て ───────────────────────────────────
  const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY
  const useBria = useBriaApi || model === 'bria'

  const providers = useBria
    ? [
        new BriaProvider(briaApiKey),
        new WithoutBGProvider(),
        new CloudflareAIProvider(c.env.AI),
      ]
    : [
        new WithoutBGProvider(),
        new CloudflareAIProvider(c.env.AI),
      ]

  // ── リポジトリを構築 ────────────────────────────────────────────────────
  const repository = new BgRemovalRepository(
    c.env.PRODUCT_IMAGES,
    c.env.DB,
    r2PublicUrl
  )

  // ── オーケストレーターに委譲 ────────────────────────────────────────────
  const orchestrator = new BgRemovalOrchestrator(providers, repository)
  return orchestrator.execute({ imageUrl: originalUrl, companyId, sku, filenamePart })
}

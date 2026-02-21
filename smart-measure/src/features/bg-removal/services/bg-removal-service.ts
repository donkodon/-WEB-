/**
 * bg-removal-service.ts - Composition Root（コンポジッションルート）
 *
 * 責務:
 *   - env から必要な値を取り出し、具体クラスをインスタンス化して注入する
 *   - BgRemovalOrchestrator.execute() を呼ぶだけ
 *
 * ビジネスロジック・API呼び出しはすべて以下に委譲:
 *   - providers/: 各プロバイダークラス
 *   - repositories/: R2/D1操作
 *   - services/bg-removal-orchestrator.ts: フォールバック制御
 *
 * ※ HonoContext (c) には依存しない。呼び出し元 (routes.ts) が必要な値を抽出して渡す。
 */
import type { CloudflareAI } from '../../../types/bindings'
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
 * bg-removal-service が必要とする env フィールドのみを定義した型
 * HonoContext 全体ではなく、最小限の依存にとどめる（テスト・型安全性のため）
 */
export interface BgRemovalEnv {
  BRIA_API_KEY?: string
  FAL_API_KEY?: string
  AI: CloudflareAI
  PRODUCT_IMAGES?: R2Bucket
  DB: D1Database
  R2_PUBLIC_URL?: string
}

/**
 * 背景削除エントリーポイント
 *
 * プロバイダー優先順位:
 *   options.useBriaApi=true または model='bria' → BriaProvider を最優先
 *   それ以外 → WithoutBGProvider → CloudflareAIProvider の順
 *
 * @param env   - HonoContextから呼び出し元が抽出した必要フィールドのみ
 */
export async function removeProductImageBackground(
  env: BgRemovalEnv,
  originalUrl: string,
  companyId: string,
  sku: string,
  filenamePart: string,
  options?: { model?: string; useBriaApi?: boolean }
): Promise<BgRemovalServiceResult> {
  const { model = 'cloudflare-ai', useBriaApi = false } = options ?? {}
  const r2PublicUrl = getR2PublicUrl(env)

  // ── プロバイダーを優先順位順に組み立て ───────────────────────────────────
  const briaApiKey = env.BRIA_API_KEY || env.FAL_API_KEY
  const useBria = useBriaApi || model === 'bria'

  const providers = useBria
    ? [
        new BriaProvider(briaApiKey),
        new WithoutBGProvider(),
        new CloudflareAIProvider(env.AI),
      ]
    : [
        new WithoutBGProvider(),
        new CloudflareAIProvider(env.AI),
      ]

  // ── リポジトリを構築 ────────────────────────────────────────────────────
  const repository = new BgRemovalRepository(
    env.PRODUCT_IMAGES,
    env.DB,
    r2PublicUrl
  )

  // ── オーケストレーターに委譲 ────────────────────────────────────────────
  const orchestrator = new BgRemovalOrchestrator(providers, repository)
  return orchestrator.execute({ imageUrl: originalUrl, companyId, sku, filenamePart })
}

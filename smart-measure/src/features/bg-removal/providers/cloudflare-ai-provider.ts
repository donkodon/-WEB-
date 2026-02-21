/**
 * CloudflareAIProvider - Cloudflare AI @cf/bria/rmbg-1.4 プロバイダー
 *
 * 責務: Cloudflare AI バインディングへの呼び出しのみ
 * 利用可能条件: AI バインディングが存在する場合（最終フォールバック）
 */
import type {
  IBgRemovalProvider,
  BgRemovalInput,
  BgRemovalProviderResponse,
} from '../../../shared/interfaces/bg-removal-provider.interface'
import type { CloudflareAI } from '../../../types/bindings'
import { removeBackgroundWithCloudflareAI } from '../services/cloudflare-ai'

export class CloudflareAIProvider implements IBgRemovalProvider {
  constructor(private readonly ai: CloudflareAI | undefined) {}

  isAvailable(): boolean {
    return !!this.ai
  }

  async removeBackground(input: BgRemovalInput): Promise<BgRemovalProviderResponse> {
    if (!this.ai) {
      return { success: false, error: 'Cloudflare AI binding is not configured', providerName: 'CloudflareAI' }
    }

    const result = await removeBackgroundWithCloudflareAI(this.ai, input.imageUrl)

    if (!result.success || !result.imageBuffer) {
      return { success: false, error: result.error ?? 'Cloudflare AI failed', providerName: 'CloudflareAI' }
    }

    return { success: true, imageBuffer: result.imageBuffer, providerName: 'CloudflareAI' }
  }
}

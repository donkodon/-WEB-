/**
 * BriaProvider - Fal.ai BRIA RMBG API プロバイダー
 *
 * 責務: Fal.ai BRIA API への通信のみ
 * 利用可能条件: BRIA_API_KEY または FAL_API_KEY が有効な場合
 */
import type {
  IBgRemovalProvider,
  BgRemovalInput,
  BgRemovalProviderResponse,
} from '../../../shared/interfaces/bg-removal-provider.interface'
import { callBriaApi, isBriaApiKeyValid } from '../services/bria-api'
import { logger } from '../../../shared/helpers/logger'

export class BriaProvider implements IBgRemovalProvider {
  constructor(private readonly apiKey: string | undefined) {}

  isAvailable(): boolean {
    return isBriaApiKeyValid(this.apiKey)
  }

  async removeBackground(input: BgRemovalInput): Promise<BgRemovalProviderResponse> {
    if (!this.apiKey) {
      return { success: false, error: 'No API key configured', providerName: 'BRIA' }
    }

    // data: URL は BRIA API 非対応（リモートURL必須）
    if (input.imageUrl.startsWith('data:')) {
      logger.debug('📦 BriaProvider: data: URL はスキップ（URL入力専用）')
      return { success: false, error: 'data: URL is not supported', providerName: 'BRIA' }
    }

    const result = await callBriaApi(input.imageUrl, this.apiKey)

    if (!result.success || !result.imageUrl) {
      return { success: false, error: result.error ?? 'BRIA API failed', providerName: 'BRIA' }
    }

    // BRIA が返す画像URLからバイト列を取得
    const response = await fetch(result.imageUrl)
    if (!response.ok) {
      return { success: false, error: `Failed to download BRIA result: ${response.status}`, providerName: 'BRIA' }
    }
    const imageBuffer = await response.arrayBuffer()

    return { success: true, imageBuffer, providerName: 'BRIA' }
  }
}

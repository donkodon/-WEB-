/**
 * WithoutBGProvider - withoutBG Hugging Face Spaces API プロバイダー
 *
 * 責務: withoutBG API への通信のみ
 * 常に利用可能（APIキー不要・無料）
 * マスク画像（maskDataUrl）を返せる唯一のプロバイダー
 */
import type {
  IBgRemovalProvider,
  BgRemovalInput,
  BgRemovalProviderResponse,
} from '../../../shared/interfaces/bg-removal-provider.interface'
import { removeBackgroundWithWithoutBG } from '../services/withoutbg'
import { logger } from '../../../shared/helpers/logger'

export class WithoutBGProvider implements IBgRemovalProvider {
  isAvailable(): boolean {
    // 無料・APIキー不要なので常に利用可能
    return true
  }

  async removeBackground(input: BgRemovalInput): Promise<BgRemovalProviderResponse> {
    // data: URL は withoutBG では非対応（URL入力のみ対応）
    if (input.imageUrl.startsWith('data:')) {
      logger.debug('📦 WithoutBGProvider: data: URL はスキップ（URL入力専用）')
      return { success: false, error: 'data: URL is not supported', providerName: 'withoutBG' }
    }

    const result = await removeBackgroundWithWithoutBG(input.imageUrl)

    if (!result.success || !result.imageDataUrl) {
      return { success: false, error: result.error ?? 'Unknown error', providerName: 'withoutBG' }
    }

    // imageDataUrl（Base64）を ArrayBuffer に変換
    const base64Data = result.imageDataUrl.includes(',')
      ? result.imageDataUrl.split(',')[1]
      : result.imageDataUrl
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return {
      success: true,
      imageBuffer: bytes,
      maskDataUrl: result.maskDataUrl,
      providerName: 'withoutBG',
    }
  }
}

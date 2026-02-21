/**
 * IBgRemovalProvider - 背景削除プロバイダーの抽象インターフェース
 *
 * 設計方針:
 *   - 各プロバイダー（withoutBG / BRIA / Cloudflare AI）はこのインターフェースを実装する
 *   - BgRemovalOrchestrator はインターフェース経由でプロバイダーを呼び出す
 *   - テスト時は MockBgRemovalProvider に差し替えてネットワーク不要でテスト可能
 */

/** プロバイダーが返す統一結果型 */
export interface BgRemovalProviderResult {
  success: true
  imageBuffer: ArrayBuffer | Uint8Array
  maskDataUrl?: string   // マスク画像（Base64 dataURL）— 対応プロバイダーのみ
  providerName: string
}

export interface BgRemovalProviderFailure {
  success: false
  error: string
  providerName: string
}

export type BgRemovalProviderResponse = BgRemovalProviderResult | BgRemovalProviderFailure

/** プロバイダー呼び出し時の入力 */
export interface BgRemovalInput {
  imageUrl: string  // https:// URL または data: URL
}

/**
 * 背景削除プロバイダーインターフェース
 * 各サービス（withoutBG, BRIA, Cloudflare AI）が実装する
 */
export interface IBgRemovalProvider {
  /** このプロバイダーが利用可能かどうか（APIキー設定済み・機能有効チェック）*/
  isAvailable(): boolean

  /** 背景削除を実行し、統一結果を返す */
  removeBackground(input: BgRemovalInput): Promise<BgRemovalProviderResponse>
}

/**
 * MaskService - マスク操作のビジネスロジック
 *
 * 責務:
 *   - ファイル名の解決ロジック（filenamePart → maskBasename）
 *   - base64 → Uint8Array 変換
 *   - R2保存 + DB更新の調整（オーケストレーション）
 *
 * 依存: IMaskRepository（インターフェース経由 → テストで差し替え可能）
 * 非依存: Hono の Context（c）, c.env → ルート層から切り離し済み
 */

import type { R2Bucket } from '@cloudflare/workers-types'
import type { IMaskRepository } from '../../../shared/interfaces/mask-repository.interface'
import { logger } from '../../../shared/helpers/logger'

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface SaveMaskInput {
  sku: string
  companyId: string
  maskDataUrl: string       // "data:image/png;base64,..." 形式
  filenamePart?: string     // クライアントから指定された場合（任意）
}

export interface SaveMaskResult {
  maskUrl: string
  r2Key: string
  maskBasename: string
  uploadSuccess: boolean
  bufferSize: number
}

export interface MaskInfoResult {
  maskImageUrl: string | null
}

export interface RegenerateResult {
  originalUrl: string
  maskUrl: string
}

// ─────────────────────────────────────────────
// MaskService
// ─────────────────────────────────────────────

export class MaskService {
  constructor(private readonly maskRepo: IMaskRepository) {}

  // ── マスク情報取得 ──────────────────────────────────────────────────────────
  async getMaskInfo(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<MaskInfoResult> {
    const record = await this.maskRepo.findMaskUrl(db, sku, companyId)
    return { maskImageUrl: record.maskImageUrl }
  }

  // ── マスク保存 ──────────────────────────────────────────────────────────────
  async saveMask(
    db: D1Database,
    bucket: R2Bucket,
    r2PublicUrl: string,
    input: SaveMaskInput
  ): Promise<SaveMaskResult> {
    const { sku, companyId, maskDataUrl, filenamePart } = input

    // ① ファイル名を解決する（既存マスクがあれば上書き）
    const maskBasename = await this.resolveMaskBasename(
      db,
      sku,
      companyId,
      filenamePart
    )

    const r2Key = `products/${companyId}/${sku}/${maskBasename}.png`
    logger.debug(`🎭 Saving mask: company=${companyId}, sku=${sku}`)
    logger.debug(`📦 R2 key: ${r2Key}`)

    // ② base64 → バイナリ変換
    const buffer = this.decodeBase64(maskDataUrl)
    logger.debug(`📦 Buffer size: ${buffer.length} bytes`)

    // ③ R2 に保存
    logger.info(`🚀 Starting R2 upload: ${r2Key}`)
    const uploadResult = await bucket.put(r2Key, buffer, {
      httpMetadata: { contentType: 'image/png' },
    })
    logger.info(`✅ Mask uploaded to R2: ${r2Key}, etag=${uploadResult?.etag || 'unknown'}`)

    // ④ DB 更新
    const maskUrl = `${r2PublicUrl}/${r2Key}`
    logger.info(`🗄️ Updating DB: sku=${sku}, company=${companyId}, url=${maskUrl}`)
    await this.maskRepo.updateMaskUrl(db, sku, companyId, maskUrl)
    logger.info(`✅ DB updated: mask_image_url_r2=${maskUrl}`)

    return { 
      maskUrl, 
      r2Key, 
      maskBasename, 
      uploadSuccess: true, 
      bufferSize: buffer.length 
    }
  }

  // ── 再生成用データ取得 ──────────────────────────────────────────────────────
  async getRegenerateData(
    db: D1Database,
    sku: string,
    companyId: string
  ): Promise<RegenerateResult | null> {
    const record = await this.maskRepo.findForRegenerate(db, sku, companyId)
    if (!record) return null
    return {
      originalUrl: record.imageUrl,
      maskUrl: record.maskImageUrl,
    }
  }

  // ─────────────────────────────────────────────
  // private: 純粋ロジック（テストしやすい部分）
  // ─────────────────────────────────────────────

  /**
   * マスクのベースファイル名を解決する
   *
   * 優先順位:
   *   1. 既存の mask_image_url_r2 から抽出 → 上書き保存
   *   2. クライアントから filenamePart が来た → {filenamePart}_mask
   *   3. DBの image_urls から最初の画像のベース名 → {basename}_mask
   *   4. フォールバック → {sku}_mask
   */
  async resolveMaskBasename(
    db: D1Database,
    sku: string,
    companyId: string,
    filenamePart?: string
  ): Promise<string> {
    // ① 最優先: 既存のマスクURLから抽出（上書き保存）
    try {
      const { maskImageUrl } = await this.maskRepo.findMaskUrl(db, sku, companyId)
      logger.debug(`🔍 Existing mask URL from DB: ${maskImageUrl || '(null)'}`)
      if (maskImageUrl) {
        const basename = this.extractBasenameFromUrl(maskImageUrl)
        logger.debug(`🔍 Extracted basename: ${basename || '(null)'}`)
        if (basename) {
          logger.info(`🎯 ✅ Overwriting existing mask: ${basename}`)
          return basename
        }
      }
    } catch (e) {
      logger.warn(`⚠️ Failed to get existing mask URL`, e)
    }

    // ② クライアントから filenamePart が来た場合
    if (filenamePart && filenamePart.trim()) {
      const result = `${filenamePart.trim()}_mask`
      logger.debug(`🎯 Using filenamePart from client: ${result}`)
      return result
    }

    // ③ image_urls から最初の画像のベース名を使用
    try {
      const { imageUrls } = await this.maskRepo.findImageUrls(
        db,
        sku,
        companyId
      )
      const firstUrl = imageUrls[0] ?? null

      if (firstUrl) {
        const basename = this.extractBasenameFromUrl(firstUrl)
        const result = basename ? `${basename}_mask` : `${sku}_mask`
        logger.debug(
          `🎯 Using basename from image_urls: ${result} (from ${firstUrl})`
        )
        return result
      }
    } catch (e) {
      logger.warn(`⚠️ Failed to get image_urls, fallback to sku_mask`, e)
    }

    // ④ フォールバック
    const result = `${sku}_mask`
    logger.debug(`🎯 Fallback to sku_mask: ${result}`)
    return result
  }

  /**
   * URLからファイル名のベース部分を抽出する（拡張子なし）
   * 例: https://xxx.r2.dev/company/sku/abc123.jpg → "abc123"
   */
  extractBasenameFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname
      const filename = pathname.split('/').pop() || ''
      const dotIndex = filename.lastIndexOf('.')
      return dotIndex > 0 ? filename.substring(0, dotIndex) : filename || null
    } catch {
      const filename = url.split('/').pop() || ''
      const dotIndex = filename.lastIndexOf('.')
      return dotIndex > 0 ? filename.substring(0, dotIndex) : filename || null
    }
  }

  /**
   * "data:image/png;base64,..." 形式を Uint8Array に変換する
   */
  decodeBase64(dataUrl: string): Uint8Array {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
    const binary = atob(base64Data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}

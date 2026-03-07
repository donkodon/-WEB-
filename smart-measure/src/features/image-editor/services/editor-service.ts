/**
 * EditorService - 画像エディタのビジネスロジック
 *
 * 責務:
 *   - imageId の解析（measurement_ / r2_ の判別）
 *   - エディタ表示に必要なデータの組み立て
 *   - URL組み立て・キャッシュバスター付与
 *
 * 依存: IEditorRepository（インターフェース経由 → テストで差し替え可能）
 * 非依存: Hono の Context（c）, c.env → HTTP層から完全分離
 */

import type { IEditorRepository } from '../../../shared/interfaces/editor-repository.interface'
import { getImageDisplayUrl } from '../helpers/image-status'
import { logger } from '../../../shared/helpers/logger'

// ── 型定義 ───────────────────────────────────────────────────────────────────

export interface EditorData {
  sku: string
  productName: string
  status: 'processed' | 'final' | 'ready' | 'measurement'
  imageSrc: string           // キャンバスに表示する画像（処理済み優先）
  originalSrc: string        // 元画像URL
  isProcessed: boolean
  isMeasurement: boolean
  maskImageUrl: string       // キャッシュバスター付き（空文字 = マスクなし）
  brightness: number         // 明るさ調整値 (-100 ~ 100)
  whiteBalance: number       // ホワイトバランス (2000 ~ 9000)
  hue: number                // 色相 (-180 ~ 180)
}

/** imageId 解析結果 */
export type ParsedImageId =
  | { type: 'measurement'; sku: string }
  | { type: 'r2'; sku: string; filenamePart: string }
  | { type: 'unknown' }

// ── EditorService ────────────────────────────────────────────────────────────

export class EditorService {
  constructor(private readonly editorRepo: IEditorRepository) {}

  // ── imageId のパース ────────────────────────────────────────────────────────
  parseImageId(id: string): ParsedImageId {
    if (id.startsWith('measurement_')) {
      return { type: 'measurement', sku: id.replace('measurement_', '') }
    }
    if (id.startsWith('r2_')) {
      const parts = id.replace('r2_', '').split('_')
      if (parts.length >= 2) {
        return {
          type: 'r2',
          sku: parts[0],
          filenamePart: parts.slice(1).join('_'),
        }
      }
    }
    return { type: 'unknown' }
  }

  // ── company_id の解決（未認証フォールバック） ────────────────────────────────
  async resolveCompanyId(
    db: D1Database,
    sku: string,
    authenticatedCompanyId?: string
  ): Promise<string | null> {
    if (authenticatedCompanyId) return authenticatedCompanyId

    logger.debug(`⚠️ Unauthenticated access – looking up company_id for SKU: ${sku}`)
    const companyId = await this.editorRepo.findCompanyIdBySku(db, sku)

    if (companyId) {
      logger.debug(`✅ Retrieved company_id from DB: ${companyId} for SKU: ${sku}`)
    } else {
      logger.error(`❌ SKU ${sku} not found in database`)
    }
    return companyId
  }

  // ── 採寸画像データ取得 ──────────────────────────────────────────────────────
  async getMeasurementEditorData(
    db: D1Database,
    id: string,
    sku: string,
    companyId: string
  ): Promise<EditorData | null> {
    const record = await this.editorRepo.findMeasurementImage(db, sku, companyId)
    if (!record) return null

    const cacheV = new Date(record.updatedAt).getTime()
    const isProcessed = record.processedImages.includes('measurement')
    const processedUrl = isProcessed
      ? `/api/image-proxy/${sku}/measurement_p.png?v=${cacheV}`
      : null

    const baseImageSrc = processedUrl ?? record.originalUrl
    const imageSrc = this.addCacheBuster(baseImageSrc)
    const originalSrc = this.addCacheBuster(record.originalUrl)
    const maskImageUrl = record.maskImageUrl
      ? `${record.maskImageUrl}?_cb=${Date.now()}`
      : ''

    return {
      sku,
      productName: `商品 ${sku} - 採寸データ`,
      status: isProcessed ? 'processed' : 'measurement',
      imageSrc,
      originalSrc,
      isProcessed,
      isMeasurement: true,
      maskImageUrl,
      brightness: record.brightness,
      whiteBalance: record.whiteBalance,
      hue: record.hue,
    }
  }

  // ── r2_ 画像データ取得 ──────────────────────────────────────────────────────
  async getR2EditorData(
    db: D1Database,
    id: string,
    sku: string,
    filenamePart: string,
    companyId: string
  ): Promise<EditorData | null> {
    const record = await this.editorRepo.findImageStatus(db, sku, companyId)

    const updatedAt = record?.updatedAt ?? new Date().toISOString()
    const processedImages = record?.processedImages ?? []
    const finalImages = record?.finalImages ?? []
    const maskImages = record?.maskImages ?? []

    // マスクURLの解決（filenamePart に一致するエントリを探す）
    const matchedMask = maskImages.find(m => m.filename === filenamePart)
    const rawMaskUrl = matchedMask?.url ?? null

    if (matchedMask) {
      logger.debug(`🎭 Mask found for filenamePart=${filenamePart}: ${rawMaskUrl}`)
    } else {
      logger.debug(`🎭 No mask for filenamePart=${filenamePart}`)
    }

    // 表示URLの組み立て
    const imageStatus = getImageDisplayUrl(
      sku, filenamePart, processedImages, finalImages, companyId, updatedAt
    )

    const cacheVersion = new Date(updatedAt).getTime()
    const status =
      imageStatus.status === 'final' ? 'final' :
      imageStatus.status === 'processed' ? 'processed' : 'ready'

    const originalUrl = `/api/image-proxy/${sku}/${filenamePart}.jpg?v=${cacheVersion}`
    const processedUrl =
      status === 'processed' || status === 'final' ? imageStatus.url : null

    const baseImageSrc = processedUrl ?? originalUrl
    const imageSrc = this.addCacheBuster(baseImageSrc)
    const originalSrc = this.addCacheBuster(originalUrl)
    const maskImageUrl = rawMaskUrl ? `${rawMaskUrl}?_cb=${Date.now()}` : ''

    logger.debug(`📦 EditorData – status:${status}, imageSrc:${imageSrc}`)

    return {
      sku,
      productName: `商品 ${sku}`,
      status,
      imageSrc,
      originalSrc,
      isProcessed: status === 'processed' || status === 'final',
      isMeasurement: false,
      maskImageUrl,
      brightness: record?.brightness ?? 0,
      whiteBalance: record?.whiteBalance ?? 5500,
      hue: record?.hue ?? 0,
    }
  }

  // ── private: ユーティリティ ──────────────────────────────────────────────────

  /** ?v= が未付与の場合のみキャッシュバスターを追加する */
  addCacheBuster(url: string): string {
    return url.includes('?v=') ? url : `${url}?v=${Date.now()}`
  }
}

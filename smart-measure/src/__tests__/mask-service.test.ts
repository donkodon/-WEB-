/**
 * MaskService の単体テスト
 *
 * DIのポイント: D1・R2 を一切使わずに MaskService のロジックをテストできる。
 * MockMaskRepository を差し込むことで、DBなしでビジネスロジックを検証。
 */

import { describe, it, expect, vi } from 'vitest'
import { MaskService } from '../features/mask/services/mask-service'
import type { IMaskRepository } from '../shared/interfaces/mask-repository.interface'

// ─────────────────────────────────────────────
// Mock: IMaskRepository の差し替え実装
// → D1 なしでテスト可能にする
// ─────────────────────────────────────────────
function createMockRepo(overrides?: Partial<IMaskRepository>): IMaskRepository {
  return {
    findMaskUrl: vi.fn().mockResolvedValue({ maskImageUrl: null }),
    findImageUrls: vi.fn().mockResolvedValue({ imageUrls: [] }),
    updateMaskUrl: vi.fn().mockResolvedValue(undefined),
    findForRegenerate: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

// Mock D1Database（型満足のみ、実際には呼ばれない）
const mockDb = {} as D1Database

// ─────────────────────────────────────────────
// extractBasenameFromUrl
// ─────────────────────────────────────────────
describe('MaskService.extractBasenameFromUrl()', () => {
  const service = new MaskService(createMockRepo())

  it('R2 URL からベース名を取得できる', () => {
    const url =
      'https://pub.r2.dev/company1/sku001/4469bcc2-09b1-4218-8ad4-78fd92ced9a7.jpg'
    expect(service.extractBasenameFromUrl(url)).toBe(
      '4469bcc2-09b1-4218-8ad4-78fd92ced9a7'
    )
  })

  it('拡張子なしのパスでもベース名を取得できる', () => {
    expect(service.extractBasenameFromUrl('https://example.com/files/image')).toBe(
      'image'
    )
  })

  it('不正な URL でもクラッシュしない（スラッシュ区切りにフォールバック）', () => {
    const result = service.extractBasenameFromUrl('not-a-valid-url/file.png')
    expect(result).toBe('file')
  })

  it('ファイル名のみの文字列も処理できる', () => {
    expect(service.extractBasenameFromUrl('photo.jpg')).toBe('photo')
  })
})

// ─────────────────────────────────────────────
// decodeBase64
// ─────────────────────────────────────────────
describe('MaskService.decodeBase64()', () => {
  const service = new MaskService(createMockRepo())

  it('data URL プレフィックスを除去してデコードできる', () => {
    // "A" の base64 は "QQ=="
    const dataUrl = 'data:image/png;base64,QQ=='
    const result = service.decodeBase64(dataUrl)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result[0]).toBe(65) // 'A' の ASCII コード
  })

  it('プレフィックスなしの base64 も処理できる', () => {
    // "Hi" の base64 は "SGk="
    const result = service.decodeBase64('SGk=')
    expect(result[0]).toBe(72)  // 'H'
    expect(result[1]).toBe(105) // 'i'
  })
})

// ─────────────────────────────────────────────
// resolveMaskBasename
// ─────────────────────────────────────────────
describe('MaskService.resolveMaskBasename()', () => {
  it('filenamePart が指定されたら {filenamePart}_mask を返す', async () => {
    const service = new MaskService(createMockRepo())
    const result = await service.resolveMaskBasename(
      mockDb,
      'SKU001',
      'company1',
      'abc123'
    )
    expect(result).toBe('abc123_mask')
  })

  it('filenamePart が空文字のとき image_urls のベース名を使う', async () => {
    const mockRepo = createMockRepo({
      findImageUrls: vi.fn().mockResolvedValue({
        imageUrls: ['https://r2.dev/c1/sku/original-file.jpg'],
      }),
    })
    const service = new MaskService(mockRepo)
    const result = await service.resolveMaskBasename(
      mockDb,
      'SKU001',
      'company1',
      ''
    )
    expect(result).toBe('original-file_mask')
  })

  it('image_urls が空のとき {sku}_mask にフォールバックする', async () => {
    const mockRepo = createMockRepo({
      findImageUrls: vi.fn().mockResolvedValue({ imageUrls: [] }),
    })
    const service = new MaskService(mockRepo)
    const result = await service.resolveMaskBasename(
      mockDb,
      'SKU999',
      'company1',
      ''
    )
    expect(result).toBe('SKU999_mask')
  })

  it('filenamePart が undefined のとき image_urls を参照する', async () => {
    const mockRepo = createMockRepo({
      findImageUrls: vi.fn().mockResolvedValue({
        imageUrls: ['https://r2.dev/c1/sku/xyz789.png'],
      }),
    })
    const service = new MaskService(mockRepo)
    const result = await service.resolveMaskBasename(
      mockDb,
      'SKU001',
      'company1',
      undefined
    )
    expect(result).toBe('xyz789_mask')
  })

  it('DB エラーが起きても {sku}_mask にフォールバックしてクラッシュしない', async () => {
    const mockRepo = createMockRepo({
      findImageUrls: vi.fn().mockRejectedValue(new Error('D1 connection error')),
    })
    const service = new MaskService(mockRepo)
    const result = await service.resolveMaskBasename(
      mockDb,
      'SKU001',
      'company1',
      ''
    )
    expect(result).toBe('SKU001_mask')
  })
})

// ─────────────────────────────────────────────
// getMaskInfo
// ─────────────────────────────────────────────
describe('MaskService.getMaskInfo()', () => {
  it('リポジトリから maskImageUrl を取得して返す', async () => {
    const mockRepo = createMockRepo({
      findMaskUrl: vi
        .fn()
        .mockResolvedValue({ maskImageUrl: 'https://r2.dev/mask.png' }),
    })
    const service = new MaskService(mockRepo)
    const result = await service.getMaskInfo(mockDb, 'SKU001', 'company1')
    expect(result.maskImageUrl).toBe('https://r2.dev/mask.png')
  })

  it('マスクが未設定なら null を返す', async () => {
    const service = new MaskService(createMockRepo())
    const result = await service.getMaskInfo(mockDb, 'SKU001', 'company1')
    expect(result.maskImageUrl).toBeNull()
  })
})

// ─────────────────────────────────────────────
// getRegenerateData
// ─────────────────────────────────────────────
describe('MaskService.getRegenerateData()', () => {
  it('元画像とマスクURLを返す', async () => {
    const mockRepo = createMockRepo({
      findForRegenerate: vi.fn().mockResolvedValue({
        imageUrl: 'https://r2.dev/original.jpg',
        maskImageUrl: 'https://r2.dev/mask.png',
      }),
    })
    const service = new MaskService(mockRepo)
    const result = await service.getRegenerateData(mockDb, 'SKU001', 'company1')
    expect(result).toEqual({
      originalUrl: 'https://r2.dev/original.jpg',
      maskUrl: 'https://r2.dev/mask.png',
    })
  })

  it('レコードが存在しない場合 null を返す', async () => {
    const service = new MaskService(createMockRepo())
    const result = await service.getRegenerateData(mockDb, 'SKU999', 'company1')
    expect(result).toBeNull()
  })
})

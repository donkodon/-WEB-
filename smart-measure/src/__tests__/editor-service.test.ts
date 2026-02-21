/**
 * editor-service.test.ts
 *
 * EditorService のユニットテスト。
 * D1 Database を使わず MockEditorRepository で完全オフライン実行。
 */

import { describe, it, expect, vi } from 'vitest'
import { EditorService } from '../features/image-editor/services/editor-service'
import type {
  IEditorRepository,
  MeasurementImageRecord,
  R2ImageRecord,
} from '../shared/interfaces/editor-repository.interface'

// ── Mock Repository ──────────────────────────────────────────────────────────

function makeMockRepo(overrides: Partial<IEditorRepository> = {}): IEditorRepository {
  return {
    findMeasurementImage: vi.fn().mockResolvedValue(null),
    findCompanyIdBySku: vi.fn().mockResolvedValue(null),
    findImageStatus: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

// D1Database モック（実際には渡すだけで使われない）
const mockDb = {} as D1Database

// ── parseImageId ─────────────────────────────────────────────────────────────

describe('EditorService.parseImageId', () => {
  const service = new EditorService(makeMockRepo())

  it('measurement_ プレフィックスを正しくパースできる', () => {
    const result = service.parseImageId('measurement_SKU-001')
    expect(result).toEqual({ type: 'measurement', sku: 'SKU-001' })
  })

  it('r2_ プレフィックスを正しくパースできる', () => {
    const result = service.parseImageId('r2_SKU-001_front')
    expect(result).toEqual({ type: 'r2', sku: 'SKU-001', filenamePart: 'front' })
  })

  it('r2_ でアンダースコアが複数あっても最初のセグメントをSKUとして扱う', () => {
    const result = service.parseImageId('r2_SKU-001_front_v2')
    expect(result).toEqual({ type: 'r2', sku: 'SKU-001', filenamePart: 'front_v2' })
  })

  it('r2_ でセグメントが1つしかない場合は unknown を返す', () => {
    const result = service.parseImageId('r2_SKUONLY')
    expect(result).toEqual({ type: 'unknown' })
  })

  it('未知のプレフィックスは unknown を返す', () => {
    const result = service.parseImageId('unknown_abc')
    expect(result).toEqual({ type: 'unknown' })
  })

  it('空文字は unknown を返す', () => {
    const result = service.parseImageId('')
    expect(result).toEqual({ type: 'unknown' })
  })
})

// ── resolveCompanyId ──────────────────────────────────────────────────────────

describe('EditorService.resolveCompanyId', () => {
  it('認証済みcompanyIdがあればそのまま返す', async () => {
    const service = new EditorService(makeMockRepo())
    const result = await service.resolveCompanyId(mockDb, 'SKU-001', 'company-123')
    expect(result).toBe('company-123')
  })

  it('未認証の場合はDBからcompanyIdを取得する', async () => {
    const repo = makeMockRepo({
      findCompanyIdBySku: vi.fn().mockResolvedValue('company-from-db'),
    })
    const service = new EditorService(repo)
    const result = await service.resolveCompanyId(mockDb, 'SKU-001', undefined)
    expect(result).toBe('company-from-db')
    expect(repo.findCompanyIdBySku).toHaveBeenCalledWith(mockDb, 'SKU-001')
  })

  it('DBにも見つからない場合は null を返す', async () => {
    const service = new EditorService(makeMockRepo())
    const result = await service.resolveCompanyId(mockDb, 'NOT-EXIST', undefined)
    expect(result).toBeNull()
  })
})

// ── getMeasurementEditorData ─────────────────────────────────────────────────

describe('EditorService.getMeasurementEditorData', () => {
  const baseRecord: MeasurementImageRecord = {
    originalUrl: 'https://example.com/original.jpg',
    processedImages: [],
    maskImageUrl: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('DBレコードがない場合は null を返す', async () => {
    const service = new EditorService(makeMockRepo())
    const result = await service.getMeasurementEditorData(mockDb, 'measurement_SKU-001', 'SKU-001', 'company-123')
    expect(result).toBeNull()
  })

  it('未処理画像の場合は status=measurement を返す', async () => {
    const repo = makeMockRepo({
      findMeasurementImage: vi.fn().mockResolvedValue({ ...baseRecord }),
    })
    const service = new EditorService(repo)
    const result = await service.getMeasurementEditorData(mockDb, 'measurement_SKU-001', 'SKU-001', 'company-123')
    expect(result).not.toBeNull()
    expect(result!.status).toBe('measurement')
    expect(result!.isProcessed).toBe(false)
    expect(result!.isMeasurement).toBe(true)
  })

  it('processedImages に "measurement" が含まれる場合は status=processed を返す', async () => {
    const repo = makeMockRepo({
      findMeasurementImage: vi.fn().mockResolvedValue({
        ...baseRecord,
        processedImages: ['measurement'],
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getMeasurementEditorData(mockDb, 'measurement_SKU-001', 'SKU-001', 'company-123')
    expect(result!.status).toBe('processed')
    expect(result!.isProcessed).toBe(true)
    expect(result!.imageSrc).toContain('measurement_p.png')
  })

  it('maskImageUrl がある場合はキャッシュバスターが付く', async () => {
    const repo = makeMockRepo({
      findMeasurementImage: vi.fn().mockResolvedValue({
        ...baseRecord,
        maskImageUrl: 'https://example.com/mask.png',
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getMeasurementEditorData(mockDb, 'measurement_SKU-001', 'SKU-001', 'company-123')
    expect(result!.maskImageUrl).toMatch(/^https:\/\/example\.com\/mask\.png\?_cb=\d+$/)
  })

  it('maskImageUrl が null の場合は空文字を返す', async () => {
    const repo = makeMockRepo({
      findMeasurementImage: vi.fn().mockResolvedValue({ ...baseRecord }),
    })
    const service = new EditorService(repo)
    const result = await service.getMeasurementEditorData(mockDb, 'measurement_SKU-001', 'SKU-001', 'company-123')
    expect(result!.maskImageUrl).toBe('')
  })
})

// ── getR2EditorData ───────────────────────────────────────────────────────────

describe('EditorService.getR2EditorData', () => {
  const baseRecord: R2ImageRecord = {
    updatedAt: '2026-01-01T00:00:00.000Z',
    processedImages: [],
    finalImages: [],
    maskImages: [],
  }

  it('DBレコードがなくてもデフォルト値で EditorData を返す', async () => {
    const service = new EditorService(makeMockRepo())
    const result = await service.getR2EditorData(mockDb, 'r2_SKU-001_front', 'SKU-001', 'front', 'company-123')
    expect(result).not.toBeNull()
    expect(result!.sku).toBe('SKU-001')
    expect(result!.status).toBe('ready')
    expect(result!.isMeasurement).toBe(false)
  })

  it('processedImages に filenamePart がある場合は status=processed', async () => {
    const repo = makeMockRepo({
      findImageStatus: vi.fn().mockResolvedValue({
        ...baseRecord,
        processedImages: ['front'],
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getR2EditorData(mockDb, 'r2_SKU-001_front', 'SKU-001', 'front', 'company-123')
    expect(result!.status).toBe('processed')
    expect(result!.isProcessed).toBe(true)
  })

  it('finalImages に filenamePart がある場合は status=final', async () => {
    const repo = makeMockRepo({
      findImageStatus: vi.fn().mockResolvedValue({
        ...baseRecord,
        processedImages: ['front'],
        finalImages: ['front'],
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getR2EditorData(mockDb, 'r2_SKU-001_front', 'SKU-001', 'front', 'company-123')
    expect(result!.status).toBe('final')
    expect(result!.isProcessed).toBe(true)
  })

  it('maskImages にマッチするエントリがある場合はキャッシュバスター付きで返す', async () => {
    const repo = makeMockRepo({
      findImageStatus: vi.fn().mockResolvedValue({
        ...baseRecord,
        maskImages: [{ filename: 'front', url: 'https://example.com/front_mask.png' }],
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getR2EditorData(mockDb, 'r2_SKU-001_front', 'SKU-001', 'front', 'company-123')
    expect(result!.maskImageUrl).toMatch(/^https:\/\/example\.com\/front_mask\.png\?_cb=\d+$/)
  })

  it('maskImages にマッチしない場合は空文字を返す', async () => {
    const repo = makeMockRepo({
      findImageStatus: vi.fn().mockResolvedValue({
        ...baseRecord,
        maskImages: [{ filename: 'back', url: 'https://example.com/back_mask.png' }],
      }),
    })
    const service = new EditorService(repo)
    const result = await service.getR2EditorData(mockDb, 'r2_SKU-001_front', 'SKU-001', 'front', 'company-123')
    expect(result!.maskImageUrl).toBe('')
  })
})

// ── addCacheBuster ────────────────────────────────────────────────────────────

describe('EditorService.addCacheBuster', () => {
  const service = new EditorService(makeMockRepo())

  it('?v= がない場合はキャッシュバスターを付与する', () => {
    const result = service.addCacheBuster('https://example.com/image.jpg')
    expect(result).toMatch(/^https:\/\/example\.com\/image\.jpg\?v=\d+$/)
  })

  it('?v= がすでにある場合は変更しない', () => {
    const url = 'https://example.com/image.jpg?v=1234567890'
    const result = service.addCacheBuster(url)
    expect(result).toBe(url)
  })
})

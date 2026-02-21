/**
 * bg-removal-orchestrator.test.ts
 *
 * BgRemovalOrchestrator のユニットテスト。
 * すべてのプロバイダー・リポジトリをモック化し、
 * ネットワーク・R2・D1 を使わずに完全オフラインで実行。
 */

import { describe, it, expect, vi } from 'vitest'
import { BgRemovalOrchestrator } from '../features/bg-removal/services/bg-removal-orchestrator'
import type { IBgRemovalProvider, BgRemovalProviderResponse } from '../shared/interfaces/bg-removal-provider.interface'
import type { IBgRemovalRepository } from '../shared/interfaces/bg-removal-repository.interface'

// ── モックファクトリー ───────────────────────────────────────────────────────

const makeProvider = (
  available: boolean,
  response: BgRemovalProviderResponse
): IBgRemovalProvider => ({
  isAvailable: vi.fn().mockReturnValue(available),
  removeBackground: vi.fn().mockResolvedValue(response),
})

const makeRepo = (overrides: Partial<IBgRemovalRepository> = {}): IBgRemovalRepository => ({
  uploadProcessedAndUpdateDb: vi.fn().mockResolvedValue({
    r2Key: 'company/SKU-001/front_p.png',
    publicUrl: 'https://r2.example.com/company/SKU-001/front_p.png',
  }),
  saveMaskAndUpdateDb: vi.fn().mockResolvedValue(
    'https://r2.example.com/company/SKU-001/front_mask.png'
  ),
  ...overrides,
})

const defaultParams = {
  imageUrl: 'https://example.com/product.jpg',
  companyId: 'company-123',
  sku: 'SKU-001',
  filenamePart: 'front',
}

// ── プロバイダー選択ロジック ──────────────────────────────────────────────────

describe('BgRemovalOrchestrator.execute - プロバイダー選択', () => {
  it('最初の利用可能なプロバイダーで成功したら結果を返す', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const provider = makeProvider(true, {
      success: true, imageBuffer: mockBytes, providerName: 'TestProvider',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([provider], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.processedUrl).toBe('https://r2.example.com/company/SKU-001/front_p.png')
      expect(result.message).toContain('TestProvider')
    }
  })

  it('最初のプロバイダーが失敗したら次のプロバイダーにフォールバックする', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const failingProvider = makeProvider(true, {
      success: false, error: 'API timeout', providerName: 'FailProvider',
    })
    const successProvider = makeProvider(true, {
      success: true, imageBuffer: mockBytes, providerName: 'FallbackProvider',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([failingProvider, successProvider], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.message).toContain('FallbackProvider')
    }
    expect(failingProvider.removeBackground).toHaveBeenCalledTimes(1)
    expect(successProvider.removeBackground).toHaveBeenCalledTimes(1)
  })

  it('isAvailable=false のプロバイダーはスキップする', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const unavailableProvider = makeProvider(false, {
      success: true, imageBuffer: mockBytes, providerName: 'Skipped',
    })
    const availableProvider = makeProvider(true, {
      success: true, imageBuffer: mockBytes, providerName: 'Active',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([unavailableProvider, availableProvider], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(result.success).toBe(true)
    expect(unavailableProvider.removeBackground).not.toHaveBeenCalled()
    expect(availableProvider.removeBackground).toHaveBeenCalledTimes(1)
  })

  it('全プロバイダーが失敗したら success:false を返す', async () => {
    const failProvider1 = makeProvider(true, {
      success: false, error: 'Error 1', providerName: 'P1',
    })
    const failProvider2 = makeProvider(true, {
      success: false, error: 'Error 2', providerName: 'P2',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([failProvider1, failProvider2], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('all services unavailable')
    }
  })

  it('プロバイダーリストが空の場合は success:false を返す', async () => {
    const orchestrator = new BgRemovalOrchestrator([], makeRepo())
    const result = await orchestrator.execute(defaultParams)

    expect(result.success).toBe(false)
  })
})

// ── リポジトリ呼び出し ────────────────────────────────────────────────────────

describe('BgRemovalOrchestrator.execute - リポジトリ呼び出し', () => {
  it('uploadProcessedAndUpdateDb に正しいパラメーターで呼び出す', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const provider = makeProvider(true, {
      success: true, imageBuffer: mockBytes, providerName: 'P',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([provider], repo)

    await orchestrator.execute(defaultParams)

    expect(repo.uploadProcessedAndUpdateDb).toHaveBeenCalledWith({
      companyId: 'company-123',
      sku: 'SKU-001',
      filenamePart: 'front',
      imageBuffer: mockBytes,
    })
  })

  it('maskDataUrl がある場合は saveMaskAndUpdateDb を呼び出す', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const provider = makeProvider(true, {
      success: true,
      imageBuffer: mockBytes,
      // Base64でのmaskDataUrl（"data:image/png;base64,AAEC" = bytes [0,1,2]）
      maskDataUrl: 'data:image/png;base64,AAEC',
      providerName: 'P',
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([provider], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(repo.saveMaskAndUpdateDb).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.maskUrl).toBe('https://r2.example.com/company/SKU-001/front_mask.png')
    }
  })

  it('maskDataUrl がない場合は saveMaskAndUpdateDb を呼び出さない', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const provider = makeProvider(true, {
      success: true, imageBuffer: mockBytes, providerName: 'P',
      // maskDataUrl なし
    })
    const repo = makeRepo()
    const orchestrator = new BgRemovalOrchestrator([provider], repo)

    const result = await orchestrator.execute(defaultParams)

    expect(repo.saveMaskAndUpdateDb).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.maskUrl).toBeNull()
    }
  })

  it('マスク保存が失敗しても処理済み画像の結果は返す', async () => {
    const mockBytes = new Uint8Array([1, 2, 3])
    const provider = makeProvider(true, {
      success: true,
      imageBuffer: mockBytes,
      maskDataUrl: 'data:image/png;base64,AAEC',
      providerName: 'P',
    })
    const repo = makeRepo({
      saveMaskAndUpdateDb: vi.fn().mockRejectedValue(new Error('R2 write failed')),
    })
    const orchestrator = new BgRemovalOrchestrator([provider], repo)

    const result = await orchestrator.execute(defaultParams)

    // マスク保存失敗でも処理済み画像は返る
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.processedUrl).toBe('https://r2.example.com/company/SKU-001/front_p.png')
      expect(result.maskUrl).toBeNull()
    }
  })
})

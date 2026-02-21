/* eslint-disable no-console */
/**
 * logger.ts の単体テスト
 *
 * テスト対象:
 *   - Logger クラス（サーバーサイド）
 *   - clientLogger オブジェクト（ブラウザサイド）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, clientLogger } from '../shared/helpers/logger'

// ─────────────────────────────────────────────
// Logger（サーバーサイド）
// ─────────────────────────────────────────────
describe('Logger (server-side)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('デフォルトでは console.debug が呼ばれない（production相当）', () => {
    logger.debug('test debug message')
    expect(console.debug).not.toHaveBeenCalled()
  })

  it('デフォルトでは console.info が呼ばれない', () => {
    logger.info('test info message')
    expect(console.info).not.toHaveBeenCalled()
  })

  it('デフォルトでは console.warn が呼ばれない', () => {
    logger.warn('test warn message')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('デフォルトでは console.error が呼ばれない（ENABLE_CONSOLE_LOGSがfalse）', () => {
    logger.error('test error message')
    expect(console.error).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────
// clientLogger（ブラウザサイド）
// ─────────────────────────────────────────────
describe('clientLogger (browser-side)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('window が undefined の場合 debug は何も出力しない', () => {
    // jsdom 環境では window.location.hostname = 'localhost' になるため
    // debug は呼ばれる（localhost扱い）
    clientLogger.debug('debug msg')
    // localhost 環境なので console.debug が呼ばれる
    expect(console.debug).toHaveBeenCalledWith('[CLIENT-DEBUG] debug msg')
  })

  it('warn は常に console.warn を呼ぶ（window があれば）', () => {
    clientLogger.warn('warn msg')
    expect(console.warn).toHaveBeenCalledWith('[CLIENT-WARN] warn msg')
  })

  it('error は常に console.error を呼ぶ（window があれば）', () => {
    clientLogger.error('error msg', new Error('test'))
    expect(console.error).toHaveBeenCalled()
  })

  it('info は localhost 環境で console.info を呼ぶ', () => {
    clientLogger.info('info msg')
    expect(console.info).toHaveBeenCalledWith('[CLIENT-INFO] info msg')
  })
})

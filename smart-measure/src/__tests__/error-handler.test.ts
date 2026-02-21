/**
 * error-handler.ts の単体テスト
 *
 * テスト対象:
 *   - createSafeErrorResponse()
 *   - sanitizeErrorMessage()
 *   - logError()
 *   - ErrorCode enum
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createSafeErrorResponse,
  sanitizeErrorMessage,
  logError,
  ErrorCode,
} from '../shared/helpers/error-handler'

// ─────────────────────────────────────────────
// createSafeErrorResponse
// ─────────────────────────────────────────────
describe('createSafeErrorResponse()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('success が常に false であること', () => {
    const res = createSafeErrorResponse(new Error('test'))
    expect(res.success).toBe(false)
  })

  it('デフォルトエラーコードは INTERNAL_ERROR', () => {
    const res = createSafeErrorResponse(new Error('test'))
    expect(res.errorCode).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('指定したエラーコードが返ること', () => {
    const res = createSafeErrorResponse(new Error('test'), ErrorCode.NOT_FOUND)
    expect(res.errorCode).toBe(ErrorCode.NOT_FOUND)
  })

  it('本番環境では汎用メッセージが返ること（スタックトレース等を含まない）', () => {
    const res = createSafeErrorResponse(
      new Error('SELECT * FROM users WHERE id=1'),
      ErrorCode.DB_ERROR
    )
    // DBクエリが漏れていないこと
    expect(res.error).not.toContain('SELECT')
    expect(res.error).not.toContain('FROM users')
  })

  it('カスタムメッセージを渡すと本番でも反映される', () => {
    const res = createSafeErrorResponse(
      new Error('original'),
      ErrorCode.VALIDATION_ERROR,
      'メールアドレスが不正です'
    )
    expect(res.error).toBe('メールアドレスが不正です')
  })

  it('Error 以外のオブジェクトも処理できる', () => {
    const res = createSafeErrorResponse('文字列エラー')
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('呼ばれると console.error でサーバーログを出力する', () => {
    createSafeErrorResponse(new Error('log test'))
    expect(console.error).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────
// sanitizeErrorMessage
// ─────────────────────────────────────────────
describe('sanitizeErrorMessage()', () => {
  it('ファイルパス（.ts）を [file] に置換する', () => {
    const result = sanitizeErrorMessage('Error in /home/user/src/index.ts')
    expect(result).toContain('[file]')
    expect(result).not.toContain('/home/user/src/index.ts')
  })

  it('スタックトレース行を除去する', () => {
    const result = sanitizeErrorMessage(
      'Error at myFunction (/src/index.ts:10:5)'
    )
    expect(result).not.toContain('at myFunction')
  })

  it('余分な空白を正規化する', () => {
    const result = sanitizeErrorMessage('  too   many   spaces  ')
    expect(result).toBe('too many spaces')
  })

  it('センシティブ情報のないメッセージはそのまま返す', () => {
    const msg = 'Invalid email address'
    const result = sanitizeErrorMessage(msg)
    expect(result).toBe(msg)
  })
})

// ─────────────────────────────────────────────
// logError
// ─────────────────────────────────────────────
describe('logError()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('console.error が呼ばれること', () => {
    logError('TestContext', new Error('test error'))
    expect(console.error).toHaveBeenCalled()
  })

  it('コンテキスト名がログに含まれること', () => {
    logError('MaskSave', new Error('mask error'))
    const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('MaskSave')
  })

  it('追加情報が渡せること', () => {
    expect(() =>
      logError('Upload', new Error('err'), { userId: 'u123', fileSize: 1024 })
    ).not.toThrow()
  })
})

// ─────────────────────────────────────────────
// ErrorCode enum
// ─────────────────────────────────────────────
describe('ErrorCode enum', () => {
  it('必要なエラーコードが定義されていること', () => {
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND')
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
    expect(ErrorCode.DB_ERROR).toBe('DB_ERROR')
    expect(ErrorCode.UPLOAD_FAILED).toBe('UPLOAD_FAILED')
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    expect(ErrorCode.MISSING_PARAMETER).toBe('MISSING_PARAMETER')
  })
})

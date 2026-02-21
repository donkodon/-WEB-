/**
 * マスク合成ロジックの単体テスト
 *
 * saveMask() の中核となる「マスク輝度 → alpha変換」ロジックを
 * 純粋関数として検証する。
 *
 * 仕様:
 *   - マスクピクセルの平均輝度（R+G+B / 3）を alpha値として使用
 *   - 白（255,255,255）→ alpha=255（不透明・元画像が見える）
 *   - 黒（0,0,0）      → alpha=0  （透明・背景が見える）
 *   - グレー（128,128,128）→ alpha=128（半透明）
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────
// テスト対象: マスク輝度 → alpha変換
// saveMask() Step2 の核心ロジックを純粋関数で再現
// ─────────────────────────────────────────────

/**
 * マスクピクセルの輝度（平均RGB）を計算する
 */
function getMaskLuminance(r: number, g: number, b: number): number {
  return Math.round((r + g + b) / 3)
}

/**
 * 1ピクセル分のマスク合成を行う
 * originalRGB: 元画像のRGB値
 * maskRGB: マスクのRGB値
 * returns: 合成後のRGBA
 */
function compositePixel(
  originalR: number,
  originalG: number,
  originalB: number,
  maskR: number,
  maskG: number,
  maskB: number
): { r: number; g: number; b: number; a: number } {
  const alpha = getMaskLuminance(maskR, maskG, maskB)
  return { r: originalR, g: originalG, b: originalB, a: alpha }
}

/**
 * ImageDataを模擬してマスク合成を行う（saveMask Step2の主処理）
 * imgData: 元画像のピクセル配列（RGBA × n）
 * maskData: マスクのピクセル配列（RGBA × n）
 * returns: 合成後のアルファ配列
 */
function applyMaskToImageData(
  imgData: Uint8ClampedArray,
  maskData: Uint8ClampedArray
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(imgData.length)
  for (let i = 0; i < imgData.length; i += 4) {
    result[i] = imgData[i]       // R
    result[i + 1] = imgData[i + 1] // G
    result[i + 2] = imgData[i + 2] // B
    // マスク輝度をalphaに変換
    const avg = Math.round(
      (maskData[i] + maskData[i + 1] + maskData[i + 2]) / 3
    )
    result[i + 3] = avg
  }
  return result
}

// ─────────────────────────────────────────────
// テストケース
// ─────────────────────────────────────────────

describe('getMaskLuminance()', () => {
  it('白（255,255,255）→ 輝度 255', () => {
    expect(getMaskLuminance(255, 255, 255)).toBe(255)
  })

  it('黒（0,0,0）→ 輝度 0', () => {
    expect(getMaskLuminance(0, 0, 0)).toBe(0)
  })

  it('グレー（128,128,128）→ 輝度 128', () => {
    expect(getMaskLuminance(128, 128, 128)).toBe(128)
  })

  it('不均一なRGB → 平均値が返る', () => {
    // (120 + 60 + 180) / 3 = 120
    expect(getMaskLuminance(120, 60, 180)).toBe(120)
  })
})

describe('compositePixel()', () => {
  it('マスク白 → 元画像がそのままの色でalpha=255', () => {
    // 木目色 + 白マスク → 木目が見える
    const result = compositePixel(197, 189, 170, 255, 255, 255)
    expect(result).toEqual({ r: 197, g: 189, b: 170, a: 255 })
  })

  it('マスク黒 → 透明（alpha=0）', () => {
    // 木目色 + 黒マスク → 透明
    const result = compositePixel(197, 189, 170, 0, 0, 0)
    expect(result).toEqual({ r: 197, g: 189, b: 170, a: 0 })
  })

  it('マスク黒 + 服の青 → 透明（服が消える）', () => {
    // 服（青系）+ 黒マスク → 透明
    const result = compositePixel(40, 80, 160, 0, 0, 0)
    expect(result.a).toBe(0)
  })

  it('マスク白 + 服の青 → 服が不透明で表示', () => {
    const result = compositePixel(40, 80, 160, 255, 255, 255)
    expect(result).toEqual({ r: 40, g: 80, b: 160, a: 255 })
  })

  it('グレーマスク → 半透明', () => {
    const result = compositePixel(100, 100, 100, 128, 128, 128)
    expect(result.a).toBe(128)
  })
})

describe('applyMaskToImageData() - saveMask Step2 主処理', () => {
  it('1ピクセル: 白マスク → alpha=255', () => {
    // 元画像: 木目色 RGBA(197, 189, 170, 255)
    const imgData = new Uint8ClampedArray([197, 189, 170, 255])
    // マスク: 白 RGB(255, 255, 255, 255)
    const maskData = new Uint8ClampedArray([255, 255, 255, 255])
    const result = applyMaskToImageData(imgData, maskData)
    expect(result[3]).toBe(255) // alpha = 255
    expect(result[0]).toBe(197) // R 保持
  })

  it('1ピクセル: 黒マスク → alpha=0（透明）', () => {
    const imgData = new Uint8ClampedArray([197, 189, 170, 255])
    const maskData = new Uint8ClampedArray([0, 0, 0, 255])
    const result = applyMaskToImageData(imgData, maskData)
    expect(result[3]).toBe(0) // alpha = 0 → 透明
  })

  it('2ピクセル: ブラシ部分だけ不透明になる', () => {
    // ピクセル0: 木目（ブラシで塗った）  ピクセル1: 服（消しゴム）
    const imgData = new Uint8ClampedArray([
      197, 189, 170, 255,  // px0: 木目
       40,  80, 160, 255,  // px1: 服（青系）
    ])
    const maskData = new Uint8ClampedArray([
      255, 255, 255, 255,  // px0: 白（ブラシ）
        0,   0,   0, 255,  // px1: 黒（消しゴム/初期）
    ])
    const result = applyMaskToImageData(imgData, maskData)
    expect(result[3]).toBe(255)  // px0のalpha: 不透明
    expect(result[7]).toBe(0)    // px1のalpha: 透明
  })

  it('RGB値は元画像から変わらない', () => {
    const imgData = new Uint8ClampedArray([100, 150, 200, 255])
    const maskData = new Uint8ClampedArray([255, 255, 255, 255])
    const result = applyMaskToImageData(imgData, maskData)
    expect(result[0]).toBe(100)
    expect(result[1]).toBe(150)
    expect(result[2]).toBe(200)
  })

  it('空のImageDataでもエラーが出ない', () => {
    const imgData = new Uint8ClampedArray([])
    const maskData = new Uint8ClampedArray([])
    expect(() => applyMaskToImageData(imgData, maskData)).not.toThrow()
  })
})

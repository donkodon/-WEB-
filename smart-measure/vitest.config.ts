import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom でブラウザ環境をシミュレート（Canvas API等のテスト用）
    environment: 'jsdom',
    // テストファイルのパターン
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts'],
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/types/**',
        'src/renderer.tsx',
      ],
    },
    // グローバルAPIをimportなしで使えるように
    globals: true,
  },
})

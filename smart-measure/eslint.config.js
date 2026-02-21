import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  // ── 対象ファイル ──────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // ── TypeScript 基本ルール ────────────────────────────────
      // any型の使用を警告（徐々に型付けを強化するため warn にとどめる）
      '@typescript-eslint/no-explicit-any': 'warn',

      // 未使用変数はエラー（_ プレフィックスは除外）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ── 単一責任・コード品質 ──────────────────────────────────
      // console.log 直書き禁止（window.logger を使う）
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 関数の最大行数（長すぎる関数を検出）
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],

      // ── 一般的なバグ防止 ────────────────────────────────────
      'no-var': 'error',          // var禁止（let/const を使う）
      'prefer-const': 'error',    // 再代入しない変数は const
      'eqeqeq': 'error',         // == ではなく === を使う
      'no-throw-literal': 'error',// throw は Error オブジェクトを使う
    },
  },

  // ── 無視するファイル ──────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',        // フロントエンドJSは別途対応
      '*.config.js',
      '*.config.ts',
    ],
  },
]

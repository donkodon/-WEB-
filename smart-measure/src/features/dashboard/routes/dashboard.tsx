import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { FIXED_COMPANY_ID } from '../../auth/helpers/auth'
import { logger } from '../../../shared/helpers/logger'

const dashboard = new Hono<AppEnv>()

// Cache buster version for static JS files - bump this when JS files change
const JS_VERSION = '20250304-06'

  // eslint-disable-next-line max-lines-per-function
dashboard.get('/dashboard', async (c) => {
  try {
    // ✅ Phase 1: Get company_id from cookie
    const cookies = c.req.header('Cookie') || '';
    const companyIdMatch = cookies.match(/company_id=([^;]+)/);
    const companyId = companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
    
    logger.debug(`📊 Dashboard access: company_id=${companyId}`);
    
    // Check if D1 database is available
    if (!c.env.DB) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>設定が必要です</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 p-8">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
            <h1 class="text-2xl font-bold text-red-600 mb-4">⚠️ データベース設定が必要です</h1>
            <p class="text-gray-700 mb-4">
              Cloudflare Pages の D1 データベースバインディングが設定されていません。
            </p>
            <div class="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <h2 class="font-bold text-yellow-800 mb-2">設定手順：</h2>
              <ol class="list-decimal list-inside text-yellow-800 space-y-2">
                <li>Cloudflare ダッシュボード → Workers & Pages を開く</li>
                <li>smart-measure プロジェクトを選択</li>
                <li>Settings → Functions → D1 database bindings を開く</li>
                <li>Add binding をクリック</li>
                <li>Variable name: <code class="bg-yellow-100 px-1">DB</code></li>
                <li>D1 database: <code class="bg-yellow-100 px-1">measure-master-db</code> を選択</li>
                <li>Save をクリック</li>
                <li>自動再デプロイを待つ（数分）</li>
              </ol>
            </div>
            <p class="text-sm text-gray-500">
              Database ID: 7fad5dc0-abce-4816-b667-193490cf9650
            </p>
          </div>
        </body>
        </html>
      `)
    }
    
    // ========================================
    // ✅ Performance Optimization: SSR renders only shell/skeleton
    // All product data is loaded via CSR (Client-Side Rendering) with JSON API
    // This reduces initial HTML size from ~100KB+ to ~5KB
    // ========================================

  return c.render(
    <Layout active="dashboard" title="商品画像一覧（SKU別）">
      
      <div class="mb-6 flex justify-between items-end">
        <p class="text-gray-500 text-sm">撮影済み画像の管理・編集・ダウンロードが可能です。</p>
        <div class="flex space-x-3">
            <button id="btn-auto-measure" class="px-4 py-2 text-sm font-medium text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 focus:z-10 focus:ring-2 focus:ring-purple-500 focus:text-purple-700 flex items-center shadow-sm">
                <i class="fas fa-ruler-combined mr-2"></i>
                選択画像を自動採寸
            </button>
            <button id="btn-batch-remove-bg" class="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 focus:z-10 focus:ring-2 focus:ring-blue-500 focus:text-blue-700 flex items-center shadow-sm">
                <i class="fas fa-magic mr-2"></i>
                選択画像を白抜き
            </button>
            <button id="btn-export-csv" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                <i class="fas fa-download mr-2"></i>
                CSV出力
            </button>
            <button id="btn-download-images" class="bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-lg flex items-center hover:bg-blue-50 transition-colors text-sm font-medium">
                <i class="fas fa-images mr-2"></i>
                元画像DL
            </button>
            <button id="btn-download-processed" class="bg-white border border-green-200 text-green-600 px-4 py-2 rounded-lg flex items-center hover:bg-green-50 transition-colors text-sm font-medium">
                <i class="fas fa-magic mr-2"></i>
                商品データDL
            </button>

        </div>
      </div>
      
      {/* Resize Helper - must load FIRST before any bg-removal scripts */}
      <script src={`/static/shared/resize-helper.js?v=${JS_VERSION}`}></script>

      {/* Dashboard Core Scripts (SKU Checkboxes, CSV Export, Image Download) */}
      <script src={`/static/dashboard/dashboard.js?v=${JS_VERSION}`}></script>
      
      {/* Pagination Script (loads products via API on DOMContentLoaded) */}
      <script src={`/static/dashboard/pagination.js?v=${JS_VERSION}`}></script>
      
      {/* Background Removal Scripts */}
      <script src={`/static/dashboard/bg-removal.js?v=${JS_VERSION}`}></script>

      {/* Square Crop Helper */}
      <script src={`/static/dashboard/crop-helper.js?v=${JS_VERSION}`}></script>
      
      {/* Auto-Measurement Scripts */}
      <script src={`/static/dashboard/auto-measure.js?v=${JS_VERSION}`}></script>
      
      {/* Mobile App Sync Scripts */}
      <script src={`/static/dashboard/mobile-sync.js?v=${JS_VERSION}`}></script>

      {/* Filter Bar */}
      <div class="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex space-x-4 flex-1">
          <div class="relative flex-1 max-w-md">
            <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
            <input type="text" placeholder="SKUコードまたは商品名で検索..." class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div class="relative w-72 flex items-center">
            <div class="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden w-full focus-within:ring-2 focus-within:ring-blue-500">
                <div class="px-3 py-2.5 text-gray-400 bg-gray-50 border-r border-gray-200">
                    <i class="fas fa-calendar"></i>
                </div>
                <input type="text" class="date-picker w-full p-2 text-sm text-center focus:outline-none" placeholder="開始日" />
                <span class="text-gray-400 px-1">~</span>
                <input type="text" class="date-picker w-full p-2 text-sm text-center focus:outline-none" placeholder="終了日" />
            </div>
          </div>
        </div>
        <script src={`/static/dashboard/filter-init.js?v=${JS_VERSION}`}></script>
        <div class="flex items-center space-x-2">
            <span class="text-gray-500 text-sm">表示切替:</span>
            <button class="p-2 bg-gray-100 rounded text-gray-700"><i class="fas fa-th-large"></i></button>
            <button class="p-2 text-gray-400 hover:bg-gray-50 rounded"><i class="fas fa-list"></i></button>
        </div>
      </div>

      {/* Product List Container - Initially shows skeleton loading */}
      <div id="products-container" class="space-y-6">
        {/* Skeleton Loading UI - replaced by real data via CSR */}
        {[1,2,3].map(() => (
          <div class="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
            <div class="mb-4">
              <div class="flex items-start">
                <div class="w-4 h-4 bg-gray-200 rounded mr-3 mt-1"></div>
                <div class="flex-1">
                  <div class="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                  <div class="h-4 bg-gray-100 rounded w-64 mb-2"></div>
                  <div class="h-3 bg-gray-100 rounded w-48"></div>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[1,2,3,4].map(() => (
                <div class="aspect-square bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Upload Script */}
      <script src={`/static/dashboard/upload.js?v=${JS_VERSION}`}></script>
      
      {/* Sortable.js for Drag & Drop */}
      <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
      
      {/* Initialize Sortable for each image grid */}
      <script src={`/static/dashboard/sortable.js?v=${JS_VERSION}`}></script>
      
      {/* CSS for Sortable animations */}
      <link rel="stylesheet" href="/static/css/dashboard-sortable.css" />
      
      {/* Pagination Controls - updated dynamically by JS */}
      <div class="mt-8 flex justify-between items-center">
          <div class="text-sm text-gray-500">
              <span id="pagination-info">読み込み中...</span>
          </div>
          
          <div id="pagination-controls" class="flex items-center space-x-2">
              {/* Populated by dashboard-pagination.js */}
          </div>
      </div>
    </Layout>
  )
  } catch (error) {
    logger.error('Dashboard error:', error);
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>エラー</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 p-8">
        <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 class="text-2xl font-bold text-red-600 mb-4">⚠️ データベース接続エラー</h1>
          <p class="text-gray-700 mb-4">
            Cloudflare Pages の D1 データベースバインディングが設定されていません。
          </p>
          <div class="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
            <h2 class="font-bold text-yellow-800 mb-2">設定手順：</h2>
            <ol class="list-decimal list-inside text-yellow-800 space-y-2">
              <li>Cloudflare ダッシュボード → Workers & Pages を開く</li>
              <li>smart-measure プロジェクトを選択</li>
              <li>Settings → Functions → D1 database bindings を開く</li>
              <li>Add binding をクリック</li>
              <li>Variable name: <code class="bg-yellow-100 px-1">DB</code></li>
              <li>D1 database: <code class="bg-yellow-100 px-1">measure-master-db</code> を選択</li>
              <li>Save をクリック</li>
              <li>自動再デプロイを待つ（数分）</li>
            </ol>
          </div>
          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-gray-500">エラー詳細</summary>
            <pre class="mt-2 p-2 bg-gray-100 text-xs overflow-auto">${error instanceof Error ? error.message : String(error)}</pre>
          </details>
        </div>
      </body>
      </html>
    `)
  }
})

export default dashboard

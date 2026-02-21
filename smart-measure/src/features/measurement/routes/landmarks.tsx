import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { getCompanyId } from '../../auth/helpers/auth'

const landmarks = new Hono<AppEnv>()

landmarks.get('/landmarks/:sku', async (c) => {
  const sku = c.req.param('sku');
  const _companyId = getCompanyId(c);
  
  return c.render(
    <Layout active="dashboard" title={`ランドマーク表示 - ${sku}`}>
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600 hover:text-blue-700 flex items-center mb-4">
          <i class="fas fa-arrow-left mr-2"></i>
          商品一覧に戻る
        </a>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-gray-800 flex items-center">
              <i class="fas fa-map-marker-alt mr-3 text-blue-600"></i>
              ランドマーク編集
            </h2>
            <p class="text-gray-600 mt-2">ランドマークをドラッグして位置を調整できます。測定値がリアルタイムで更新されます。</p>
          </div>
          <div class="flex items-center space-x-2">
            <button 
              id="btn-undo" 
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="元に戻す (Ctrl+Z)"
            >
              <i class="fas fa-undo mr-2"></i>
              元に戻す
            </button>
            <button 
              id="btn-redo" 
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="やり直す (Ctrl+Shift+Z)"
            >
              <i class="fas fa-redo mr-2"></i>
              やり直す
            </button>
            <button 
              id="btn-reset" 
              class="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors flex items-center text-sm"
            >
              <i class="fas fa-rotate-left mr-2"></i>
              リセット
            </button>
            <button 
              id="btn-save" 
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm font-medium shadow-md"
            >
              <i class="fas fa-save mr-2"></i>
              保存
            </button>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas Container */}
        <div class="lg:col-span-2 bg-white rounded-xl shadow-md p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-800">
              <i class="fas fa-image mr-2 text-blue-600"></i>
              画像とランドマーク
            </h3>
            <div class="text-sm text-gray-500">
              SKU: <span class="font-mono font-bold">{sku}</span>
            </div>
          </div>
          <div class="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <canvas id="landmark-canvas" class="w-full h-auto"></canvas>
          </div>
          <div class="mt-4 text-xs text-gray-500 flex items-center justify-between">
            <span>
              <i class="fas fa-hand-pointer mr-1"></i>
              ランドマークをドラッグして位置を調整できます
            </span>
            <span class="text-blue-600 font-semibold">Phase 2: インタラクティブ編集</span>
          </div>
          <div class="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div class="text-xs text-blue-900 space-y-1">
              <div class="flex items-center">
                <i class="fas fa-mouse-pointer mr-2 text-blue-600"></i>
                <span><strong>クリック&ドラッグ:</strong> ランドマークを移動</span>
              </div>
              <div class="flex items-center">
                <i class="fas fa-keyboard mr-2 text-blue-600"></i>
                <span><strong>Ctrl+Z:</strong> 元に戻す / <strong>Ctrl+Shift+Z:</strong> やり直す</span>
              </div>
              <div class="flex items-center">
                <i class="fas fa-save mr-2 text-blue-600"></i>
                <span><strong>保存ボタン:</strong> 変更を保存</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Measurements Panel */}
        <div class="bg-white rounded-xl shadow-md p-6 h-fit sticky top-6">
          <div id="measurements-panel">
            <div class="flex items-center justify-center py-8 text-gray-400">
              <i class="fas fa-spinner fa-spin mr-2"></i>
              読み込み中...
            </div>
          </div>
        </div>
      </div>
      
      {/* Load JavaScript Libraries */}
      <script src="/static/shared/measurement-calculator.js"></script>
      <script src="/static/editor/landmarks/interactive-editor.js"></script>
      
      {/* CSS for animations */}
      <link rel="stylesheet" href="/static/css/landmarks-animations.css" />
      
      {/* Initialize Interactive Editor */}
      <div id="landmarks-app" data-sku={sku}></div>
      <script src="/static/editor/landmarks/init.js"></script>
    </Layout>
  );
});

export default landmarks

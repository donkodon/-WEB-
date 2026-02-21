/**
 * editor.tsx - HTTP層（ルーティング + HTMLレンダリングのみ）
 *
 * 責務: リクエスト受付・EditorServiceへの委譲・HTMLレンダリング
 * ビジネスロジック → EditorService
 * DB操作           → EditorRepository（EditorService経由で注入）
 */
import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { logger } from '../../../shared/helpers/logger'
import { EditorRepository } from '../repositories/editor-repository'
import { EditorService } from '../services/editor-service'

const editor = new Hono<AppEnv>()

// ── Composition Root: 依存を組み立てる（手動DI） ──────────────────────────────
function createEditorService(): EditorService {
  return new EditorService(new EditorRepository())
}

// ─────────────────────────────────────────────
// POST /api/upload-image
// ─────────────────────────────────────────────
editor.post('/api/upload-image', async (c) => {
  const body = await c.req.parseBody()
  const file = body['image']
  const productId = body['productId']

  if (!file || !(file instanceof File) || !productId) {
    return c.text('Invalid upload', 400)
  }

  // Prototype: Base64変換（本番はR2直接アップロード）
  const buffer = await file.arrayBuffer()
  const base64String = Buffer.from(buffer).toString('base64')
  const mimeType = file.type
  const _dataUrl = `data:${mimeType};base64,${base64String}`

  return c.json({ success: true })
})

// ─────────────────────────────────────────────
// GET /edit/:id
// メインエディタ画面
// ─────────────────────────────────────────────
editor.get('/edit/:id', async (c) => {
  const id = c.req.param('id')
  const service = createEditorService()

  // ── 認証ユーザーからcompany_id取得 ──
  const user = c.get('user') as { companyId?: string } | undefined
  const authenticatedCompanyId = user?.companyId

  if (authenticatedCompanyId) {
    logger.debug(`✅ Authenticated user: companyId=${authenticatedCompanyId}`)
  } else {
    logger.debug(`⚠️ Unauthenticated access to editor`)
  }

  // ── imageId をパース ──
  const parsed = service.parseImageId(id)
  if (parsed.type === 'unknown') {
    return c.redirect('/dashboard')
  }

  // ── company_id を解決 ──
  const companyId = await service.resolveCompanyId(
    c.env.DB,
    parsed.sku,
    authenticatedCompanyId
  )
  if (!companyId) return c.redirect('/dashboard')

  // ── エディタデータを取得 ──
  let editorData = null
  if (parsed.type === 'measurement') {
    editorData = await service.getMeasurementEditorData(
      c.env.DB, id, parsed.sku, companyId
    )
  } else if (parsed.type === 'r2') {
    editorData = await service.getR2EditorData(
      c.env.DB, id, parsed.sku, parsed.filenamePart, companyId
    )
  }

  if (!editorData) return c.redirect('/dashboard')

  const {
    sku: productSku,
    imageSrc,
    originalSrc,
    isProcessed,
    isMeasurement,
    maskImageUrl: maskImageUrlWithCache,
  } = editorData

  const hasMask = true // マスク編集タブは常に表示

  return c.render(
    <Layout active="dashboard" title="画像処理プレビュー">
        <div class="flex justify-between items-center -mt-6 mb-6">
            <div class="text-sm breadcrumbs text-gray-500">
                <a href="/dashboard" class="hover:text-blue-600">ダッシュボード</a> <span class="mx-2">›</span>
                <a href="#" class="hover:text-blue-600">商品登録</a> <span class="mx-2">›</span>
                <span class="text-gray-800 font-medium">画像処理プレビュー</span>
            </div>
            <div class="flex space-x-3">
                 <button id="btn-toggle-original" onclick="window.toggleOriginal()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                    <i class="fas fa-image mr-2"></i> 元画像を確認
                 </button>
                 <button onclick="window.location.reload()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                    <i class="fas fa-history mr-2"></i> リセット
                 </button>
            </div>
        </div>

        <div class="flex gap-4 h-[calc(100vh-140px)]">
            {/* Left Sidebar: Tools */}
            <div class="w-72 bg-white border border-gray-200 rounded-xl p-4 flex flex-col overflow-y-auto">
                {/* Tab Navigation */}
                <div class="flex space-x-2 mb-4 border-b border-gray-200">
                    <button
                        id="tab-adjust"
                        class="flex-1 px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors"
                        onclick="switchTab('adjust')"
                    >
                        <i class="fas fa-sliders-h mr-1"></i> 画像調整
                    </button>
                    <button
                        id="tab-mask"
                        class="flex-1 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors"
                        onclick="switchTab('mask')"
                    >
                        <i class="fas fa-mask mr-1"></i> マスク編集
                    </button>
                </div>

                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-800 text-sm" id="tool-title">
                        <i class="fas fa-sliders-h mr-2"></i> 編集ツール
                    </h3>
                    <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">v2.0</span>
                </div>

                {/* Image Adjust Tools */}
                <div id="adjust-tools">
                <div class="space-y-3 mb-4">
                    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">画像調整</div>

                    <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>明るさ</span>
                            <span id="val-brightness" class="text-blue-600">0</span>
                        </div>
                        <input type="range" id="range-brightness" min="-100" max="100" value="0" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>WB</span>
                            <span id="val-wb" class="text-blue-600">5500K</span>
                        </div>
                        <input type="range" id="range-wb" min="2000" max="9000" step="100" value="5500" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>色味</span>
                            <span id="val-hue" class="text-blue-600">0°</span>
                        </div>
                        <input type="range" id="range-hue" min="-180" max="180" value="0" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                </div>

                <div class="mb-4">
                     <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">手動修正</div>
                     <div class="grid grid-cols-3 gap-2">
                         <button id="btn-crop" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-crop-alt mb-1 text-sm"></i>
                             <span class="text-[10px]">切り抜き</span>
                         </button>
                         <button id="btn-brush" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-paint-brush mb-1 text-sm"></i>
                             <span class="text-[10px]">ブラシ</span>
                         </button>
                         <button id="btn-eraser" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-eraser mb-1 text-sm"></i>
                             <span class="text-[10px]">消しゴム</span>
                         </button>
                     </div>
                </div>

                <div class="mb-4">
                    <div class="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                        <span><i class="fas fa-ruler-horizontal mr-1"></i> ブラシサイズ</span>
                        <span id="val-size" class="text-blue-600">24px</span>
                    </div>
                    <input type="range" id="range-size" min="1" max="100" value="24" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>

                 <div class="mt-auto pt-4 border-t border-gray-100">
                     <div class="space-y-2">
                         <button id="btn-save" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
                             <i class="fas fa-save mr-2"></i> 保存してダッシュボードへ
                         </button>
                         <button class="w-full bg-white hover:bg-gray-50 text-gray-500 font-medium py-2 rounded-lg transition-colors text-sm border border-transparent hover:border-gray-200">
                             キャンセル
                         </button>
                     </div>
                 </div>
                </div>

                {/* Mask Edit Tools */}
                <div id="mask-tools" class="hidden">
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">編集モード</div>
                        <div class="flex space-x-2">
                            <button
                                id="mask-mode-brush"
                                onclick="setMaskMode('brush')"
                                class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <i class="fas fa-paintbrush mr-1"></i> ブラシ
                            </button>
                            <button
                                id="mask-mode-eraser"
                                onclick="setMaskMode('eraser')"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <i class="fas fa-eraser mr-1"></i> 消しゴム
                            </button>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">
                            <strong>ブラシ:</strong> 白く塗る（削除エリア）<br/>
                            <strong>消しゴム:</strong> 黒く塗る（保持エリア）
                        </div>
                    </div>

                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">ブラシサイズ</div>
                        <div class="flex justify-between text-xs font-medium mb-2">
                            <span>サイズ</span>
                            <span id="val-mask-brush-size" class="text-blue-600">20px</span>
                        </div>
                        <input
                            type="range"
                            id="range-mask-brush-size"
                            min="1"
                            max="50"
                            value="20"
                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>

                    <div class="mb-6">
                        <button
                            onclick="undoMask()"
                            class="w-full bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                        >
                            <i class="fas fa-undo mr-1"></i> 元に戻す
                        </button>
                    </div>

                    <div class="mt-auto pt-4 border-t border-gray-100">
                        <div class="space-y-2">
                            <button onclick={`saveMask('${productSku}')`} class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
                                <i class="fas fa-save mr-2"></i> 保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Preview Area */}
            <div class="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
                <div class="flex items-center justify-between mb-4 px-2">
                     <div class="flex space-x-2">
                         <button class="p-2 text-gray-500 hover:text-blue-600"><i class="fas fa-search-plus"></i></button>
                         <button class="p-2 text-gray-500 hover:text-blue-600"><i class="fas fa-search-minus"></i></button>
                     </div>
                     <span class="text-xs font-mono text-gray-400">{productSku}_image_{id}.png</span>
                </div>

                <div id="canvas-container" class="flex-1 bg-gray-50 border border-gray-100 rounded-lg relative overflow-hidden flex items-center justify-center" style="background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;">
                    <div class="relative shadow-2xl">
                         <canvas id="main-canvas" class="max-h-[600px] max-w-full object-contain cursor-crosshair"></canvas>
                         {isProcessed ? (
                             <div class="absolute top-4 left-4 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm pointer-events-none">
                                 <i class="fas fa-check text-[8px] mr-1"></i> 白抜き済み
                             </div>
                         ) : (
                             <div class="absolute top-4 left-4 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm pointer-events-none">
                                 <i class="fas fa-circle text-[8px] mr-1"></i> 元画像
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>

        <script src="/static/editor/mask/editor.js"></script>

        <div id="editor-data"
             data-is-measurement={String(isMeasurement)}
             data-has-mask={String(hasMask)}
             data-mask-image-url={maskImageUrlWithCache}
             data-product-sku={productSku}
             data-image-id={id}
             data-image-src={imageSrc}
             data-original-src={originalSrc}
             data-is-processed={String(isProcessed)}
             style="display: none;">
        </div>

        {/* 読み込み順を保証: editor-state → image-adjust → mask-tools → crop-tool → image-processing → tab-switching */}
        <script src="/static/editor/tools/editor-state.js"></script>
        <script src="/static/editor/tools/image-adjust.js"></script>
        <script src="/static/editor/tools/mask-tools.js"></script>
        <script src="/static/editor/tools/crop-tool.js"></script>
        <script src="/static/editor/tools/image-processing.js"></script>
        <script src="/static/editor/common/tab-switching.js"></script>
    </Layout>
  )
})

export default editor

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
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { EditorRepository } from '../repositories/editor-repository'
import { EditorService } from '../services/editor-service'

const editor = new Hono<AppEnv>()

// ── Composition Root: モジュールスコープで一度だけ生成（per-request生成を排除）──
const editorService = new EditorService(new EditorRepository())

// ── 型定義 ──────────────────────────────────────────
interface ImageAdjustments {
  brightness: number    // -100 ~ 100
  whiteBalance: number  // 2000 ~ 9000
  hue: number           // -180 ~ 180
}

// ── バリデーション関数 ──────────────────────────────
function validateAdjustments(body: unknown): { valid: boolean; error?: string } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'Invalid request body type' }
  }

  const adj = body as Record<string, unknown>

  // 型チェック
  if (
    typeof adj.brightness !== 'number' ||
    typeof adj.whiteBalance !== 'number' ||
    typeof adj.hue !== 'number'
  ) {
    return { valid: false, error: 'Invalid parameter types' }
  }

  // 範囲チェック
  if (
    adj.brightness < -100 || adj.brightness > 100 ||
    adj.whiteBalance < 2000 || adj.whiteBalance > 9000 ||
    adj.hue < -180 || adj.hue > 180
  ) {
    return { valid: false, error: 'Parameter values out of range' }
  }

  return { valid: true }
}

// ── 静的JSのキャッシュバスター（デプロイ毎に更新）──
const JS_VERSION = '20250304-13'

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
  // eslint-disable-next-line max-lines-per-function
editor.get('/edit/:id', async (c) => {
  const id = c.req.param('id')
  // ── 認証ユーザーからcompany_id取得 ──
  const user = c.get('user') as { companyId?: string } | undefined
  const authenticatedCompanyId = user?.companyId

  if (authenticatedCompanyId) {
    logger.debug(`✅ Authenticated user: companyId=${authenticatedCompanyId}`)
  } else {
    logger.debug(`⚠️ Unauthenticated access to editor`)
  }

  // ── imageId をパース ──
  const parsed = editorService.parseImageId(id)
  if (parsed.type === 'unknown') {
    return c.redirect('/dashboard')
  }

  // ── company_id を解決 ──
  const companyId = await editorService.resolveCompanyId(
    c.env.DB,
    parsed.sku,
    authenticatedCompanyId
  )
  if (!companyId) return c.redirect('/dashboard')

  // ── エディタデータを取得 ──
  let editorData = null
  if (parsed.type === 'measurement') {
    editorData = await editorService.getMeasurementEditorData(
      c.env.DB, id, parsed.sku, companyId
    )
  } else if (parsed.type === 'r2') {
    editorData = await editorService.getR2EditorData(
      c.env.DB, id, parsed.sku, parsed.filenamePart, companyId
    )
  }

  if (!editorData) return c.redirect('/dashboard')

  const {
    sku: productSku,
    originalSrc,
    isProcessed,
    isMeasurement,
    maskImageUrl: maskImageUrlWithCache,
    brightness,
    whiteBalance,
    hue,
  } = editorData

  // ── クエリパラメータ ?src= があればダッシュボードの表示URL（p/f画像）を優先使用 ──
  // ダッシュボードはすでに f>p>original の優先順位で display_url を決定済みなので
  // そのURLを直接エディタに渡すことで、DBクエリのズレを排除する
  const srcParam = c.req.query('src')
  const imageSrc = (srcParam && srcParam.startsWith('/api/image-proxy/'))
    ? srcParam
    : editorData.imageSrc

  const finalIsProcessed = isProcessed || (srcParam?.includes('_p.png') || srcParam?.includes('_f.png')) || false

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

                {/* Crop Tools Panel（切り抜きモード時に表示） */}
                <div id="crop-panel" style="display:none" class="flex flex-col h-full">
                    <div class="mb-3">
                        <div class="text-xs font-bold text-orange-600 mb-1 flex items-center">
                            <i class="fas fa-crop-alt mr-1"></i> 1000×1000 クロップ
                        </div>
                        <p class="text-[11px] text-gray-500 leading-relaxed">
                            オレンジの枠をドラッグして<br/>位置を調整してください
                        </p>
                    </div>
                    <div class="mb-3">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">プレビュー</div>
                        <canvas id="crop-preview-canvas" width="200" height="200"
                            class="w-full border border-gray-200 rounded-lg bg-gray-50">
                        </canvas>
                    </div>
                    <div id="crop-status-inline" class="text-[10px] text-gray-400 mb-3 leading-relaxed"></div>
                    <div class="space-y-2 mt-auto pt-3 border-t border-gray-100">
                        <button id="crop-auto-center"
                            class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm flex items-center justify-center">
                            <i class="fas fa-crosshairs mr-2"></i> 自動センター
                        </button>
                        <button id="crop-confirm"
                            class="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-sm flex items-center justify-center shadow-md">
                            <i class="fas fa-check mr-2"></i> 確定して保存
                        </button>
                        <button id="crop-cancel"
                            class="w-full bg-white hover:bg-gray-50 text-gray-500 font-medium py-2 rounded-lg text-sm border border-gray-200">
                            キャンセル
                        </button>
                    </div>
                </div>

                {/* Image Adjust Tools */}
                <div id="adjust-tools">
                <div class="space-y-3 mb-4">
                    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">画像調整</div>

                    <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>明るさ</span>
                            <span id="val-brightness" class="text-blue-600">{brightness}</span>
                        </div>
                        <input type="range" id="range-brightness" min="-100" max="100" value={String(brightness)} class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>WB</span>
                            <span id="val-wb" class="text-blue-600">{whiteBalance}K</span>
                        </div>
                        <input type="range" id="range-wb" min="2000" max="9000" step="100" value={String(whiteBalance)} class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>色味</span>
                            <span id="val-hue" class="text-blue-600">{hue}°</span>
                        </div>
                        <input type="range" id="range-hue" min="-180" max="180" value={String(hue)} class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
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
                         {finalIsProcessed ? (
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
             data-is-processed={String(finalIsProcessed)}
             data-brightness={String(brightness)}
             data-white-balance={String(whiteBalance)}
             data-hue={String(hue)}
             data-crop-x={editorData.cropX !== null ? String(editorData.cropX) : ''}
             data-crop-y={editorData.cropY !== null ? String(editorData.cropY) : ''}
             data-crop-size={editorData.cropSize !== null ? String(editorData.cropSize) : ''}
             data-crop-enabled={String(editorData.cropEnabled)}
             style="display: none;">
        </div>

        {/* 読み込み順を保証: client-logger → editor-state → image-adjust → mask-tools → crop-overlay → crop-tool → image-processing → tab-switching */}
        {/* ?v= でブラウザキャッシュを無効化（デプロイ毎に JS_VERSION を更新すること）*/}
        <script src={`/static/shared/client-logger.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/editor-state.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/image-adjust.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/mask-tools.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/crop-overlay.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/crop-tool.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/tools/image-processing.js?v=${JS_VERSION}`}></script>
        <script src={`/static/editor/common/tab-switching.js?v=${JS_VERSION}`}></script>
    </Layout>
  )
})

// ─────────────────────────────────────────────
// POST /api/save-adjustments/:sku
// 画像調整値（明るさ・ホワイトバランス・色相）をDBに保存
// 
// 認証: Firebase認証トークン必須
// 権限: 自社の商品のみ更新可能（company_id で制限）
// 
// リクエストボディ:
//   {
//     brightness: number,    // -100 ~ 100
//     whiteBalance: number,  // 2000 ~ 9000
//     hue: number            // -180 ~ 180
//   }
// 
// レスポンス:
//   成功: { success: true, brightness, whiteBalance, hue }
//   エラー: { error: string, details?: string }
// ─────────────────────────────────────────────
editor.post('/api/save-adjustments/:sku', requireFirebaseAuth, async (c) => {
  const sku = c.req.param('sku')
  
  // リクエストボディのバリデーション
  let body: ImageAdjustments
  try {
    body = await c.req.json()
  } catch (error) {
    logger.error('❌ Invalid JSON body:', error)
    return c.json({ error: 'Invalid request body' }, 400)
  }

  // パラメータのバリデーション
  const validation = validateAdjustments(body)
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400)
  }

  // 認証ユーザーのcompany_id取得
  const user = c.get('user') as { companyId?: string } | undefined
  const companyId = user?.companyId

  if (!companyId) {
    logger.warn(`⚠️ Unauthorized adjustment save attempt for sku=${sku}`)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    // product_itemsテーブルを更新
    const result = await c.env.DB.prepare(`
      UPDATE product_items
      SET 
        brightness = ?,
        white_balance = ?,
        hue = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE sku = ? AND company_id = ?
    `).bind(
      body.brightness,
      body.whiteBalance,
      body.hue,
      sku,
      companyId
    ).run()

    // 更新された行がない場合のチェック
    if (result.meta.changes === 0) {
      logger.warn(`⚠️ No rows updated for sku=${sku}, companyId=${companyId}`)
      return c.json({ error: 'Product not found or no permission' }, 404)
    }

    logger.info(`✅ Saved adjustments for ${sku}: brightness=${body.brightness}, wb=${body.whiteBalance}, hue=${body.hue}`)

    return c.json({ 
      success: true,
      brightness: body.brightness,
      whiteBalance: body.whiteBalance,
      hue: body.hue
    })
  } catch (error) {
    logger.error('❌ Failed to save adjustments:', error)
    return c.json({ 
      error: 'Failed to save adjustments',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ─────────────────────────────────────────────
// POST /api/save-crop-metadata/:sku
// クロップ座標（cropX, cropY, cropSize, cropEnabled）をDBに保存
// 
// 認証: Firebase認証トークン必須
// 権限: 自社の商品のみ更新可能（company_id で制限）
// 
// リクエストボディ:
//   {
//     cropX: number,         // X座標
//     cropY: number,         // Y座標
//     cropSize: number,      // クロップサイズ
//     cropEnabled: boolean   // クロップ有効フラグ
//   }
// 
// レスポンス:
//   成功: { success: true, crop: { cropX, cropY, cropSize, cropEnabled } }
//   エラー: { error: string, details?: string }
// ─────────────────────────────────────────────
editor.post('/api/save-crop-metadata/:sku', requireFirebaseAuth, async (c) => {
  const sku = c.req.param('sku')
  
  // リクエストボディのバリデーション
  let body: {
    cropX: number
    cropY: number
    cropSize: number
    cropEnabled: boolean
  }
  try {
    body = await c.req.json()
  } catch (error) {
    logger.error('❌ Invalid JSON body:', error)
    return c.json({ error: 'Invalid request body' }, 400)
  }

  // パラメータのバリデーション
  if (
    typeof body.cropX !== 'number' ||
    typeof body.cropY !== 'number' ||
    typeof body.cropSize !== 'number' ||
    typeof body.cropEnabled !== 'boolean'
  ) {
    return c.json({ 
      error: 'Invalid parameters',
      details: 'cropX, cropY, cropSize must be numbers, cropEnabled must be boolean'
    }, 400)
  }

  if (body.cropX < 0 || body.cropY < 0 || body.cropSize < 100) {
    return c.json({ 
      error: 'Invalid crop values',
      details: 'cropX, cropY must be >= 0, cropSize must be >= 100'
    }, 400)
  }

  // 認証ユーザーのcompany_id取得
  const user = c.get('user') as { companyId?: string } | undefined
  const companyId = user?.companyId

  if (!companyId) {
    logger.warn(`⚠️ Unauthorized crop metadata save attempt for sku=${sku}`)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    // product_itemsテーブルを更新
    const result = await c.env.DB.prepare(`
      UPDATE product_items
      SET 
        crop_x = ?,
        crop_y = ?,
        crop_size = ?,
        crop_enabled = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE sku = ? AND company_id = ?
    `).bind(
      body.cropX,
      body.cropY,
      body.cropSize,
      body.cropEnabled ? 1 : 0,
      sku,
      companyId
    ).run()

    // 更新された行がない場合のチェック
    if (result.meta.changes === 0) {
      logger.warn(`⚠️ No rows updated for sku=${sku}, companyId=${companyId}`)
      return c.json({ error: 'Product not found or no permission' }, 404)
    }

    logger.info(`✅ Saved crop metadata for ${sku}: cropX=${body.cropX}, cropY=${body.cropY}, cropSize=${body.cropSize}, enabled=${body.cropEnabled}`)

    return c.json({ 
      success: true,
      crop: {
        cropX: body.cropX,
        cropY: body.cropY,
        cropSize: body.cropSize,
        cropEnabled: body.cropEnabled
      }
    })
  } catch (error) {
    logger.error('❌ Failed to save crop metadata:', error)
    return c.json({ 
      error: 'Failed to save crop metadata',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

export default editor

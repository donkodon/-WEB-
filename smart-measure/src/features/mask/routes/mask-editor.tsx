import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { getCompanyId } from '../../auth/helpers/auth'

const maskEditor = new Hono<AppEnv>()

maskEditor.get('/mask-editor/:sku', async (c) => {
    const sku = c.req.param('sku');
    const companyId = getCompanyId(c);
    
    // Get measurement image and mask image URLs from database
    // mask_image_url_r2: 背景削除マスク（withoutBG / 手動編集）
    const result = await c.env.DB.prepare(`
        SELECT 
            COALESCE(measurement_image_url, annotated_image_url) as image_url,
            mask_image_url_r2
        FROM product_items
        WHERE sku = ? AND company_id = ?
        LIMIT 1
    `).bind(sku, companyId).first();
    
    if (!result || !result.image_url) {
        return c.redirect('/dashboard');
    }
    
    const originalImageUrl = result.image_url as string;
    const maskImageUrl = result.mask_image_url_r2 as string | null;
    
    return c.render(
        <Layout active="dashboard" title="マスク編集">
            <div class="flex justify-between items-center -mt-6 mb-6">
                <div class="text-sm breadcrumbs text-gray-500">
                    <a href="/dashboard" class="hover:text-blue-600">ダッシュボード</a> 
                    <span class="mx-2">›</span>
                    <span class="text-gray-800 font-medium">マスク編集</span>
                </div>
                <div class="flex space-x-3">
                    <button onclick="window.maskEditorPreview()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                        <i class="fas fa-eye mr-2"></i> プレビュー
                    </button>
                    <button onclick="window.maskEditorReset()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                        <i class="fas fa-undo mr-2"></i> リセット
                    </button>
                    <button onclick={`window.maskEditorSave('${sku}')`} class="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors text-sm font-medium">
                        <i class="fas fa-save mr-2"></i> 保存
                    </button>
                </div>
            </div>

            <div class="flex gap-4 h-[calc(100vh-140px)]">
                {/* Left Sidebar: Tools */}
                <div class="w-72 bg-white border border-gray-200 rounded-xl p-4 flex flex-col overflow-y-auto">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-bold text-gray-800 text-sm">
                            <i class="fas fa-paintbrush mr-2"></i> マスク編集ツール
                        </h3>
                    </div>

                    {/* Mode Selection */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">編集モード</div>
                        <div class="flex space-x-2">
                            <button 
                                data-mode="brush"
                                onclick="window.maskEditorSetMode('brush')"
                                class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <i class="fas fa-paintbrush mr-1"></i> ブラシ
                            </button>
                            <button 
                                data-mode="eraser"
                                onclick="window.maskEditorSetMode('eraser')"
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

                    {/* Brush Size */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">ブラシサイズ</div>
                        <div class="flex justify-between text-xs font-medium mb-2">
                            <span>サイズ</span>
                            <span id="val-brush-size" class="text-blue-600">20px</span>
                        </div>
                        <input 
                            type="range" 
                            id="range-brush-size" 
                            min="1" 
                            max="50" 
                            value="20" 
                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            oninput="window.maskEditorSetBrushSize(this.value); document.getElementById('val-brush-size').textContent = this.value + 'px';"
                        />
                    </div>

                    {/* History Controls */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">履歴</div>
                        <div class="flex space-x-2">
                            <button 
                                onclick="window.maskEditorUndo()"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                                <i class="fas fa-undo mr-1"></i> 元に戻す
                            </button>
                            <button 
                                onclick="window.maskEditorRedo()"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                                <i class="fas fa-redo mr-1"></i> やり直し
                            </button>
                        </div>
                    </div>

                    {/* Instructions */}
                    <div class="mt-auto pt-4 border-t border-gray-200">
                        <div class="text-xs text-gray-600 space-y-2">
                            <p><strong>使い方:</strong></p>
                            <ul class="list-disc list-inside space-y-1 text-[11px]">
                                <li>ブラシで白く塗る → 背景として削除</li>
                                <li>消しゴムで黒く塗る → 商品として保持</li>
                                <li>マウスまたはタッチで描画</li>
                                <li>プレビューで結果確認</li>
                                <li>保存で画像を再生成</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Center: Canvas */}
                <div class="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-center overflow-hidden">
                    <div class="relative w-full h-full flex items-center justify-center">
                        <canvas 
                            id="mask-canvas" 
                            class="max-w-full max-h-full object-contain border border-gray-300 rounded cursor-crosshair"
                            style="touch-action: none;"
                        ></canvas>
                    </div>
                </div>
            </div>

            <div id="mask-editor-container" 
                 data-original-image={originalImageUrl} 
                 data-mask-image={maskImageUrl}
                 data-sku={sku}
                 style="display: none;">
            </div>
            <script src="/static/editor/mask/editor.js"></script>
            <script src="/static/editor/mask/init.js"></script>
        </Layout>
    );
});

export default maskEditor

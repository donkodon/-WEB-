import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { getCompanyId } from '../../auth/helpers/auth'

const maskEditor = new Hono<AppEnv>()

  // eslint-disable-next-line max-lines-per-function
maskEditor.get('/mask-editor/:sku', async (c) => {
    const sku = c.req.param('sku');
    const companyId = getCompanyId(c);
    
    // Get measurement image, mask image URLs, and image_urls from database
    // mask_image_url_r2: 背景削除マスク（withoutBG / 手動編集）
    const result = await c.env.DB.prepare(`
        SELECT 
            COALESCE(measurement_image_url, annotated_image_url) as image_url,
            mask_image_url_r2,
            image_urls
        FROM product_items
        WHERE sku = ? AND company_id = ?
        LIMIT 1
    `).bind(sku, companyId).first();
    
    if (!result || !result.image_url) {
        return c.redirect('/dashboard');
    }
    
    const originalImageUrl = result.image_url as string;
    const maskImageUrl = result.mask_image_url_r2 as string | null;

    // image_urls から最初の画像のファイル名ベース部分を抽出
    // 例: "4469bcc2-09b1-4218-8ad4-78fd92ced9a7.jpg" → "4469bcc2-09b1-4218-8ad4-78fd92ced9a7"
    let imageFilenamePart = '';
    try {
        const imageUrls: string[] = JSON.parse((result.image_urls as string) || '[]');
        if (imageUrls.length > 0) {
            const firstUrl = imageUrls[0];
            const filename = firstUrl.split('/').pop() || '';
            const dotIndex = filename.lastIndexOf('.');
            imageFilenamePart = dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
        }
    } catch { /* パース失敗は無視 */ }
    
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
                                class="flex-1 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-700"
                            >
                                <i class="fas fa-eraser mr-1"></i> 削除
                            </button>
                            <button 
                                data-mode="eraser"
                                onclick="window.maskEditorSetMode('eraser')"
                                class="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-green-700"
                            >
                                <i class="fas fa-paint-brush mr-1"></i> 復元
                            </button>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">
                            <span class="text-red-600 font-bold">削除ブラシ:</span> 背景を削除（白）<br/>
                            <span class="text-green-600 font-bold">復元ブラシ:</span> 商品を復元（黒）
                        </div>
                    </div>
                    
                    {/* View Mode Selection */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">表示モード</div>
                        <div class="flex space-x-2">
                            <button 
                                data-view-mode="mask"
                                onclick="window.maskEditorSetViewMode('mask')"
                                class="flex-1 bg-gray-700 text-white px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                            >
                                <i class="fas fa-mask mr-1"></i> マスク
                            </button>
                            <button 
                                data-view-mode="overlay"
                                onclick="window.maskEditorSetViewMode('overlay')"
                                class="flex-1 bg-gray-100 text-gray-700 px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                            >
                                <i class="fas fa-layer-group mr-1"></i> 重ね表示
                            </button>
                            <button 
                                data-view-mode="result"
                                onclick="window.maskEditorSetViewMode('result')"
                                class="flex-1 bg-gray-100 text-gray-700 px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                            >
                                <i class="fas fa-eye mr-1"></i> 結果
                            </button>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">
                            <strong>マスク:</strong> 白黒で編集<br/>
                            <strong>重ね表示:</strong> 削除エリアを赤色表示<br/>
                            <strong>結果:</strong> 背景削除結果を表示
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
                            <p><strong>💡 マスク編集の基本:</strong></p>
                            <ul class="list-disc list-inside space-y-1 text-[11px]">
                                <li><span class="text-red-600 font-bold">削除ブラシ:</span> 背景を削除したい部分を塗る</li>
                                <li><span class="text-green-600 font-bold">復元ブラシ:</span> 商品として残したい部分を塗る</li>
                                <li>重ね表示で削除エリアを確認</li>
                                <li>結果モードで仕上がりをチェック</li>
                            </ul>
                            <p class="text-[10px] text-gray-500 mt-2">
                                ※AIが削除しすぎた場合は「復元ブラシ」で元に戻せます
                            </p>
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
                 data-filename-part={imageFilenamePart}
                 style="display: none;">
            </div>
            <script src="/static/editor/mask/editor.js"></script>
            <script src="/static/editor/mask/init.js"></script>
        </Layout>
    );
});

export default maskEditor

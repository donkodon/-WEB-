import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'

const settings = new Hono<AppEnv>()

settings.get('/settings', (c) => {
  return c.render(
    <Layout active="settings" title="データ入力・設定">
        <div class="mb-8">
            <p class="text-gray-500">在庫CSVのインポートや、撮影画像の白抜き処理・一括エクスポート、ファイル命名規則の設定を行います。</p>
        </div>

        {/* Usage Summary Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 text-white w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-chart-line"></i>
                </div>
                今月の使用状況
            </h3>
            
            <div id="usage-summary" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* SKU Downloads */}
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-blue-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-download"></i>
                        </div>
                        <span id="plan-badge-sku" class="text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold">松プラン</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-blue-700 font-medium mb-1">商品データダウンロード</div>
                        <div class="flex items-baseline">
                            <span id="sku-count" class="text-4xl font-bold text-blue-900">-</span>
                            <span class="text-lg text-blue-700 ml-2">件</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-blue-300 mt-4">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-blue-700">今月の請求額</span>
                            <span id="sku-amount" class="text-xl font-bold text-blue-900">¥-</span>
                        </div>
                        <div id="sku-tier-info" class="text-xs text-blue-600 mt-2">
                            次のプラン: 竹プラン（101件〜 ¥50/件）
                        </div>
                    </div>
                </div>

                {/* AI Generation */}
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-purple-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-magic"></i>
                        </div>
                        <span id="plan-badge-ai" class="text-xs bg-purple-600 text-white px-3 py-1 rounded-full font-bold">松プラン</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-purple-700 font-medium mb-1">AI画像生成</div>
                        <div class="flex items-baseline">
                            <span id="ai-count" class="text-4xl font-bold text-purple-900">-</span>
                            <span class="text-lg text-purple-700 ml-2">回</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-purple-300 mt-4">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-purple-700">今月の請求額</span>
                            <span id="ai-amount" class="text-xl font-bold text-purple-900">¥-</span>
                        </div>
                        <div id="ai-tier-info" class="text-xs text-purple-600 mt-2">
                            次のプラン: 竹プラン（101回〜 ¥50/回）
                        </div>
                    </div>
                </div>

                {/* Total */}
                <div class="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl p-6 border border-green-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-green-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-yen-sign"></i>
                        </div>
                        <span id="account-type-badge" class="text-xs bg-green-600 text-white px-3 py-1 rounded-full font-bold">無料プラン</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-green-700 font-medium mb-1">合計請求額（税込）</div>
                        <div class="flex items-baseline">
                            <span class="text-2xl font-bold text-green-900">¥</span>
                            <span id="total-amount" class="text-4xl font-bold text-green-900">-</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-green-300 mt-4">
                        <div class="text-xs text-green-700 space-y-1">
                            <div class="flex justify-between">
                                <span>小計</span>
                                <span id="subtotal-amount" class="font-semibold">¥-</span>
                            </div>
                            <div class="flex justify-between">
                                <span>消費税（10%）</span>
                                <span id="tax-amount" class="font-semibold">¥-</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Usage Breakdown */}
            <div id="usage-breakdown" class="mt-6 pt-6 border-t border-gray-200">
                <h4 class="text-sm font-bold text-gray-700 mb-4 flex items-center">
                    <i class="fas fa-list-ul mr-2 text-gray-400"></i>
                    料金内訳（プラン別）
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="text-xs text-gray-500 mb-3 font-bold">商品データダウンロード</div>
                        <div id="sku-breakdown" class="space-y-2 text-sm">
                            <div class="flex justify-between text-gray-600">
                                <span>読み込み中...</span>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="text-xs text-gray-500 mb-3 font-bold">AI画像生成</div>
                        <div id="ai-breakdown" class="space-y-2 text-sm">
                            <div class="flex justify-between text-gray-600">
                                <span>読み込み中...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Load usage data */}
        <script src="/static/billing/usage-settings.js"></script>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* CSV Import */}
            <div class="bg-white border border-gray-200 rounded-xl p-6">
                 <h3 class="font-bold text-lg text-gray-800 mb-4 flex items-center">
                     <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                         <i class="fas fa-file-csv"></i>
                     </div>
                     CSVインポート (在庫更新)
                 </h3>
                 
                 <input type="file" id="csv-input" class="hidden" accept=".csv,.tsv,text/csv,text/tab-separated-values" />
                 <div id="drop-zone" class="border-2 border-dashed border-blue-100 bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-colors h-64">
                     <div class="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mb-4 text-blue-500 text-2xl pointer-events-none">
                         <i class="fas fa-cloud-upload-alt"></i>
                     </div>
                     <p id="file-name" class="font-bold text-blue-600 mb-1 pointer-events-none">クリックして選択 <span class="text-gray-500 font-normal">またはドラッグ＆ドロップ</span></p>
                     <p class="text-xs text-gray-400 pointer-events-none">CSV, TSV (最大 10MB)</p>
                 </div>
                 
                 <div class="flex items-center justify-between mt-4">
                     <div class="text-xs text-green-600 flex items-center font-medium">
                         <i class="fas fa-check-circle mr-1"></i> 最新のインポート: 2023/10/24 14:30
                     </div>
                     <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">完了</span>
                 </div>
                 
                 <div class="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
                     <a href="/api/download-csv-template" download="product_master_template.csv" class="text-sm text-blue-600 hover:underline flex items-center">
                         <i class="fas fa-download mr-1"></i> テンプレートCSVをダウンロード
                     </a>
                     <button id="btn-import" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                         インポート実行
                     </button>
                 </div>
                 {/* CSV Import Script - External File */}
                 <script src="/static/shared/csv-import.js"></script>
            </div>

            {/* Data Export */}
             <div class="bg-white border border-gray-200 rounded-xl p-6">
                 <h3 class="font-bold text-lg text-gray-800 mb-4 flex items-center">
                     <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                         <i class="fas fa-download"></i>
                     </div>
                     データ出力・ダウンロード
                 </h3>

                 {/* Stock CSV Section */}
                 <div class="bg-gray-50 rounded-lg p-4 mb-6 flex items-center justify-between">
                     <div>
                         <h4 class="font-bold text-gray-800 text-sm">在庫データCSV</h4>
                         <p class="text-xs text-gray-500 mt-1">現在登録されている全商品の採寸データを含むCSVを出力します。</p>
                     </div>
                     <button class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm whitespace-nowrap">
                         <i class="fas fa-download mr-1"></i> CSV出力
                     </button>
                 </div>

                 {/* Image Export Section */}
                 <div class="mb-4">
                     <div class="flex justify-between items-center mb-3">
                         <h4 class="font-bold text-gray-800 text-sm">画像一括エクスポート</h4>
                         <span class="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded font-bold">ZIP形式</span>
                     </div>
                     <p class="text-xs text-gray-500 mb-4">選択したオプションで画像を処理し、ZIPファイルとしてダウンロードします。</p>
                     
                     <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">白抜き処理を適用 (Background Removal)</span>
                         </label>
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">リサイズ (長辺 1200px)</span>
                         </label>
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">ファイル名にSKUを含める</span>
                         </label>
                     </div>
                 </div>
                 
                 <button class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center justify-center mt-auto">
                     <i class="fas fa-file-archive mr-2"></i> 画像データを一括ダウンロード
                 </button>
            </div>
        </div>

        {/* General Settings */}
        <div class="bg-white border border-gray-200 rounded-xl p-6">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                 <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                     <i class="fas fa-sliders-h"></i>
                 </div>
                 一般設定
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">出力ファイル名フォーマット</label>
                    <p class="text-xs text-blue-500 mb-2">使用可能な変数: {'{SKU}'}, {'{DATE}'}, {'{TIME}'}, {'{SEQ}'}</p>
                    <div class="flex space-x-2">
                        <input type="text" value="{SKU}_{DATE}_v1" class="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50" />
                        <select class="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                            <option>.jpg</option>
                            <option>.png</option>
                            <option>.webp</option>
                        </select>
                    </div>
                    
                    <div class="mt-6">
                         <div class="flex justify-between mb-2">
                             <label class="block text-sm font-bold text-gray-700">画像圧縮率 (JPEG/WebP)</label>
                             <span class="text-sm font-bold text-gray-900">85%</span>
                         </div>
                         <input type="range" value="85" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">撮影時の自動アップロード</h4>
                            <p class="text-xs text-blue-600 mt-1">スマホで撮影完了時に自動でクラウドへ送信します</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">AI白抜き処理の自動適用</h4>
                            <p class="text-xs text-blue-600 mt-1">インポートされた画像に対して自動で背景削除を行います</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">エラー時の通知メール</h4>
                            <p class="text-xs text-blue-600 mt-1">処理に失敗した際に管理者にメールを送信します</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>
                </div>
            </div>
            
            <div class="mt-8 pt-6 border-t border-gray-100 flex justify-end space-x-4">
                 <p class="text-gray-400 text-sm self-center mr-auto">変更内容は保存されていません</p>
                 <button class="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-bold hover:bg-gray-50">
                     キャンセル
                 </button>
                 <button class="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                     設定を保存
                 </button>
            </div>
        </div>
    </Layout>
  )
})

export default settings

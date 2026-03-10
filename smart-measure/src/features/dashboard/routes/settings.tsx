import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'

const settings = new Hono<AppEnv>()

  // eslint-disable-next-line max-lines-per-function
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

        {/* Pricing Plans Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-gradient-to-r from-purple-500 to-pink-600 text-white w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-crown"></i>
                </div>
                料金プラン
            </h3>

            {/* Current Plan Display */}
            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 mb-6 border border-indigo-200">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <div class="text-sm text-indigo-600 font-medium mb-1">現在のプラン</div>
                        <div class="flex items-baseline">
                            <span id="current-plan-name" class="text-3xl font-bold text-indigo-900">無料プラン</span>
                            <span id="current-plan-price" class="text-lg text-indigo-700 ml-3">¥0/月</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span id="current-plan-badge" class="inline-block px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold">
                            <i class="fas fa-gift mr-1"></i> FREE
                        </span>
                    </div>
                </div>
                <div class="pt-4 border-t border-indigo-200">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div class="text-indigo-600 mb-1">今月の使用量</div>
                            <div class="font-bold text-indigo-900"><span id="plan-usage-count">0</span> / 10件</div>
                        </div>
                        <div>
                            <div class="text-indigo-600 mb-1">次回更新日</div>
                            <div class="font-bold text-indigo-900" id="plan-renewal-date">-</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Comparison Table */}
            <div class="overflow-x-auto mb-6">
                <table class="w-full border-collapse">
                    <thead>
                        <tr class="border-b-2 border-gray-200">
                            <th class="text-left py-4 px-4 text-sm font-bold text-gray-700">機能</th>
                            <th class="text-center py-4 px-4">
                                <div class="text-sm font-bold text-gray-700">無料プラン</div>
                                <div class="text-2xl font-bold text-gray-900 mt-1">¥0</div>
                                <div class="text-xs text-gray-500">/月</div>
                            </th>
                            <th class="text-center py-4 px-4 bg-blue-50">
                                <div class="text-sm font-bold text-blue-700">スタータープラン</div>
                                <div class="text-2xl font-bold text-blue-900 mt-1">¥3,000</div>
                                <div class="text-xs text-blue-600">/月</div>
                            </th>
                            <th class="text-center py-4 px-4 bg-purple-50">
                                <div class="text-sm font-bold text-purple-700">ビジネスプラン</div>
                                <div class="text-2xl font-bold text-purple-900 mt-1">¥10,000</div>
                                <div class="text-xs text-purple-600">/月</div>
                            </th>
                            <th class="text-center py-4 px-4 bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-400">
                                <div class="text-sm font-bold text-orange-700 flex items-center justify-center">
                                    <i class="fas fa-crown mr-1"></i> エンタープライズ
                                </div>
                                <div class="text-2xl font-bold text-orange-900 mt-1">¥30,000</div>
                                <div class="text-xs text-orange-600">/月</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="text-sm">
                        <tr class="border-b border-gray-100">
                            <td class="py-3 px-4 font-medium text-gray-700">商品データダウンロード</td>
                            <td class="py-3 px-4 text-center text-gray-600">10件/月</td>
                            <td class="py-3 px-4 text-center bg-blue-50 font-bold text-blue-900">100件/月</td>
                            <td class="py-3 px-4 text-center bg-purple-50 font-bold text-purple-900">500件/月</td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50 font-bold text-orange-900">無制限</td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-3 px-4 font-medium text-gray-700">AI画像生成</td>
                            <td class="py-3 px-4 text-center text-gray-600">10回/月</td>
                            <td class="py-3 px-4 text-center bg-blue-50 font-bold text-blue-900">100回/月</td>
                            <td class="py-3 px-4 text-center bg-purple-50 font-bold text-purple-900">500回/月</td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50 font-bold text-orange-900">無制限</td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-3 px-4 font-medium text-gray-700">超過時の従量課金</td>
                            <td class="py-3 px-4 text-center text-red-600 font-bold">利用不可</td>
                            <td class="py-3 px-4 text-center bg-blue-50 text-blue-700">松¥100 → 竹¥50 → 梅¥25</td>
                            <td class="py-3 px-4 text-center bg-purple-50 text-purple-700">松¥100 → 竹¥50 → 梅¥25</td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50 text-orange-700">追加料金なし</td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-3 px-4 font-medium text-gray-700">画像エクスポート</td>
                            <td class="py-3 px-4 text-center"><i class="fas fa-check text-green-600"></i></td>
                            <td class="py-3 px-4 text-center bg-blue-50"><i class="fas fa-check text-green-600"></i></td>
                            <td class="py-3 px-4 text-center bg-purple-50"><i class="fas fa-check text-green-600"></i></td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50"><i class="fas fa-check text-green-600"></i></td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-3 px-4 font-medium text-gray-700">優先サポート</td>
                            <td class="py-3 px-4 text-center"><i class="fas fa-times text-red-600"></i></td>
                            <td class="py-3 px-4 text-center bg-blue-50"><i class="fas fa-times text-red-600"></i></td>
                            <td class="py-3 px-4 text-center bg-purple-50"><i class="fas fa-check text-green-600"></i></td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50"><i class="fas fa-check text-green-600"></i></td>
                        </tr>
                        <tr>
                            <td class="py-3 px-4 font-medium text-gray-700">専任担当者</td>
                            <td class="py-3 px-4 text-center"><i class="fas fa-times text-red-600"></i></td>
                            <td class="py-3 px-4 text-center bg-blue-50"><i class="fas fa-times text-red-600"></i></td>
                            <td class="py-3 px-4 text-center bg-purple-50"><i class="fas fa-times text-red-600"></i></td>
                            <td class="py-3 px-4 text-center bg-gradient-to-br from-yellow-50 to-orange-50"><i class="fas fa-check text-green-600"></i></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Action Buttons */}
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <button disabled class="bg-gray-200 text-gray-500 py-3 rounded-lg font-bold cursor-not-allowed">
                    <i class="fas fa-check mr-2"></i> 現在のプラン
                </button>
                <button id="btn-select-starter" class="bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all transform hover:scale-105">
                    <i class="fas fa-rocket mr-2"></i> スタータープランへ
                </button>
                <button id="btn-select-business" class="bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 shadow-md shadow-purple-200 transition-all transform hover:scale-105">
                    <i class="fas fa-building mr-2"></i> ビジネスプランへ
                </button>
                <button id="btn-select-enterprise" class="bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-lg font-bold hover:from-yellow-600 hover:to-orange-600 shadow-lg shadow-orange-300 transition-all transform hover:scale-105">
                    <i class="fas fa-crown mr-2"></i> エンタープライズへ
                </button>
            </div>

            {/* Additional Info */}
            <div class="mt-6 pt-6 border-t border-gray-200">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div class="flex items-start space-x-3">
                        <i class="fas fa-info-circle text-blue-500 mt-1"></i>
                        <div>
                            <div class="font-bold text-gray-800">いつでもプラン変更可能</div>
                            <div class="text-gray-600 text-xs">アップグレード・ダウングレードはいつでも可能です</div>
                        </div>
                    </div>
                    <div class="flex items-start space-x-3">
                        <i class="fas fa-lock text-green-500 mt-1"></i>
                        <div>
                            <div class="font-bold text-gray-800">安全な決済</div>
                            <div class="text-gray-600 text-xs">Stripe による安全な決済処理</div>
                        </div>
                    </div>
                    <div class="flex items-start space-x-3">
                        <i class="fas fa-calendar-check text-purple-500 mt-1"></i>
                        <div>
                            <div class="font-bold text-gray-800">日割り計算</div>
                            <div class="text-gray-600 text-xs">プラン変更時は日割りで調整されます</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Payment Method Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-green-100 text-green-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-credit-card"></i>
                </div>
                支払い方法
            </h3>

            <div id="payment-method-display" class="bg-gray-50 rounded-lg p-6 mb-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="bg-white w-16 h-10 rounded border border-gray-200 flex items-center justify-center">
                            <i class="fab fa-cc-visa text-2xl text-blue-600"></i>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">未登録</div>
                            <div class="text-xs text-gray-500">有料プランを選択後に登録できます</div>
                        </div>
                    </div>
                    <button id="btn-manage-payment" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm">
                        <i class="fas fa-cog mr-1"></i> 支払い方法を管理
                    </button>
                </div>
            </div>

            <div class="text-xs text-gray-500 flex items-start space-x-2">
                <i class="fas fa-shield-alt text-green-500 mt-0.5"></i>
                <div>
                    <span class="font-bold text-gray-700">安全な決済処理:</span> 
                    クレジットカード情報は Stripe によって暗号化され、当社のサーバーには保存されません。Visa、Mastercard、American Express、JCB に対応しています。
                </div>
            </div>
        </div>

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

        {/* Plan Selection Modal */}
        <div id="plan-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-2xl font-bold mb-1"><span id="modal-plan-name">スタータープラン</span>を選択</h3>
                            <p class="text-blue-100 text-sm">お支払い情報の確認</p>
                        </div>
                        <button id="btn-close-modal" class="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center transition-all">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div class="p-6">
                    {/* Plan Summary */}
                    <div class="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <div class="text-sm text-blue-600 font-medium mb-1">選択中のプラン</div>
                                <div class="text-3xl font-bold text-blue-900" id="modal-selected-plan">スタータープラン</div>
                            </div>
                            <div class="text-right">
                                <div class="text-4xl font-bold text-blue-900">¥<span id="modal-plan-price">3,000</span></div>
                                <div class="text-sm text-blue-600">/月（税込）</div>
                            </div>
                        </div>
                        <div class="pt-4 border-t border-blue-200">
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div class="text-blue-600 mb-1">商品データダウンロード</div>
                                    <div class="font-bold text-blue-900"><span id="modal-sku-limit">100</span>件/月</div>
                                </div>
                                <div>
                                    <div class="text-blue-600 mb-1">AI画像生成</div>
                                    <div class="font-bold text-blue-900"><span id="modal-ai-limit">100</span>回/月</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Features List */}
                    <div class="mb-6">
                        <h4 class="font-bold text-gray-800 mb-3 flex items-center">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            プランに含まれる機能
                        </h4>
                        <ul id="modal-features-list" class="space-y-2 text-sm text-gray-700">
                            <li class="flex items-start">
                                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                                <span>月間100件までの商品データダウンロード</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                                <span>月間100回までのAI画像生成</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                                <span>超過分は従量課金（松¥100 → 竹¥50 → 梅¥25）</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                                <span>画像エクスポート機能</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                                <span>いつでもプラン変更・キャンセル可能</span>
                            </li>
                        </ul>
                    </div>

                    {/* Billing Information */}
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                        <div class="flex items-start space-x-3">
                            <i class="fas fa-info-circle text-yellow-600 mt-1"></i>
                            <div class="text-sm">
                                <div class="font-bold text-yellow-900 mb-1">請求について</div>
                                <ul class="text-yellow-800 space-y-1">
                                    <li>• 初回請求は本日から開始されます</li>
                                    <li>• 次回更新日: <span class="font-bold" id="modal-next-billing-date">2026年4月10日</span></li>
                                    <li>• プラン変更時は日割り計算で調整されます</li>
                                    <li>• いつでもキャンセル可能（即時停止、返金なし）</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div class="flex space-x-4">
                        <button id="btn-modal-cancel" class="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-300 transition-all">
                            キャンセル
                        </button>
                        <button id="btn-modal-confirm" class="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-bold hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-300 transition-all transform hover:scale-105">
                            <i class="fas fa-lock mr-2"></i>
                            Stripe決済へ進む
                        </button>
                    </div>

                    {/* Security Notice */}
                    <div class="mt-6 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
                        <i class="fas fa-shield-alt text-green-500 mr-1"></i>
                        安全な決済処理（SSL暗号化 / PCI DSS準拠）
                    </div>
                </div>
            </div>
        </div>

        {/* JavaScript for Plan Selection */}
        <script src="/static/billing/plan-selection.js"></script>
    </Layout>
  )
})

export default settings

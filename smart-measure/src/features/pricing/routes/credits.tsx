import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'

const credits = new Hono<AppEnv>()

credits.get('/pricing/credits', (c) => {
  return c.render(
    <Layout active="pricing" title="クレジット購入プラン">
        <div class="mb-8">
            <p class="text-gray-500">必要な分だけクレジットを購入。有効期限なしでいつでも使えます。</p>
        </div>

        {/* Credit Balance Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 text-white w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-coins"></i>
                </div>
                クレジット残高
            </h3>
            
            <div id="credit-summary" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Purchased */}
                <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-green-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-shopping-cart"></i>
                        </div>
                        <span class="text-xs bg-green-600 text-white px-3 py-1 rounded-full font-bold">購入済み</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-green-700 font-medium mb-1">総購入クレジット</div>
                        <div class="flex items-baseline">
                            <span id="total-credits" class="text-4xl font-bold text-green-900">-</span>
                            <span class="text-lg text-green-700 ml-2">枚</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-green-300 mt-4">
                        <div class="text-xs text-green-700">
                            <div class="flex justify-between mb-1">
                                <span>購入金額合計</span>
                                <span id="total-purchase-amount" class="font-semibold">¥-</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Used This Month */}
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-blue-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <span class="text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold">今月使用</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-blue-700 font-medium mb-1">今月の使用クレジット</div>
                        <div class="flex items-baseline">
                            <span id="used-credits-month" class="text-4xl font-bold text-blue-900">-</span>
                            <span class="text-lg text-blue-700 ml-2">枚</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-blue-300 mt-4">
                        <div class="text-xs text-blue-700 space-y-1">
                            <div class="flex justify-between">
                                <span><i class="fas fa-download mr-1"></i>ダウンロード</span>
                                <span id="downloads-count" class="font-semibold">- 枚</span>
                            </div>
                            <div class="flex justify-between">
                                <span><i class="fas fa-magic mr-1"></i>AI生成</span>
                                <span id="ai-generation-count" class="font-semibold">- 回</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Remaining Balance */}
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-purple-600 text-white w-10 h-10 rounded-lg flex items-center justify-center">
                            <i class="fas fa-wallet"></i>
                        </div>
                        <span class="text-xs bg-purple-600 text-white px-3 py-1 rounded-full font-bold">残高</span>
                    </div>
                    <div class="mb-2">
                        <div class="text-sm text-purple-700 font-medium mb-1">残りクレジット</div>
                        <div class="flex items-baseline">
                            <span id="remaining-credits" class="text-4xl font-bold text-purple-900">-</span>
                            <span class="text-lg text-purple-700 ml-2">枚</span>
                        </div>
                    </div>
                    <div class="pt-4 border-t border-purple-300 mt-4">
                        <div class="text-xs text-purple-700">
                            <div class="flex items-center mb-2">
                                <i class="fas fa-infinity text-purple-600 mr-2"></i>
                                <span>有効期限なし</span>
                            </div>
                            <button onclick="window.location.href='/pricing/credits/history'" class="text-purple-600 hover:text-purple-800 font-medium flex items-center">
                                <i class="fas fa-history mr-1"></i>
                                購入履歴を見る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Credit Purchase Plans Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 text-white w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-tags"></i>
                </div>
                クレジット購入プラン
                <span class="ml-3 text-sm text-gray-500 font-normal">お得な割引パック</span>
            </h3>

            {/* Credit Plans Grid */}
            <div id="credit-plans-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* Plans will be generated by JavaScript */}
            </div>

            {/* Additional Info */}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-6 border-t border-gray-200">
                <div class="text-center">
                    <div class="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                        <i class="fas fa-infinity text-green-600 text-xl"></i>
                    </div>
                    <div class="text-sm font-semibold text-gray-800 mb-1">有効期限なし</div>
                    <div class="text-xs text-gray-600">購入したクレジットはいつでも使えます</div>
                </div>
                <div class="text-center">
                    <div class="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                        <i class="fas fa-shield-alt text-blue-600 text-xl"></i>
                    </div>
                    <div class="text-sm font-semibold text-gray-800 mb-1">安全な決済</div>
                    <div class="text-xs text-gray-600">Stripeによる安全な決済処理</div>
                </div>
                <div class="text-center">
                    <div class="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                        <i class="fas fa-percent text-purple-600 text-xl"></i>
                    </div>
                    <div class="text-sm font-semibold text-gray-800 mb-1">最大63% OFF</div>
                    <div class="text-xs text-gray-600">まとめ買いでお得に購入</div>
                </div>
            </div>
        </div>

        {/* Payment Method Section */}
        <div class="bg-white border border-gray-200 rounded-xl p-6">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 text-white w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                    <i class="fas fa-credit-card"></i>
                </div>
                お支払い方法
            </h3>
            
            <div class="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                <div class="flex items-center">
                    <div class="text-gray-400 mr-4 flex space-x-2">
                        <i class="fab fa-cc-visa text-2xl"></i>
                        <i class="fab fa-cc-mastercard text-2xl"></i>
                        <i class="fab fa-cc-amex text-2xl"></i>
                        <i class="fab fa-cc-jcb text-2xl"></i>
                    </div>
                    <div id="payment-method-info">
                        <div class="text-sm font-medium text-gray-800">カード未登録</div>
                        <div class="text-xs text-gray-500">安全な決済にはクレジットカードの登録が必要です</div>
                    </div>
                </div>
                <button 
                    id="manage-payment-method-btn"
                    onclick="window.planSelection.openPaymentPortal()"
                    class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center">
                    <i class="fas fa-cog mr-2"></i>
                    カード管理
                </button>
            </div>
            
            <div class="mt-4 text-xs text-gray-500 flex items-start">
                <i class="fas fa-lock text-green-600 mr-2 mt-0.5"></i>
                <div>
                    すべての支払い情報は Stripe により暗号化され、当社サーバーに保存されることはありません。
                </div>
            </div>
        </div>

        {/* Credit Plan Selection Modal (will be shown by JavaScript) */}
        <div id="credit-plan-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xl font-bold text-gray-800" id="modal-plan-name">クレジット購入</h3>
                        <button onclick="window.planSelection.closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div class="p-6">
                    {/* Plan Details */}
                    <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 mb-6">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <div class="text-sm text-gray-600 mb-1">購入クレジット</div>
                                <div class="flex items-baseline">
                                    <span id="modal-credits" class="text-4xl font-bold text-gray-900">-</span>
                                    <span class="text-lg text-gray-600 ml-2">枚</span>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-sm text-gray-600 mb-1">お支払い金額</div>
                                <div class="flex items-baseline justify-end">
                                    <span class="text-2xl font-bold text-gray-900">¥</span>
                                    <span id="modal-price" class="text-4xl font-bold text-gray-900">-</span>
                                </div>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div class="bg-white bg-opacity-50 rounded-lg p-3">
                                <div class="text-gray-600 mb-1">単価</div>
                                <div class="font-semibold text-gray-900" id="modal-unit-price">¥-/枚</div>
                            </div>
                            <div class="bg-white bg-opacity-50 rounded-lg p-3">
                                <div class="text-gray-600 mb-1">割引率</div>
                                <div class="font-semibold text-green-600" id="modal-discount">-</div>
                            </div>
                        </div>
                    </div>

                    {/* Features List */}
                    <div class="mb-6">
                        <div class="text-sm font-semibold text-gray-800 mb-3">プランに含まれる内容</div>
                        <div class="space-y-2 text-sm text-gray-600">
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-600 mr-3"></i>
                                <span><span id="modal-credits-feature">-</span>枚のクレジット</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-infinity text-green-600 mr-3"></i>
                                <span>有効期限なし</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-download text-green-600 mr-3"></i>
                                <span>商品データダウンロード（1クレジット/件）</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-magic text-green-600 mr-3"></i>
                                <span>AI画像生成（1クレジット/回）</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-shield-alt text-green-600 mr-3"></i>
                                <span>安全な決済（Stripe）</span>
                            </div>
                        </div>
                    </div>

                    {/* Purchase Summary */}
                    <div class="bg-gray-50 rounded-xl p-4 mb-6">
                        <div class="text-sm font-semibold text-gray-800 mb-3">購入サマリー</div>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">購入後の残高</span>
                                <span class="font-semibold text-gray-900"><span id="modal-after-balance">-</span> 枚</span>
                            </div>
                            <div class="flex justify-between pt-2 border-t border-gray-200">
                                <span class="text-gray-600">お支払い金額（税込）</span>
                                <span class="font-bold text-gray-900 text-lg">¥<span id="modal-total-price">-</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div class="flex gap-4">
                        <button 
                            onclick="window.planSelection.closeModal()"
                            class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors">
                            キャンセル
                        </button>
                        <button 
                            id="confirm-purchase-btn"
                            onclick="window.planSelection.confirmPlan()"
                            class="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center">
                            <i class="fas fa-shopping-cart mr-2"></i>
                            <span id="confirm-btn-text">購入手続きへ</span>
                        </button>
                    </div>

                    {/* Security Notice */}
                    <div class="mt-4 text-xs text-gray-500 flex items-start">
                        <i class="fas fa-lock text-green-600 mr-2 mt-0.5"></i>
                        <div>
                            購入手続きはStripeの安全な決済ページで行われます。カード情報は当社サーバーに保存されません。
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Load Plan Selection Script */}
        <script src="/static/billing/credit-selection.js"></script>
    </Layout>
  )
})

export default credits

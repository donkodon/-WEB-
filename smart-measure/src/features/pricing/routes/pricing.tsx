import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'

const pricing = new Hono<AppEnv>()

pricing.get('/pricing', (c) => {
  return c.render(
    <Layout active="pricing" title="料金プラン">
        {/* Header */}
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">シンプルで透明な料金体系</h1>
            <p class="text-lg text-gray-600 max-w-3xl mx-auto mb-8">
                あなたにぴったりなプランを見つけよう。いつでもアップグレード、ダウングレード可能です。
            </p>
            
            {/* Tab Switcher */}
            <div class="flex items-center justify-center mb-8">
                <div class="inline-flex bg-gray-100 rounded-lg p-1">
                    <button id="tab-subscription" class="pricing-tab active px-8 py-3 rounded-md font-bold text-sm transition-all bg-white shadow-sm">
                        サブスクリプション
                    </button>
                    <button id="tab-payasyougo" class="pricing-tab px-8 py-3 rounded-md font-bold text-sm transition-all text-gray-600">
                        都度払い
                    </button>
                </div>
            </div>
        </div>

        {/* Subscription Pricing Cards */}
        <div id="subscription-plans" class="pricing-content">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {/* Free Plan */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">フリー</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$0</span>
                        <span class="text-gray-500 ml-2">/月</span>
                    </div>
                    <div class="mt-4">
                        <button class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all">
                            今すぐ開始
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">1クレジット/月</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">24ドサポート</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">基本ツール</span>
                    </li>
                </ul>
            </div>

            {/* Basic Plan */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">ベーシック</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$9</span>
                        <span class="text-gray-500 ml-2">/月</span>
                    </div>
                    <div class="mt-4">
                        <button class="w-full bg-blue-50 text-blue-600 py-3 rounded-lg font-bold hover:bg-blue-100 transition-all">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">10クレジット/月</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">ロゴウォーター</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">商用利用権限</span>
                    </li>
                </ul>
            </div>

            {/* Pro Plan - Popular */}
            <div class="bg-white border-4 border-blue-500 rounded-2xl p-6 shadow-2xl relative transform scale-105">
                <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span class="bg-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                        人気
                    </span>
                </div>
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-blue-600 mb-2">プロ</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$29</span>
                        <span class="text-gray-500 ml-2">/月</span>
                    </div>
                    <div class="mt-4">
                        <button class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">100クレジット/月</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">ロゴウォーター</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">専用HIサポート</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">AIツール</span>
                    </li>
                </ul>
            </div>

            {/* Business Plan */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">ビジネス</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$49</span>
                        <span class="text-gray-500 ml-2">/月</span>
                    </div>
                    <div class="mt-4">
                        <button class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">250クレジット/月</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">1ロゴウォーター</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">チーム協働機能</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">優先サポート</span>
                    </li>
                </ul>
            </div>
        </div>
        </div>

        {/* Pay-as-you-go Pricing Cards */}
        <div id="payasyougo-plans" class="pricing-content hidden">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {/* Pay-as-you-go Plan 1 */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">スターター</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$15</span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">100クレジット</div>
                    <div class="mt-4">
                        <button class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">100クレジット</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">有効期限なし</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">HDダウンロード</span>
                    </li>
                </ul>
            </div>

            {/* Pay-as-you-go Plan 2 */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">エッセンシャル</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$35</span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">300クレジット</div>
                    <div class="mt-4">
                        <button class="w-full bg-blue-50 text-blue-600 py-3 rounded-lg font-bold hover:bg-blue-100 transition-all">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">300クレジット</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">有効期限なし</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">HDダウンロード</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">商用利用可能</span>
                    </li>
                </ul>
            </div>

            {/* Pay-as-you-go Plan 3 - Popular */}
            <div class="bg-white border-4 border-blue-500 rounded-2xl p-6 shadow-2xl relative transform scale-105">
                <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span class="bg-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                        最も人気
                    </span>
                </div>
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-blue-600 mb-2">プロフェッショナル</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$75</span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">750クレジット</div>
                    <div class="mt-4">
                        <button class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">750クレジット</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">有効期限なし</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">HDダウンロード</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">商用利用可能</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">APIアクセス</span>
                    </li>
                </ul>
            </div>

            {/* Pay-as-you-go Plan 4 */}
            <div class="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
                <div class="text-center mb-6">
                    <h3 class="text-lg font-bold text-gray-700 mb-2">エンタープライズ</h3>
                    <div class="flex items-baseline justify-center">
                        <span class="text-4xl font-bold text-gray-900">$150</span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">1,800クレジット</div>
                    <div class="mt-4">
                        <button class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all">
                            購入する
                        </button>
                    </div>
                </div>
                <ul class="space-y-3 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">1,800クレジット</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">有効期限なし</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">HDダウンロード</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">チーム機能</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">優先サポート</span>
                    </li>
                </ul>
            </div>
        </div>
        </div>

        {/* Bulk Plan Section */}
        <div class="bg-white border border-gray-200 rounded-2xl p-8 mb-16">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-8">大ボリューム・法人向けプラン</h2>
            
            <div class="max-w-2xl mx-auto">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex-1">
                        <label class="text-sm text-gray-600 mb-2 block">月間クレジット数を選択</label>
                        <select class="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                            <option>500クレジット</option>
                            <option>1,000クレジット</option>
                            <option>2,500クレジット</option>
                            <option>5,000クレジット</option>
                            <option>10,000クレジット</option>
                        </select>
                    </div>
                    <div class="ml-8 text-right">
                        <div class="text-sm text-gray-600 mb-2">お見積もり</div>
                        <div class="text-4xl font-bold text-blue-600">¥9,800</div>
                        <div class="text-sm text-gray-500">/月</div>
                    </div>
                </div>

                <ul class="space-y-3 mb-6 text-sm">
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">チームで使える複数ユーザーライセンス</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">全ビル/ツールとサービス</span>
                    </li>
                    <li class="flex items-start">
                        <i class="fas fa-check text-blue-500 mr-2 mt-0.5"></i>
                        <span class="text-gray-700">0%へサービスと無制限</span>
                    </li>
                </ul>

                <button class="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition-all shadow-lg">
                    このプランを申し込む
                </button>
            </div>
        </div>

        {/* FAQ Section */}
        <div class="mb-16">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-8">よくある質問</h2>
            
            <div class="max-w-4xl mx-auto space-y-4">
                {/* FAQ 1 */}
                <div class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all">
                    <div class="flex items-start">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                            <i class="fas fa-question text-blue-600"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-900 mb-2">クレジットの有効期限はどうなっていますか？</h3>
                            <p class="text-gray-600 text-sm">
                                ご購入クレジットは次の更新日まで有効です。サブスクリプションプランの場合は毎月リセットされ、未使用クレジットは繰り越せません。買い切りクレジットは購入から1年間有効です。
                            </p>
                        </div>
                    </div>
                </div>

                {/* FAQ 2 */}
                <div class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all">
                    <div class="flex items-start">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                            <i class="fas fa-sync-alt text-blue-600"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-900 mb-2">いつでも料金プランを変更できますか？</h3>
                            <p class="text-gray-600 text-sm">
                                はい、サブスクリプションプランはいつでもアップグレード・ダウングレード可能です。プラン変更時は日割り計算で調整されますので、ご安心ください。
                            </p>
                        </div>
                    </div>
                </div>

                {/* FAQ 3 */}
                <div class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-all">
                    <div class="flex items-start">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                            <i class="fas fa-graduation-cap text-blue-600"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-900 mb-2">どのようなお支払い方法がありますか？</h3>
                            <p class="text-gray-600 text-sm">
                                クレジットカード（Visa、Mastercard、American Express、JCB）に対応しています。全ての決済は Stripe による安全な処理で行われ、シスPay、Google Pay、Apple Pay もご利用いただけます。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* CTA Section */}
        <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-12 text-center text-white mb-8">
            <h2 class="text-3xl font-bold mb-4">まだ決断中無料登録はこちら</h2>
            <p class="text-lg text-blue-100 mb-6 max-w-2xl mx-auto">
                お客様のニーズに合わせたプランをご提案いたします。まずは無料プランから始めて、いつでもアップグレード可能です。
            </p>
            <div class="flex items-center justify-center space-x-4">
                <button class="bg-white text-blue-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-50 transition-all shadow-lg">
                    <i class="fas fa-envelope mr-2"></i>
                    お問い合わせはこちら
                </button>
                <button class="bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-800 transition-all border-2 border-white">
                    <i class="fas fa-rocket mr-2"></i>
                    今すぐ始める
                </button>
            </div>
        </div>

        {/* Features Comparison Section */}
        <div class="bg-gray-50 border border-gray-200 rounded-2xl p-8">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-8">全プラン共通の機能</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-chart-line text-2xl text-blue-600"></i>
                    </div>
                    <h3 class="font-bold text-gray-900 mb-2">HD画像の出力</h3>
                    <p class="text-sm text-gray-600">
                        すべてのプランで高品質なHD画像の出力が可能です。プロフェッショナルな仕上がりをお約束します。
                    </p>
                </div>
                
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-layer-group text-2xl text-blue-600"></i>
                    </div>
                    <h3 class="font-bold text-gray-900 mb-2">一括バッチ処理</h3>
                    <p class="text-sm text-gray-600">
                        一度に複数の画像を処理し、作業効率を大幅に向上。時間を節約し、より多くの仕事をこなせます。
                    </p>
                </div>
                
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-cog text-2xl text-blue-600"></i>
                    </div>
                    <h3 class="font-bold text-gray-900 mb-2">API連携</h3>
                    <p class="text-sm text-gray-600">
                        既存のワークフローに統合。自動化スクリプトやカスタマイズツールと連携可能です。
                    </p>
                </div>
            </div>
        </div>

        {/* Tab Switching JavaScript */}
        <script>{`
            document.addEventListener('DOMContentLoaded', function() {
                const tabSubscription = document.getElementById('tab-subscription');
                const tabPayAsYouGo = document.getElementById('tab-payasyougo');
                const subscriptionPlans = document.getElementById('subscription-plans');
                const payAsYouGoPlans = document.getElementById('payasyougo-plans');
                
                function switchTab(tab) {
                    if (tab === 'subscription') {
                        // Subscription tab active
                        tabSubscription.classList.add('active', 'bg-white', 'shadow-sm', 'text-gray-900');
                        tabSubscription.classList.remove('text-gray-600');
                        tabPayAsYouGo.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-900');
                        tabPayAsYouGo.classList.add('text-gray-600');
                        
                        subscriptionPlans.classList.remove('hidden');
                        payAsYouGoPlans.classList.add('hidden');
                    } else {
                        // Pay-as-you-go tab active
                        tabPayAsYouGo.classList.add('active', 'bg-white', 'shadow-sm', 'text-gray-900');
                        tabPayAsYouGo.classList.remove('text-gray-600');
                        tabSubscription.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-900');
                        tabSubscription.classList.add('text-gray-600');
                        
                        payAsYouGoPlans.classList.remove('hidden');
                        subscriptionPlans.classList.add('hidden');
                    }
                }
                
                tabSubscription.addEventListener('click', () => switchTab('subscription'));
                tabPayAsYouGo.addEventListener('click', () => switchTab('payasyougo'));
            });
        `}</script>

        {/* CSS for Tab Styling */}
        <style>{`
            .pricing-tab {
                cursor: pointer;
            }
            .pricing-tab.active {
                font-weight: 600;
            }
            .pricing-content {
                animation: fadeIn 0.3s ease-in;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `}</style>
    </Layout>
  )
})

export default pricing

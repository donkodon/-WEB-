/**
 * Plan Selection UI Handler - Subscription + Credit Purchase
 * Handles subscription plans and credit purchase with new pricing
 */

(function() {
    'use strict';

    // ============================================
    // Plan Configuration - Subscription (13 plans)
    // ============================================
    const SUBSCRIPTION_PLANS = [
        { qty: 50, price: 880, priceId: 'price_sub_50', popular: false },
        { qty: 200, price: 3300, priceId: 'price_sub_200', popular: true },
        { qty: 500, price: 7700, priceId: 'price_sub_500', popular: false },
        { qty: 1000, price: 13500, priceId: 'price_sub_1000', popular: false },
        { qty: 2500, price: 28000, priceId: 'price_sub_2500', popular: false },
        { qty: 5000, price: 44000, priceId: 'price_sub_5000', popular: true },
        { qty: 7500, price: 60000, priceId: 'price_sub_7500', popular: false },
        { qty: 10000, price: 77000, priceId: 'price_sub_10000', popular: false },
        { qty: 15000, price: 99000, priceId: 'price_sub_15000', popular: false },
        { qty: 25000, price: 150000, priceId: 'price_sub_25000', popular: false },
        { qty: 50000, price: 275000, priceId: 'price_sub_50000', popular: false },
        { qty: 75000, price: 412500, priceId: 'price_sub_75000', popular: false },
        { qty: 100000, price: 550000, priceId: 'price_sub_100000', popular: true }
    ];

    // ============================================
    // Plan Configuration - Credit Purchase (7 plans)
    // ============================================
    const CREDIT_PLANS = [
        { qty: 40, price: 880, priceId: 'price_credit_40', discount: 0 },
        { qty: 200, price: 3465, priceId: 'price_credit_200', discount: 21 },
        { qty: 500, price: 8085, priceId: 'price_credit_500', discount: 26 },
        { qty: 1000, price: 14175, priceId: 'price_credit_1000', discount: 35 },
        { qty: 2500, price: 30800, priceId: 'price_credit_2500', discount: 44 },
        { qty: 5000, price: 48400, priceId: 'price_credit_5000', discount: 56 },
        { qty: 10000, price: 80850, priceId: 'price_credit_10000', discount: 63 }
    ];

    // ============================================
    // State
    // ============================================
    let currentTab = 'subscription'; // 'subscription' or 'credits'
    let selectedPlan = null;
    let selectedType = null; // 'subscription' or 'credit'

    // ============================================
    // DOM Elements
    // ============================================
    const tabSubscription = document.getElementById('tab-subscription');
    const tabCredits = document.getElementById('tab-credits');
    const subscriptionContent = document.getElementById('subscription-content');
    const creditsContent = document.getElementById('credits-content');
    const subscriptionPlansGrid = document.getElementById('subscription-plans-grid');
    const creditsPlansGrid = document.getElementById('credits-plans-grid');
    const btnBuyCredits = document.getElementById('btn-buy-credits');
    
    const modal = document.getElementById('plan-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');
    
    const btnManagePayment = document.getElementById('btn-manage-payment');

    // ============================================
    // Tab Switching
    // ============================================
    function switchTab(tab) {
        currentTab = tab;

        if (tab === 'subscription') {
            tabSubscription.classList.add('active', 'bg-purple-600', 'text-white');
            tabSubscription.classList.remove('text-gray-700');
            tabCredits.classList.remove('active', 'bg-purple-600', 'text-white');
            tabCredits.classList.add('text-gray-700');
            
            subscriptionContent.classList.remove('hidden');
            creditsContent.classList.add('hidden');
        } else {
            tabCredits.classList.add('active', 'bg-green-600', 'text-white');
            tabCredits.classList.remove('text-gray-700');
            tabSubscription.classList.remove('active', 'bg-purple-600', 'text-white');
            tabSubscription.classList.add('text-gray-700');
            
            creditsContent.classList.remove('hidden');
            subscriptionContent.classList.add('hidden');
        }

        console.log(`[plan-selection] Switched to ${tab} tab`);
    }

    // ============================================
    // Plan Card Generation
    // ============================================
    function generateSubscriptionCard(plan) {
        const unitPrice = (plan.price / plan.qty).toFixed(1);
        const popularBadge = plan.popular ? `
            <div class="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg transform rotate-12">
                <i class="fas fa-fire mr-1"></i> 人気
            </div>
        ` : '';

        return `
            <div class="plan-card relative bg-white border-2 ${plan.popular ? 'border-purple-400' : 'border-gray-200'} rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer transform hover:scale-105" 
                 data-plan-type="subscription" 
                 data-price-id="${plan.priceId}" 
                 data-qty="${plan.qty}" 
                 data-price="${plan.price}">
                ${popularBadge}
                <div class="text-center mb-3">
                    <div class="text-3xl font-bold text-purple-900">${plan.qty.toLocaleString()}</div>
                    <div class="text-xs text-gray-500">枚/月</div>
                </div>
                <div class="text-center mb-3 pb-3 border-b border-gray-200">
                    <div class="text-2xl font-bold text-gray-900">¥${plan.price.toLocaleString()}</div>
                    <div class="text-xs text-gray-500">/月（税込）</div>
                </div>
                <div class="text-center text-xs text-gray-600 mb-3">
                    <i class="fas fa-tag mr-1 text-purple-500"></i>
                    単価: <strong>¥${unitPrice}</strong>/枚
                </div>
                <button class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:from-purple-700 hover:to-indigo-700 transition-all">
                    <i class="fas fa-check-circle mr-1"></i> 選択する
                </button>
            </div>
        `;
    }

    function generateCreditCard(plan) {
        const unitPrice = (plan.price / plan.qty).toFixed(1);
        const discountBadge = plan.discount > 0 ? `
            <div class="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                ${plan.discount}% OFF
            </div>
        ` : '';

        return `
            <div class="plan-card relative bg-white border-2 border-gray-200 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer transform hover:scale-105" 
                 data-plan-type="credit" 
                 data-price-id="${plan.priceId}" 
                 data-qty="${plan.qty}" 
                 data-price="${plan.price}">
                ${discountBadge}
                <div class="text-center mb-3">
                    <div class="text-3xl font-bold text-green-900">${plan.qty.toLocaleString()}</div>
                    <div class="text-xs text-gray-500">枚（買い切り）</div>
                </div>
                <div class="text-center mb-3 pb-3 border-b border-gray-200">
                    <div class="text-2xl font-bold text-gray-900">¥${plan.price.toLocaleString()}</div>
                    <div class="text-xs text-gray-500">（税込）</div>
                </div>
                <div class="text-center text-xs text-gray-600 mb-3">
                    <i class="fas fa-tag mr-1 text-green-500"></i>
                    単価: <strong>¥${unitPrice}</strong>/枚
                </div>
                <button class="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 rounded-lg font-bold text-sm hover:from-green-700 hover:to-emerald-700 transition-all">
                    <i class="fas fa-shopping-cart mr-1"></i> 購入する
                </button>
            </div>
        `;
    }

    // ============================================
    // Render Plans
    // ============================================
    function renderPlans() {
        // Render subscription plans
        if (subscriptionPlansGrid) {
            subscriptionPlansGrid.innerHTML = SUBSCRIPTION_PLANS.map(plan => 
                generateSubscriptionCard(plan)
            ).join('');
        }

        // Render credit plans
        if (creditsPlansGrid) {
            creditsPlansGrid.innerHTML = CREDIT_PLANS.map(plan => 
                generateCreditCard(plan)
            ).join('');
        }

        // Add click handlers to all plan cards
        document.querySelectorAll('.plan-card').forEach(card => {
            card.addEventListener('click', handlePlanCardClick);
        });

        console.log('[plan-selection] Plans rendered');
    }

    // ============================================
    // Plan Card Click Handler
    // ============================================
    function handlePlanCardClick(e) {
        const card = e.currentTarget;
        const planType = card.dataset.planType;
        const priceId = card.dataset.priceId;
        const qty = parseInt(card.dataset.qty);
        const price = parseInt(card.dataset.price);

        console.log(`[plan-selection] Plan clicked: ${planType}, ${qty} sheets, ¥${price}`);

        selectedPlan = { planType, priceId, qty, price };
        selectedType = planType;

        openModal(selectedPlan);
    }

    // ============================================
    // Modal Management
    // ============================================
    function openModal(plan) {
        if (!plan) return;

        const unitPrice = (plan.price / plan.qty).toFixed(1);
        
        // Update modal content
        const modalTitle = plan.planType === 'subscription' 
            ? `サブスクプラン: ${plan.qty.toLocaleString()}枚/月`
            : `クレジット購入: ${plan.qty.toLocaleString()}枚`;
        
        document.getElementById('modal-plan-name').textContent = modalTitle;
        document.getElementById('modal-selected-plan').textContent = modalTitle;
        document.getElementById('modal-plan-price').textContent = plan.price.toLocaleString();
        document.getElementById('modal-sku-limit').textContent = plan.qty.toLocaleString();
        document.getElementById('modal-ai-limit').textContent = plan.qty.toLocaleString();

        // Update features list based on plan type
        const featuresList = document.getElementById('modal-features-list');
        if (plan.planType === 'subscription') {
            featuresList.innerHTML = `
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>月間${plan.qty.toLocaleString()}枚まで処理可能</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>単価: ¥${unitPrice}/枚（月額固定）</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>毎月自動更新</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>いつでも変更・キャンセル可能</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>日割り計算で調整</span>
                </li>
            `;
        } else {
            featuresList.innerHTML = `
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>${plan.qty.toLocaleString()}枚のクレジットを即時付与</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>単価: ¥${unitPrice}/枚（買い切り）</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>有効期限: 購入日から1年間</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>サブスクとの併用可能</span>
                </li>
                <li class="flex items-start">
                    <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                    <span>使いたい時に使いたい分だけ</span>
                </li>
            `;
        }

        // Update billing date
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 30);
        const formattedDate = nextDate.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('modal-next-billing-date').textContent = formattedDate;

        // Show modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        console.log(`[plan-selection] Modal opened for: ${plan.planType}`);
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
        selectedPlan = null;
        selectedType = null;
        console.log('[plan-selection] Modal closed');
    }

    // ============================================
    // Confirm Plan
    // ============================================
    function handleConfirmPlan() {
        if (!selectedPlan) {
            console.error('[plan-selection] No plan selected');
            return;
        }

        console.log(`[plan-selection] Confirming plan:`, selectedPlan);

        // Disable button and show loading
        btnModalConfirm.disabled = true;
        btnModalConfirm.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 処理中...';

        // TODO: Call API to create Stripe Checkout Session
        setTimeout(() => {
            const planTypeName = selectedPlan.planType === 'subscription' ? 'サブスク' : 'クレジット';
            alert(`${planTypeName}の決済ページへリダイレクトします（Stripe API未実装）\n\nプラン: ${selectedPlan.qty.toLocaleString()}枚\n金額: ¥${selectedPlan.price.toLocaleString()}\nPrice ID: ${selectedPlan.priceId}`);
            
            // Reset button
            btnModalConfirm.disabled = false;
            btnModalConfirm.innerHTML = '<i class="fas fa-lock mr-2"></i> Stripe決済へ進む';
            
            closeModal();
            
            // TODO: Redirect to Stripe Checkout
            // window.location.href = checkoutUrl;
        }, 1000);
    }

    // ============================================
    // Credit Balance Display
    // ============================================
    async function loadCreditBalance() {
        try {
            console.log('[plan-selection] Loading credit balance...');
            
            // TODO: Call API to get credit balance
            // For now, use mock data
            const mockBalance = {
                total: 0,
                used: 0,
                remaining: 0
            };

            document.getElementById('total-credits').textContent = mockBalance.total.toLocaleString();
            document.getElementById('used-credits').textContent = mockBalance.used.toLocaleString();
            document.getElementById('remaining-credits').textContent = mockBalance.remaining.toLocaleString();

            console.log('[plan-selection] Credit balance loaded');

        } catch (error) {
            console.error('[plan-selection] Failed to load credit balance:', error);
        }
    }

    // ============================================
    // Payment Method Management
    // ============================================
    function handleManagePayment() {
        console.log('[plan-selection] Opening payment management portal');
        alert('Stripe Customer Portal へリダイレクトします（API未実装）');
        // TODO: Redirect to Stripe Customer Portal
    }

    // ============================================
    // Event Listeners
    // ============================================
    function initEventListeners() {
        // Tab switching
        if (tabSubscription) {
            tabSubscription.addEventListener('click', () => switchTab('subscription'));
        }
        if (tabCredits) {
            tabCredits.addEventListener('click', () => switchTab('credits'));
        }

        // Buy credits button (switches to credits tab)
        if (btnBuyCredits) {
            btnBuyCredits.addEventListener('click', () => switchTab('credits'));
        }

        // Modal close buttons
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', closeModal);
        }
        if (btnModalCancel) {
            btnModalCancel.addEventListener('click', closeModal);
        }

        // Modal confirm button
        if (btnModalConfirm) {
            btnModalConfirm.addEventListener('click', handleConfirmPlan);
        }

        // Payment method management
        if (btnManagePayment) {
            btnManagePayment.addEventListener('click', handleManagePayment);
        }

        // Close modal on background click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        console.log('[plan-selection] Event listeners initialized');
    }

    // ============================================
    // Initialization
    // ============================================
    function init() {
        console.log('[plan-selection] Initializing plan selection UI...');
        renderPlans();
        loadCreditBalance();
        initEventListeners();
        console.log('[plan-selection] Initialization complete');
        console.log(`[plan-selection] ${SUBSCRIPTION_PLANS.length} subscription plans, ${CREDIT_PLANS.length} credit plans loaded`);
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

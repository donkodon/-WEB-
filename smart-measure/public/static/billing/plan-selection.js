/**
 * Plan Selection UI Handler
 * Handles plan selection modal, plan switching, and Stripe Checkout redirect
 */

(function() {
    'use strict';

    // ============================================
    // Plan Configuration
    // ============================================
    const PLANS = {
        free: {
            name: '無料プラン',
            price: 0,
            priceId: null,
            skuLimit: 10,
            aiLimit: 10,
            features: [
                '月間10件までの商品データダウンロード',
                '月間10回までのAI画像生成',
                '超過時は利用不可',
                '画像エクスポート機能',
                'コミュニティサポート'
            ],
            badge: 'FREE',
            badgeColor: 'bg-gray-600',
            unlimited: false
        },
        starter: {
            name: 'スタータープラン',
            price: 3000,
            priceId: 'price_starter_monthly', // TODO: Replace with actual Stripe Price ID
            skuLimit: 100,
            aiLimit: 100,
            features: [
                '月間100件までの商品データダウンロード',
                '月間100回までのAI画像生成',
                '超過分は従量課金（松¥100 → 竹¥50 → 梅¥25）',
                '画像エクスポート機能',
                'メールサポート'
            ],
            badge: 'STARTER',
            badgeColor: 'bg-blue-600',
            unlimited: false
        },
        business: {
            name: 'ビジネスプラン',
            price: 10000,
            priceId: 'price_business_monthly', // TODO: Replace with actual Stripe Price ID
            skuLimit: 500,
            aiLimit: 500,
            features: [
                '月間500件までの商品データダウンロード',
                '月間500回までのAI画像生成',
                '超過分は従量課金（松¥100 → 竹¥50 → 梅¥25）',
                '画像エクスポート機能',
                '優先サポート（24時間以内返信）'
            ],
            badge: 'BUSINESS',
            badgeColor: 'bg-purple-600',
            unlimited: false
        },
        enterprise: {
            name: 'エンタープライズプラン',
            price: 30000,
            priceId: 'price_enterprise_monthly', // TODO: Replace with actual Stripe Price ID
            skuLimit: '無制限',
            aiLimit: '無制限',
            features: [
                '商品データダウンロード無制限',
                'AI画像生成無制限',
                '従量課金なし（固定料金）',
                '画像エクスポート機能',
                '専任担当者',
                '優先サポート（1時間以内返信）'
            ],
            badge: 'ENTERPRISE',
            badgeColor: 'bg-gradient-to-r from-yellow-500 to-orange-500',
            unlimited: true
        }
    };

    // ============================================
    // State
    // ============================================
    let currentPlan = 'free'; // Will be loaded from API
    let selectedPlan = null;

    // ============================================
    // DOM Elements
    // ============================================
    const modal = document.getElementById('plan-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');
    
    const btnSelectStarter = document.getElementById('btn-select-starter');
    const btnSelectBusiness = document.getElementById('btn-select-business');
    const btnSelectEnterprise = document.getElementById('btn-select-enterprise');
    
    const btnManagePayment = document.getElementById('btn-manage-payment');

    // ============================================
    // Modal Management
    // ============================================
    function openModal(planKey) {
        selectedPlan = planKey;
        const plan = PLANS[planKey];
        
        if (!plan) {
            console.error('Invalid plan key:', planKey);
            return;
        }

        // Update modal content
        document.getElementById('modal-plan-name').textContent = plan.name;
        document.getElementById('modal-selected-plan').textContent = plan.name;
        document.getElementById('modal-plan-price').textContent = plan.price.toLocaleString();
        document.getElementById('modal-sku-limit').textContent = plan.skuLimit;
        document.getElementById('modal-ai-limit').textContent = plan.aiLimit;

        // Update features list
        const featuresList = document.getElementById('modal-features-list');
        featuresList.innerHTML = plan.features.map(feature => `
            <li class="flex items-start">
                <i class="fas fa-check text-green-500 mr-2 mt-1"></i>
                <span>${feature}</span>
            </li>
        `).join('');

        // Calculate next billing date (30 days from today)
        const nextBillingDate = new Date();
        nextBillingDate.setDate(nextBillingDate.getDate() + 30);
        const formattedDate = nextBillingDate.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('modal-next-billing-date').textContent = formattedDate;

        // Show modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        console.log(`[plan-selection] Modal opened for: ${plan.name}`);
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
        selectedPlan = null;
        console.log('[plan-selection] Modal closed');
    }

    // ============================================
    // Plan Selection Handlers
    // ============================================
    function handlePlanSelect(planKey) {
        console.log(`[plan-selection] Plan selected: ${planKey}`);
        
        if (planKey === currentPlan) {
            alert('既に選択中のプランです');
            return;
        }

        openModal(planKey);
    }

    function handleConfirmPlan() {
        if (!selectedPlan) {
            console.error('[plan-selection] No plan selected');
            return;
        }

        const plan = PLANS[selectedPlan];
        console.log(`[plan-selection] Confirming plan: ${plan.name}`);

        // Disable button and show loading
        btnModalConfirm.disabled = true;
        btnModalConfirm.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 処理中...';

        // TODO: Call API to create Stripe Checkout Session
        // For now, just show alert
        setTimeout(() => {
            alert(`${plan.name}の決済ページへリダイレクトします（Stripe API未実装）\n\nStripe Checkout Session ID: cs_test_xxxxx\nPrice ID: ${plan.priceId}`);
            
            // Reset button
            btnModalConfirm.disabled = false;
            btnModalConfirm.innerHTML = '<i class="fas fa-lock mr-2"></i> Stripe決済へ進む';
            
            closeModal();
            
            // TODO: Redirect to Stripe Checkout
            // window.location.href = checkoutUrl;
        }, 1000);
    }

    // ============================================
    // Payment Method Management
    // ============================================
    function handleManagePayment() {
        console.log('[plan-selection] Opening payment management portal');
        
        // TODO: Call API to create Stripe Customer Portal Session
        alert('Stripe Customer Portal へリダイレクトします（API未実装）\n\n支払い方法の追加・変更・削除、請求書の確認ができます。');
        
        // TODO: Redirect to Stripe Customer Portal
        // window.location.href = portalUrl;
    }

    // ============================================
    // Current Plan Display
    // ============================================
    async function loadCurrentPlan() {
        try {
            console.log('[plan-selection] Loading current plan...');
            
            // TODO: Call API to get current plan
            // For now, use mock data
            const mockPlan = {
                planType: 'free',
                status: 'active',
                usageCount: 0,
                renewalDate: null
            };

            currentPlan = mockPlan.planType;
            const plan = PLANS[currentPlan];

            // Update current plan display
            document.getElementById('current-plan-name').textContent = plan.name;
            document.getElementById('current-plan-price').textContent = `¥${plan.price.toLocaleString()}/月`;
            document.getElementById('current-plan-badge').innerHTML = `
                <i class="fas fa-${currentPlan === 'free' ? 'gift' : 'crown'} mr-1"></i> ${plan.badge}
            `;
            document.getElementById('current-plan-badge').className = `inline-block px-4 py-2 ${plan.badgeColor} text-white rounded-full text-sm font-bold`;

            // Update usage
            document.getElementById('plan-usage-count').textContent = mockPlan.usageCount;

            // Update renewal date
            if (mockPlan.renewalDate) {
                document.getElementById('plan-renewal-date').textContent = mockPlan.renewalDate;
            } else {
                document.getElementById('plan-renewal-date').textContent = '-';
            }

            console.log(`[plan-selection] Current plan loaded: ${plan.name}`);

        } catch (error) {
            console.error('[plan-selection] Failed to load current plan:', error);
        }
    }

    // ============================================
    // Event Listeners
    // ============================================
    function initEventListeners() {
        // Plan selection buttons
        if (btnSelectStarter) {
            btnSelectStarter.addEventListener('click', () => handlePlanSelect('starter'));
        }
        if (btnSelectBusiness) {
            btnSelectBusiness.addEventListener('click', () => handlePlanSelect('business'));
        }
        if (btnSelectEnterprise) {
            btnSelectEnterprise.addEventListener('click', () => handlePlanSelect('enterprise'));
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
        initEventListeners();
        loadCurrentPlan();
        console.log('[plan-selection] Initialization complete');
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

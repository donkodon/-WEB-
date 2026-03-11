/**
 * Credit Purchase Plan Selection and Modal Management
 * Handles one-time credit purchase plan display and Stripe checkout
 */

// Credit Purchase Plans (7 plans)
const CREDIT_PLANS = [
  {
    id: 'credit_40',
    credits: 40,
    price: 880,
    stripePriceId: 'price_credit_40_onetime',
    popular: false
  },
  {
    id: 'credit_200',
    credits: 200,
    price: 3465,
    stripePriceId: 'price_credit_200_onetime',
    popular: true // Most popular starter pack
  },
  {
    id: 'credit_500',
    credits: 500,
    price: 8085,
    stripePriceId: 'price_credit_500_onetime',
    popular: false
  },
  {
    id: 'credit_1000',
    credits: 1000,
    price: 14175,
    stripePriceId: 'price_credit_1000_onetime',
    popular: false
  },
  {
    id: 'credit_2500',
    credits: 2500,
    price: 30800,
    stripePriceId: 'price_credit_2500_onetime',
    popular: true // Most popular for regular users
  },
  {
    id: 'credit_5000',
    credits: 5000,
    price: 48400,
    stripePriceId: 'price_credit_5000_onetime',
    popular: false
  },
  {
    id: 'credit_10000',
    credits: 10000,
    price: 80850,
    stripePriceId: 'price_credit_10000_onetime',
    popular: true // Most popular for business
  }
];

// Base unit price for discount calculation (¥22.0 per credit)
const BASE_UNIT_PRICE = 22.0;

// Calculate unit price and discount
function calculatePricing(credits, price) {
  const unitPrice = price / credits;
  const discountPercent = Math.round((1 - unitPrice / BASE_UNIT_PRICE) * 100);
  
  return {
    unitPrice: unitPrice.toFixed(1),
    discount: discountPercent > 0 ? discountPercent : 0
  };
}

// Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Generate plan card HTML
function generatePlanCard(plan) {
  const pricing = calculatePricing(plan.credits, plan.price);
  const popularBadge = plan.popular ? 
    '<div class="absolute -top-3 -right-3 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg transform rotate-12">人気</div>' : '';
  const discountBadge = pricing.discount > 0 ? 
    `<div class="absolute -top-3 left-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">${pricing.discount}% OFF</div>` : '';
  
  return `
    <div class="relative bg-white border-2 ${plan.popular ? 'border-green-500 shadow-xl' : 'border-gray-200'} rounded-xl p-6 hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer"
         onclick="window.planSelection.selectPlan('${plan.id}')">
      ${popularBadge}
      ${discountBadge}
      
      <div class="text-center mb-4">
        <div class="text-sm text-gray-600 mb-2">クレジット購入</div>
        <div class="flex items-baseline justify-center mb-2">
          <span class="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">${formatNumber(plan.credits)}</span>
          <span class="text-lg text-gray-600 ml-2">枚</span>
        </div>
        <div class="flex items-baseline justify-center mb-3">
          <span class="text-2xl font-bold text-gray-900">¥</span>
          <span class="text-3xl font-bold text-gray-900">${formatNumber(plan.price)}</span>
        </div>
        <div class="text-sm text-gray-500">
          <i class="fas fa-calculator mr-1"></i>
          単価: <span class="font-semibold text-gray-700">¥${pricing.unitPrice}</span>/枚
        </div>
      </div>
      
      <div class="space-y-2 text-sm text-gray-600 mb-6">
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-600 mr-2 w-4"></i>
          <span>${formatNumber(plan.credits)}枚のクレジット</span>
        </div>
        <div class="flex items-center">
          <i class="fas fa-infinity text-green-600 mr-2 w-4"></i>
          <span>有効期限なし</span>
        </div>
        <div class="flex items-center">
          <i class="fas fa-download text-green-600 mr-2 w-4"></i>
          <span>商品データダウンロード</span>
        </div>
        <div class="flex items-center">
          <i class="fas fa-magic text-green-600 mr-2 w-4"></i>
          <span>AI画像生成</span>
        </div>
      </div>
      
      <button class="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center">
        <i class="fas fa-shopping-cart mr-2"></i>
        購入する
      </button>
    </div>
  `;
}

// Plan Selection Manager
window.planSelection = {
  currentPlan: null,
  currentBalance: 0,
  
  // Initialize
  init: function() {
    console.log('🚀 [credit-selection] Initializing credit plan selection...');
    this.renderPlans();
    this.loadCreditBalance();
    this.setupModalHandlers();
  },
  
  // Render all credit plans
  renderPlans: function() {
    const grid = document.getElementById('credit-plans-grid');
    if (!grid) {
      console.error('❌ [credit-selection] Plans grid container not found');
      return;
    }
    
    const plansHTML = CREDIT_PLANS.map(plan => generatePlanCard(plan)).join('');
    grid.innerHTML = plansHTML;
    
    console.log(`✅ [credit-selection] Rendered ${CREDIT_PLANS.length} credit plans`);
  },
  
  // Load current credit balance from API
  loadCreditBalance: async function() {
    try {
      console.log('📡 [credit-selection] Loading credit balance...');
      
      // Mock API call - replace with actual API endpoint
      const response = await fetch('/api/billing/credit-balance');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update UI
      document.getElementById('total-credits').textContent = formatNumber(data.totalPurchased || 0);
      document.getElementById('total-purchase-amount').textContent = `¥${formatNumber(data.totalAmount || 0)}`;
      document.getElementById('used-credits-month').textContent = formatNumber(data.usedThisMonth || 0);
      document.getElementById('downloads-count').textContent = `${formatNumber(data.downloads || 0)} 枚`;
      document.getElementById('ai-generation-count').textContent = `${formatNumber(data.aiGeneration || 0)} 回`;
      document.getElementById('remaining-credits').textContent = formatNumber(data.remaining || 0);
      
      this.currentBalance = data.remaining || 0;
      
      console.log('✅ [credit-selection] Credit balance loaded:', data);
      
    } catch (error) {
      console.warn('⚠️ [credit-selection] Failed to load credit balance (using mock data):', error.message);
      
      // Mock data for development
      const mockData = {
        totalPurchased: 500,
        totalAmount: 8085,
        usedThisMonth: 45,
        downloads: 30,
        aiGeneration: 15,
        remaining: 455
      };
      
      document.getElementById('total-credits').textContent = formatNumber(mockData.totalPurchased);
      document.getElementById('total-purchase-amount').textContent = `¥${formatNumber(mockData.totalAmount)}`;
      document.getElementById('used-credits-month').textContent = formatNumber(mockData.usedThisMonth);
      document.getElementById('downloads-count').textContent = `${formatNumber(mockData.downloads)} 枚`;
      document.getElementById('ai-generation-count').textContent = `${formatNumber(mockData.aiGeneration)} 回`;
      document.getElementById('remaining-credits').textContent = formatNumber(mockData.remaining);
      
      this.currentBalance = mockData.remaining;
    }
  },
  
  // Setup modal event handlers
  setupModalHandlers: function() {
    const modal = document.getElementById('credit-plan-modal');
    if (!modal) return;
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        this.closeModal();
      }
    });
    
    console.log('✅ [credit-selection] Modal handlers setup complete');
  },
  
  // Select a plan and show modal
  selectPlan: function(planId) {
    const plan = CREDIT_PLANS.find(p => p.id === planId);
    if (!plan) {
      console.error('❌ [credit-selection] Plan not found:', planId);
      return;
    }
    
    this.currentPlan = plan;
    const pricing = calculatePricing(plan.credits, plan.price);
    const afterBalance = this.currentBalance + plan.credits;
    
    console.log('📋 [credit-selection] Plan selected:', {
      id: plan.id,
      credits: plan.credits,
      price: plan.price,
      unitPrice: pricing.unitPrice,
      discount: pricing.discount
    });
    
    // Update modal content
    document.getElementById('modal-plan-name').textContent = `クレジット購入: ${formatNumber(plan.credits)}枚`;
    document.getElementById('modal-credits').textContent = formatNumber(plan.credits);
    document.getElementById('modal-price').textContent = formatNumber(plan.price);
    document.getElementById('modal-unit-price').textContent = `¥${pricing.unitPrice}/枚`;
    document.getElementById('modal-discount').textContent = pricing.discount > 0 ? `${pricing.discount}% OFF` : '通常価格';
    document.getElementById('modal-credits-feature').textContent = formatNumber(plan.credits);
    document.getElementById('modal-after-balance').textContent = formatNumber(afterBalance);
    document.getElementById('modal-total-price').textContent = formatNumber(plan.price);
    
    // Show modal with fade-in animation
    const modal = document.getElementById('credit-plan-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('animate-fadeIn');
    }, 10);
  },
  
  // Close modal
  closeModal: function() {
    const modal = document.getElementById('credit-plan-modal');
    modal.classList.add('hidden');
    modal.classList.remove('animate-fadeIn');
    this.currentPlan = null;
    
    console.log('🔒 [credit-selection] Modal closed');
  },
  
  // Confirm plan and redirect to Stripe Checkout
  confirmPlan: async function() {
    if (!this.currentPlan) {
      console.error('❌ [credit-selection] No plan selected');
      return;
    }
    
    const btn = document.getElementById('confirm-purchase-btn');
    const btnText = document.getElementById('confirm-btn-text');
    
    // Show loading state
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>決済ページへ移動中...';
    
    try {
      console.log('🔄 [credit-selection] Creating Stripe Checkout session...', {
        planId: this.currentPlan.id,
        stripePriceId: this.currentPlan.stripePriceId,
        credits: this.currentPlan.credits,
        price: this.currentPlan.price
      });
      
      // Call API to create Stripe Checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          priceId: this.currentPlan.stripePriceId,
          mode: 'payment', // One-time payment
          successUrl: window.location.origin + '/pricing/credits?success=true',
          cancelUrl: window.location.origin + '/pricing/credits?canceled=true',
          metadata: {
            planId: this.currentPlan.id,
            credits: this.currentPlan.credits,
            type: 'credit_purchase'
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('Checkout URL not returned from API');
      }
      
      console.log('✅ [credit-selection] Stripe Checkout session created');
      console.log('🔗 [credit-selection] Redirecting to:', data.url);
      
      // Redirect to Stripe Checkout
      window.location.href = data.url;
      
    } catch (error) {
      console.error('❌ [credit-selection] Stripe Checkout failed:', error);
      
      // Show error alert
      alert('決済ページへの移動に失敗しました。\n\n' + 
            'Stripe APIがまだ統合されていません。\n' +
            '以下の情報をご確認ください:\n\n' +
            `プラン: ${formatNumber(this.currentPlan.credits)}枚\n` +
            `金額: ¥${formatNumber(this.currentPlan.price)}\n` +
            `Stripe Price ID: ${this.currentPlan.stripePriceId}`);
      
      // Reset button state
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btnText.innerHTML = '<i class="fas fa-shopping-cart mr-2"></i>購入手続きへ';
    }
  },
  
  // Open Stripe Customer Portal for payment method management
  openPaymentPortal: async function() {
    try {
      console.log('🔄 [credit-selection] Opening Stripe Customer Portal...');
      
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('Portal URL not returned');
      }
      
      console.log('✅ [credit-selection] Redirecting to Stripe Customer Portal');
      window.location.href = data.url;
      
    } catch (error) {
      console.error('❌ [credit-selection] Failed to open payment portal:', error);
      alert('お支払い方法の管理ページを開けませんでした。\n\nStripe Customer Portalがまだ統合されていません。');
    }
  }
};

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.planSelection.init();
  });
} else {
  window.planSelection.init();
}

// Add CSS animation for modal fade-in
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .animate-fadeIn {
    animation: fadeIn 0.2s ease-out;
  }
`;
document.head.appendChild(style);

console.log('✅ [credit-selection] Script loaded successfully');

/**
 * Billing Usage Display for Settings Page
 * Fetches and displays detailed usage summary with tier breakdown
 */

(async function loadUsageSummary() {
    try {
        // Fetch usage summary
        const usageResponse = await window.authenticatedFetch('/api/billing/usage');
        
        if (!usageResponse.ok) {
            window.logger && window.logger.warn('⚠️ Failed to load usage data:', usageResponse.status);
            return;
        }
        
        const usageData = await usageResponse.json();
        
        if (!usageData.success || !usageData.usage) {
            window.logger && window.logger.warn('⚠️ Invalid usage data format');
            return;
        }
        
        const usage = usageData.usage;
        
        // Update basic counters
        document.getElementById('sku-count').textContent = usage.sku_download_count || 0;
        document.getElementById('sku-amount').textContent = '¥' + (usage.sku_download_amount || 0).toLocaleString('ja-JP');
        
        document.getElementById('ai-count').textContent = usage.ai_generation_count || 0;
        document.getElementById('ai-amount').textContent = '¥' + (usage.ai_generation_amount || 0).toLocaleString('ja-JP');
        
        const subtotal = usage.sku_download_amount + usage.ai_generation_amount;
        const tax = Math.round(subtotal * 0.1);
        const total = subtotal + tax;
        
        document.getElementById('subtotal-amount').textContent = '¥' + subtotal.toLocaleString('ja-JP');
        document.getElementById('tax-amount').textContent = '¥' + tax.toLocaleString('ja-JP');
        document.getElementById('total-amount').textContent = total.toLocaleString('ja-JP');
        
        // Update account type badge
        const accountBadge = document.getElementById('account-type-badge');
        if (usage.is_free_account) {
            accountBadge.textContent = '🎁 無料プラン';
            accountBadge.className = 'text-xs bg-green-600 text-white px-3 py-1 rounded-full font-bold';
        } else {
            accountBadge.textContent = '💳 有料プラン';
            accountBadge.className = 'text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold';
        }
        
        // Calculate next tier info
        updateTierInfo('sku', usage.sku_download_count);
        updateTierInfo('ai', usage.ai_generation_count);
        
        window.logger && window.logger.debug('✅ Usage summary loaded:', usage);
        
        // Fetch detailed breakdown
        await loadUsageBreakdown();
        
    } catch (error) {
        window.logger && window.logger.error('❌ Error loading usage summary:', error);
    }
})();

/**
 * Update tier info (next tier and remaining count)
 */
function updateTierInfo(type, count) {
    const tierInfo = document.getElementById(`${type}-tier-info`);
    const planBadge = document.getElementById(`plan-badge-${type}`);
    
    if (count <= 100) {
        // 松プラン
        const remaining = 100 - count;
        tierInfo.textContent = `あと${remaining}件で竹プラン（¥50/件）に切り替わります`;
        planBadge.textContent = '松プラン ¥100';
    } else if (count <= 500) {
        // 竹プラン
        const remaining = 500 - count;
        tierInfo.textContent = `あと${remaining}件で梅プラン（¥25/件）に切り替わります`;
        planBadge.textContent = '竹プラン ¥50';
        planBadge.className = planBadge.className.replace('blue', 'orange').replace('purple', 'orange');
    } else {
        // 梅プラン
        tierInfo.textContent = '最安値プラン適用中（¥25/件）';
        planBadge.textContent = '梅プラン ¥25';
        planBadge.className = planBadge.className.replace('blue', 'green').replace('purple', 'green');
    }
}

/**
 * Load detailed usage breakdown by tier
 */
async function loadUsageBreakdown() {
    try {
        const response = await window.authenticatedFetch('/api/billing/usage/breakdown');
        
        if (!response.ok) {
            window.logger && window.logger.warn('⚠️ Failed to load breakdown:', response.status);
            return;
        }
        
        const data = await response.json();
        
        if (!data.success || !data.breakdown) {
            window.logger && window.logger.warn('⚠️ Invalid breakdown data');
            return;
        }
        
        // Update SKU breakdown
        const skuBreakdownEl = document.getElementById('sku-breakdown');
        if (data.breakdown.sku_download.length > 0) {
            skuBreakdownEl.innerHTML = data.breakdown.sku_download.map(tier => `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700">
                        <span class="font-bold">${tier.tier_name}プラン</span>
                        <span class="text-xs text-gray-500 ml-1">（¥${tier.unit_price}/件）</span>
                    </span>
                    <span class="font-bold text-gray-900">
                        ${tier.count}件 × ¥${tier.unit_price.toLocaleString('ja-JP')} = 
                        <span class="text-blue-600">¥${tier.subtotal.toLocaleString('ja-JP')}</span>
                    </span>
                </div>
            `).join('');
        } else {
            skuBreakdownEl.innerHTML = '<div class="text-gray-500 text-center py-2">まだダウンロードがありません</div>';
        }
        
        // Update AI breakdown
        const aiBreakdownEl = document.getElementById('ai-breakdown');
        if (data.breakdown.ai_generation.length > 0) {
            aiBreakdownEl.innerHTML = data.breakdown.ai_generation.map(tier => `
                <div class="flex justify-between items-center">
                    <span class="text-gray-700">
                        <span class="font-bold">${tier.tier_name}プラン</span>
                        <span class="text-xs text-gray-500 ml-1">（¥${tier.unit_price}/回）</span>
                    </span>
                    <span class="font-bold text-gray-900">
                        ${tier.count}回 × ¥${tier.unit_price.toLocaleString('ja-JP')} = 
                        <span class="text-purple-600">¥${tier.subtotal.toLocaleString('ja-JP')}</span>
                    </span>
                </div>
            `).join('');
        } else {
            aiBreakdownEl.innerHTML = '<div class="text-gray-500 text-center py-2">まだ生成がありません</div>';
        }
        
        window.logger && window.logger.debug('✅ Usage breakdown loaded');
        
    } catch (error) {
        window.logger && window.logger.error('❌ Error loading breakdown:', error);
    }
}

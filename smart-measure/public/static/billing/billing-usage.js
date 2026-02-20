/**
 * Billing Usage Display
 * Fetches and displays current month usage summary
 */

(async function loadUsageSummary() {
    try {
        // Fetch usage data from API
        const response = await window.authenticatedFetch('/api/billing/usage');
        
        if (!response.ok) {
            window.logger && window.logger.warn('⚠️ Failed to load usage data:', response.status);
            return;
        }
        
        const data = await response.json();
        
        if (!data.success || !data.usage) {
            window.logger && window.logger.warn('⚠️ Invalid usage data format');
            return;
        }
        
        const usage = data.usage;
        
        // Update UI elements
        document.getElementById('sku-count').textContent = usage.sku_download_count || 0;
        document.getElementById('sku-amount').textContent = '¥' + (usage.sku_download_amount || 0).toLocaleString('ja-JP');
        
        document.getElementById('ai-count').textContent = usage.ai_generation_count || 0;
        document.getElementById('ai-amount').textContent = '¥' + (usage.ai_generation_amount || 0).toLocaleString('ja-JP');
        
        document.getElementById('total-amount').textContent = '¥' + (usage.total_amount || 0).toLocaleString('ja-JP');
        
        // Update plan badge
        const planBadge = document.getElementById('plan-badge');
        if (usage.is_free_account) {
            planBadge.textContent = '🎁 無料プラン';
            planBadge.className = 'text-xs text-green-600 font-medium mt-1';
        } else {
            planBadge.textContent = '💳 有料プラン';
            planBadge.className = 'text-xs text-blue-600 font-medium mt-1';
        }
        
        window.logger && window.logger.debug('✅ Usage summary loaded:', usage);
    } catch (error) {
        window.logger && window.logger.error('❌ Error loading usage summary:', error);
    }
})();

// Mobile App Sync Script
(function() {
    const btnSyncMobile = document.getElementById('btn-sync-mobile');
    
    if (!btnSyncMobile) {
        window.logger.error('❌ Sync mobile button not found!');
        return;
    }
    
    btnSyncMobile.addEventListener('click', async function() {
        const confirmation = confirm('双方向同期を実行しますか？\n\n1. WEBアプリ → モバイルAPI（CSVデータを送信）\n2. モバイルAPI → WEBアプリ（スマホデータを受信）');
        
        if (!confirmation) return;
        
        // Show loading state
        btnSyncMobile.disabled = true;
        btnSyncMobile.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>同期中...';
        
        try {
            // Step 1: Sync TO mobile (WEB → Mobile API)
            window.logger.debug('🔄 Step 1/2: Syncing to mobile API...');
            const toMobileResponse = await fetch('/api/sync-to-mobile', {
                method: 'POST'
            });
            
            let toMobileResult = { synced: 0, errors: 0 };
            if (toMobileResponse.ok) {
                toMobileResult = await toMobileResponse.json();
                window.logger.debug('✅ Sync to mobile completed:', toMobileResult);
            }
            
            // Step 2: Sync FROM mobile (Mobile API → WEB)
            window.logger.debug('🔄 Step 2/2: Syncing from mobile API...');
            const fromMobileResponse = await fetch('/api/sync-from-mobile', {
                method: 'POST'
            });
            
            if (!fromMobileResponse.ok) {
                throw new Error('Sync failed with status: ' + fromMobileResponse.status);
            }
            
            const fromMobileResult = await fromMobileResponse.json();
            
            if (fromMobileResult.success) {
                alert('✅ 双方向同期完了\n\n【WEB → モバイルAPI】\n送信: ' + toMobileResult.synced + '件\nエラー: ' + toMobileResult.errors + '件\n\n【モバイルAPI → WEB】\n更新: ' + fromMobileResult.synced + '件\n新規: ' + fromMobileResult.inserted + '件');
                window.location.reload();
            } else {
                throw new Error(fromMobileResult.error || 'Unknown error');
            }
        } catch (e) {
            window.logger.error('Sync error:', e);
            alert('❌ 同期に失敗しました: ' + e.message);
        } finally {
            btnSyncMobile.disabled = false;
            btnSyncMobile.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>スマホから同期';
        }
    });
    
    window.logger.debug('✅ Mobile sync button initialized');
})();

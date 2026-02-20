// Tab Switching Logic
(function() {
    const editorData = document.getElementById('editor-data');
    if (!editorData) {
        window.logger.error('❌ Editor data container not found');
        return;
    }
    
    const isMeasurement = editorData.dataset.isMeasurement === 'true';
    const hasMask = editorData.dataset.hasMask === 'true';
    const maskImageUrl = editorData.dataset.maskImageUrl;
    const productSku = editorData.dataset.productSku;
    
    // Tab switching
    window.switchTab = function(tab) {
        console.log('🔄 switchTab called with:', tab);
        
        const adjustTab = document.getElementById('tab-adjust');
        const maskTab = document.getElementById('tab-mask');
        const adjustTools = document.getElementById('adjust-tools');
        const maskTools = document.getElementById('mask-tools');
        const toolTitle = document.getElementById('tool-title');
        
        if (tab === 'adjust') {
            console.log('📋 Switching to adjust tab');
            adjustTab.className = 'flex-1 px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors';
            maskTab.className = 'flex-1 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors';
            adjustTools.classList.remove('hidden');
            maskTools.classList.add('hidden');
            toolTitle.textContent = '画像調整';
            
            // Switch back to processed image
            console.log('📸 Switching back to processed image');
            if (window.switchToProcessedImage) {
                window.switchToProcessedImage();
            }
            
            // Hide mask overlay when switching to adjust tab
            console.log('🎭 Checking window.hideMaskOverlay:', typeof window.hideMaskOverlay);
            if (window.hideMaskOverlay) {
                window.hideMaskOverlay();
            } else {
                console.error('❌ window.hideMaskOverlay is not defined!');
            }
        } else if (tab === 'mask') {
            console.log('🎭 Switching to mask tab');
            adjustTab.className = 'flex-1 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors';
            maskTab.className = 'flex-1 px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors';
            adjustTools.classList.add('hidden');
            maskTools.classList.remove('hidden');
            toolTitle.textContent = 'マスク編集';
            
            // Switch to original image first
            console.log('🎭 Switching to original image for mask editing');
            if (window.switchToOriginalForMask) {
                window.switchToOriginalForMask();
            } else {
                console.error('❌ window.switchToOriginalForMask is not defined!');
            }
            
            // Show mask overlay when switching to mask tab
            console.log('🎭 Checking window.showMaskOverlay:', typeof window.showMaskOverlay);
            if (window.showMaskOverlay) {
                window.showMaskOverlay();
            } else {
                console.error('❌ window.showMaskOverlay is not defined!');
            }
        }
    };
    
    // Delete image
    window.deleteImage = async function() {
        const imageId = editorData.dataset.imageId;
        
        if (!confirm('この画像を削除しますか？この操作は取り消せません。')) {
            return;
        }
        
        try {
            const response = await fetch('/api/delete-image/' + imageId, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                alert('画像を削除しました');
                window.location.href = '/dashboard';
            } else {
                const error = await response.json();
                alert('削除に失敗しました: ' + (error.message || 'Unknown error'));
            }
        } catch (e) {
            window.logger.error('Delete error:', e);
            alert('削除中にエラーが発生しました: ' + e.message);
        }
    };
    
    // Back to dashboard
    window.backToDashboard = function() {
        window.location.href = '/dashboard';
    };
    
    // Edit mask
    window.editMask = function() {
        window.location.href = '/mask-editor/' + productSku;
    };
    
    window.logger.debug('✅ Editor tab switching initialized');
})();

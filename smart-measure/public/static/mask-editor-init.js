// Initialize mask editor on page load
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('mask-editor-container');
    if (!container) {
        window.logger.error('❌ Mask editor container not found');
        return;
    }
    
    const originalImageUrl = container.dataset.originalImage;
    const maskImageUrl = container.dataset.maskImage;
    const sku = container.dataset.sku;
    
    window.logger.debug('🎨 Initializing mask editor for SKU:', sku);
    window.logger.debug('📸 Original image:', originalImageUrl);
    window.logger.debug('🎭 Mask image:', maskImageUrl);
    
    if (typeof window.initMaskEditor === 'function') {
        window.initMaskEditor(originalImageUrl, maskImageUrl).catch(error => {
            window.logger.error('❌ Failed to initialize mask editor:', error);
            alert('マスクエディタの初期化に失敗しました: ' + error.message);
        });
    } else {
        window.logger.error('❌ initMaskEditor function not found');
        alert('マスクエディタの読み込みに失敗しました');
    }
});

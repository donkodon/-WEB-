// IMAGE PROCESSING LOGIC
document.addEventListener('DOMContentLoaded', () => {
    const editorData = document.getElementById('editor-data');
    if (!editorData) {
        window.logger.error('❌ Editor data container not found');
        return;
    }
    
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    // Image sources from database (from data attributes)
    const processedSrc = editorData.dataset.imageSrc;
    const originalSrc = editorData.dataset.originalSrc;
    const isProcessed = editorData.dataset.isProcessed === 'true';
    const imageId = editorData.dataset.imageId;
    let showingOriginal = false;
    
    // Extract SKU and filename parts once (used in multiple functions)
    const parts = imageId.replace('r2_', '').split('_');
    const sku = parts[0];
    const filenamePart = parts.slice(1).join('_');
    
    window.logger.debug('🎨 Image Edit Screen Initialized:');
    window.logger.debug('📸 Processed URL:', processedSrc);
    window.logger.debug('📸 Original URL:', originalSrc);
    window.logger.debug('✅ Is Processed:', isProcessed);
    window.logger.debug('📦 SKU:', sku, 'Filename:', filenamePart);
    
    // Cache original image for mask mode
    let originalImage = null;
    
    // Load initial image
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        window.logger.debug('✅ Image loaded:', img.width, 'x', img.height);
        
        // Cache original
        if (!originalImage) {
            originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    };
    
    img.src = processedSrc;
    
    // Toggle between original and processed
    window.toggleOriginal = function() {
        const button = document.getElementById('btn-toggle-original');
        if (showingOriginal) {
            img.src = processedSrc;
            showingOriginal = false;
            button.innerHTML = '<i class="fas fa-image mr-2"></i> 元画像を確認';
        } else {
            img.src = originalSrc;
            showingOriginal = true;
            button.innerHTML = '<i class="fas fa-image mr-2"></i> 処理後画像を表示';
        }
    };
    
    // Apply brightness
    window.applyBrightness = function(value) {
        if (!originalImage) return;
        
        ctx.putImageData(originalImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] + value));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + value));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + value));
        }
        
        ctx.putImageData(imageData, 0, 0);
    };
    
    // Apply contrast
    window.applyContrast = function(value) {
        if (!originalImage) return;
        
        ctx.putImageData(originalImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const factor = (259 * (value + 255)) / (255 * (259 - value));
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
            data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
            data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
        
        ctx.putImageData(imageData, 0, 0);
    };
    
    // Save edited image
    window.saveEditedImage = async function() {
        const button = document.getElementById('btn-save-edit');
        if (!button) return;
        
        // Show loading
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
        
        try {
            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            // Upload to R2
            const formData = new FormData();
            formData.append('image', blob, sku + '_' + filenamePart + '_edited.png');
            formData.append('imageId', imageId);
            
            const response = await fetch('/api/save-edited-image', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('画像を保存しました');
                window.location.reload();
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (error) {
            window.logger.error('Save error:', error);
            alert('保存に失敗しました: ' + error.message);
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-save mr-2"></i>保存';
        }
    };
    
    // Enable mask mode
    window.enableMaskMode = function() {
        const maskPanel = document.getElementById('mask-panel');
        const maskIndicator = document.getElementById('mask-mode-indicator');
        
        if (maskPanel && maskIndicator) {
            const isHidden = maskPanel.classList.contains('hidden');
            
            if (isHidden) {
                maskPanel.classList.remove('hidden');
                maskIndicator.classList.remove('hidden');
                window.logger.debug('✅ Mask mode enabled');
                alert('マスクモードが有効になりました。\n青い部分が商品として保持されます。\n消しゴムで背景を指定してください。');
            } else {
                maskPanel.classList.add('hidden');
                maskIndicator.classList.add('hidden');
                window.logger.debug('❌ Mask mode disabled');
            }
        } else {
            window.logger.error('❌ Mask panel or indicator not found');
        }
    };
    
    window.logger.debug('✅ Image processing initialized');
});

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
    
    // Cache original image for adjustments
    let originalImage = null;
    
    // Drawing state
    let isDrawing = false;
    let currentTool = null; // 'brush', 'eraser', 'mask-brush', 'mask-eraser'
    let brushSize = 24;
    let maskBrushSize = 20;
    
    // Mask layer (for mask editing)
    let maskCanvas = document.createElement('canvas');
    let maskCtx = maskCanvas.getContext('2d');
    let maskMode = false;
    
    // Adjustment values
    let brightness = 0;
    let wb = 5500;
    let hue = 0;
    
    // Load initial image
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        window.logger.debug('✅ Image loaded:', img.width, 'x', img.height);
        
        // Cache original
        if (!originalImage) {
            originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        // Initialize mask (全体を商品として設定)
        maskCtx.fillStyle = 'rgba(0, 100, 255, 0.5)';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    };
    
    img.src = processedSrc;
    
    // ==================== TOGGLE ORIGINAL ====================
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
    
    // ==================== SLIDERS ====================
    const brightnessSlider = document.getElementById('range-brightness');
    const brightnessVal = document.getElementById('val-brightness');
    const wbSlider = document.getElementById('range-wb');
    const wbVal = document.getElementById('val-wb');
    const hueSlider = document.getElementById('range-hue');
    const hueVal = document.getElementById('val-hue');
    const sizeSlider = document.getElementById('range-size');
    const sizeVal = document.getElementById('val-size');
    
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            brightness = parseInt(e.target.value);
            brightnessVal.textContent = brightness;
            applyAllAdjustments();
        });
    }
    
    if (wbSlider) {
        wbSlider.addEventListener('input', (e) => {
            wb = parseInt(e.target.value);
            wbVal.textContent = wb + 'K';
            applyAllAdjustments();
        });
    }
    
    if (hueSlider) {
        hueSlider.addEventListener('input', (e) => {
            hue = parseInt(e.target.value);
            hueVal.textContent = hue + '°';
            applyAllAdjustments();
        });
    }
    
    if (sizeSlider) {
        sizeSlider.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value);
            sizeVal.textContent = brushSize + 'px';
        });
    }
    
    // Mask brush size
    const maskSizeSlider = document.getElementById('mask-size');
    const maskSizeVal = document.getElementById('mask-size-val');
    if (maskSizeSlider) {
        maskSizeSlider.addEventListener('input', (e) => {
            maskBrushSize = parseInt(e.target.value);
            maskSizeVal.textContent = maskBrushSize + 'px';
        });
    }
    
    // ==================== ADJUSTMENTS ====================
    function applyAllAdjustments() {
        if (!originalImage) return;
        
        ctx.putImageData(originalImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            
            // Brightness
            r += brightness;
            g += brightness;
            b += brightness;
            
            // WB (簡易実装)
            const wbFactor = (wb - 5500) / 3500;
            if (wbFactor > 0) {
                r += wbFactor * 50;
                g += wbFactor * 30;
            } else {
                b += Math.abs(wbFactor) * 50;
            }
            
            // Hue (簡易実装 - RGB shift)
            const hueFactor = hue / 180;
            if (hueFactor !== 0) {
                const tempR = r;
                r = Math.min(255, Math.max(0, r + hueFactor * (g - b) * 0.5));
                g = Math.min(255, Math.max(0, g + hueFactor * (b - tempR) * 0.5));
                b = Math.min(255, Math.max(0, b + hueFactor * (tempR - g) * 0.5));
            }
            
            // Clamp values
            data[i] = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    // ==================== TOOL SELECTION ====================
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            toolButtons.forEach(btn => btn.classList.remove('border-blue-500', 'bg-blue-50'));
            button.classList.add('border-blue-500', 'bg-blue-50');
        });
    });
    
    const btnCrop = document.getElementById('btn-crop');
    const btnBrush = document.getElementById('btn-brush');
    const btnEraser = document.getElementById('btn-eraser');
    
    if (btnCrop) btnCrop.addEventListener('click', () => {
        currentTool = null;
        alert('切り抜き機能は近日実装予定です');
    });
    
    if (btnBrush) btnBrush.addEventListener('click', () => {
        currentTool = 'brush';
        maskMode = false;
        window.logger.debug('✅ Brush tool selected');
    });
    
    if (btnEraser) btnEraser.addEventListener('click', () => {
        currentTool = 'eraser';
        maskMode = false;
        window.logger.debug('✅ Eraser tool selected');
    });
    
    // ==================== DRAWING ====================
    let lastX = 0;
    let lastY = 0;
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    function startDrawing(e) {
        if (!currentTool) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = (e.clientX - rect.left) * (canvas.width / rect.width);
        lastY = (e.clientY - rect.top) * (canvas.height / rect.height);
    }
    
    function draw(e) {
        if (!isDrawing || !currentTool) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        if (maskMode) {
            drawMask(lastX, lastY, x, y);
        } else {
            drawOnCanvas(lastX, lastY, x, y);
        }
        
        lastX = x;
        lastY = y;
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    function drawOnCanvas(x1, y1, x2, y2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        
        if (currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#000000';
        } else if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        }
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    
    function drawMask(x1, y1, x2, y2) {
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.lineWidth = maskBrushSize;
        
        if (currentTool === 'mask-brush') {
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
        } else if (currentTool === 'mask-eraser') {
            maskCtx.globalCompositeOperation = 'destination-out';
        }
        
        maskCtx.beginPath();
        maskCtx.moveTo(x1, y1);
        maskCtx.lineTo(x2, y2);
        maskCtx.stroke();
        
        // Overlay mask on main canvas
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.restore();
    }
    
    // ==================== MASK MODE ====================
    window.enableMaskMode = function() {
        const maskPanel = document.getElementById('mask-panel');
        const maskIndicator = document.getElementById('mask-mode-indicator');
        
        if (maskPanel && maskIndicator) {
            const isHidden = maskPanel.classList.contains('hidden');
            
            if (isHidden) {
                maskPanel.classList.remove('hidden');
                maskIndicator.classList.remove('hidden');
                maskMode = true;
                currentTool = 'mask-eraser';
                window.logger.debug('✅ Mask mode enabled');
                alert('マスクモードが有効になりました。\n青い部分が商品として保持されます。\n消しゴムで背景を指定してください。');
            } else {
                maskPanel.classList.add('hidden');
                maskIndicator.classList.add('hidden');
                maskMode = false;
                currentTool = null;
                window.logger.debug('❌ Mask mode disabled');
            }
        }
    };
    
    // Mask brush/eraser toggle
    const maskBrushBtn = document.getElementById('mask-brush-btn');
    const maskEraserBtn = document.getElementById('mask-eraser-btn');
    
    if (maskBrushBtn) {
        maskBrushBtn.addEventListener('click', () => {
            currentTool = 'mask-brush';
            maskBrushBtn.classList.add('border-2', 'border-blue-400', 'text-blue-600');
            maskBrushBtn.classList.remove('border-gray-200');
            maskEraserBtn.classList.remove('border-2', 'border-blue-400', 'text-blue-600');
            maskEraserBtn.classList.add('border-gray-200');
        });
    }
    
    if (maskEraserBtn) {
        maskEraserBtn.addEventListener('click', () => {
            currentTool = 'mask-eraser';
            maskEraserBtn.classList.add('border-2', 'border-blue-400', 'text-blue-600');
            maskEraserBtn.classList.remove('border-gray-200');
            maskBrushBtn.classList.remove('border-2', 'border-blue-400', 'text-blue-600');
            maskBrushBtn.classList.add('border-gray-200');
        });
    }
    
    // ==================== SAVE ====================
    window.saveEditedImage = async function() {
        const button = document.getElementById('btn-save-edit');
        if (!button) return;
        
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>保存中...';
        
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const formData = new FormData();
            formData.append('image', blob, sku + '_' + filenamePart + '_f.png');
            formData.append('imageId', imageId);
            
            const response = await window.authenticatedFetch('/api/save-edited-image', {
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
    
    window.logger.debug('✅ Image processing initialized');
});

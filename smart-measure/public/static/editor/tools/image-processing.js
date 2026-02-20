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
    const maskImageUrl = editorData.dataset.maskImageUrl;
    let showingOriginal = false;
    let maskVisible = false;
    
    // Extract SKU and filename parts once (used in multiple functions)
    const parts = imageId.replace('r2_', '').split('_');
    const sku = parts[0];
    const filenamePart = parts.slice(1).join('_');
    
    window.logger.debug('🎨 Image Edit Screen Initialized:');
    window.logger.debug('📸 Processed URL:', processedSrc);
    window.logger.debug('📸 Original URL:', originalSrc);
    window.logger.debug('🎭 Mask Image URL:', maskImageUrl);
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
    
    // Mask image data (loaded from mask_image_url)
    let maskImageData = null;
    let maskImage = null;
    
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
        
        // Save initial mask state to history
        if (typeof saveMaskHistory === 'function') {
            saveMaskHistory();
        }
        
        // Load mask image if available
        if (maskImageUrl && maskImageUrl !== '') {
            loadMaskImage();
        }
    };
    
    img.src = processedSrc;
    
    // ==================== LOAD MASK IMAGE ====================
    function loadMaskImage() {
        console.log('🎭 loadMaskImage called');
        console.log('🎭 Loading mask image from:', maskImageUrl);
        window.logger.debug('🎭 Loading mask image from:', maskImageUrl);
        
        maskImage = new Image();
        maskImage.crossOrigin = "Anonymous";
        
        maskImage.onload = function() {
            console.log('✅ Mask image loaded:', maskImage.width, 'x', maskImage.height);
            window.logger.debug('✅ Mask image loaded:', maskImage.width, 'x', maskImage.height);
            
            // Draw mask to temporary canvas to extract pixel data
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            console.log('🎭 Drawing mask to temp canvas, size:', canvas.width, 'x', canvas.height);
            
            // Draw mask image (白=商品、黒=背景)
            tempCtx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
            
            // Store mask data for later use
            maskImageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
            console.log('✅ Mask data extracted, length:', maskImageData.data.length);
            window.logger.debug('✅ Mask data extracted and cached');
            
            // Check first few pixels (RGBA)
            console.log('🎭 Sample mask pixels (RGBA):', 
                'Pixel 0:', maskImageData.data[0], maskImageData.data[1], maskImageData.data[2], maskImageData.data[3],
                'Pixel 1:', maskImageData.data[4], maskImageData.data[5], maskImageData.data[6], maskImageData.data[7]
            );
        };
        
        maskImage.onerror = function(err) {
            console.error('❌ Failed to load mask image:', err);
            window.logger.error('❌ Failed to load mask image:', err);
        };
        
        console.log('🎭 Setting maskImage.src...');
        maskImage.src = maskImageUrl;
    }
    
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
    
    // ==================== SHOW/HIDE MASK OVERLAY ====================
    // Called from tab switching
    window.showMaskOverlay = function() {
        console.log('🎭 showMaskOverlay called');
        console.log('🎭 maskImageUrl:', maskImageUrl);
        console.log('🎭 maskImageData:', maskImageData);
        console.log('🎭 maskVisible:', maskVisible);
        
        if (!maskImageData) {
            console.warn('⚠️ No mask image data available');
            
            // Try to load mask if URL exists but data is not loaded
            if (maskImageUrl && maskImageUrl !== '' && !maskImage) {
                console.log('🎭 Attempting to load mask image...');
                loadMaskImage();
                // Wait for mask to load, then show it
                setTimeout(() => {
                    if (maskImageData) {
                        console.log('🎭 Mask loaded, showing overlay...');
                        maskVisible = true;
                        applyMaskOverlay();
                    }
                }, 1000);
            }
            return;
        }
        
        if (!maskVisible) {
            console.log('🎭 Setting maskVisible = true and calling applyMaskOverlay()');
            maskVisible = true;
            applyMaskOverlay();
            console.log('✅ Mask overlay shown');
        } else {
            console.log('ℹ️ Mask overlay already visible');
        }
    };
    
    window.hideMaskOverlay = function() {
        console.log('🎭 hideMaskOverlay called');
        console.log('🎭 maskVisible:', maskVisible);
        
        if (maskVisible) {
            console.log('🎭 Setting maskVisible = false and redrawing canvas');
            maskVisible = false;
            ctx.drawImage(img, 0, 0);
            applyCurrentAdjustments();
            console.log('✅ Mask overlay hidden');
        } else {
            console.log('ℹ️ Mask overlay already hidden');
        }
    };
    
    // ==================== TOGGLE MASK (legacy) ====================
    window.toggleMask = function() {
        console.log('🎭 toggleMask called');
        console.log('🎭 maskImageUrl:', maskImageUrl);
        console.log('🎭 maskImage:', maskImage);
        console.log('🎭 maskImageData:', maskImageData);
        
        if (!maskImageData) {
            console.warn('⚠️ No mask image data available');
            window.logger.warn('⚠️ No mask image data available');
            
            // Try to load mask if URL exists but data is not loaded
            if (maskImageUrl && maskImageUrl !== '' && !maskImage) {
                console.log('🎭 Attempting to load mask image...');
                loadMaskImage();
            }
            return;
        }
        
        maskVisible = !maskVisible;
        const button = document.getElementById('btn-toggle-mask');
        
        if (maskVisible) {
            // Show mask overlay (blue overlay on product area)
            applyMaskOverlay();
            if (button) {
                button.innerHTML = '<i class="fas fa-eye-slash mr-2"></i> マスクを非表示';
                button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                button.classList.add('bg-gray-500', 'hover:bg-gray-600');
            }
        } else {
            // Hide mask overlay (show original image)
            ctx.drawImage(img, 0, 0);
            applyCurrentAdjustments();
            if (button) {
                button.innerHTML = '<i class="fas fa-eye mr-2"></i> マスクを表示';
                button.classList.remove('bg-gray-500', 'hover:bg-gray-600');
                button.classList.add('bg-blue-500', 'hover:bg-blue-600');
            }
        }
    };
    
    // ==================== APPLY MASK OVERLAY ====================
    function applyMaskOverlay() {
        console.log('🎭 applyMaskOverlay called');
        console.log('🎭 maskImageData exists:', !!maskImageData);
        
        if (!maskImageData) {
            console.error('❌ maskImageData is null, cannot apply overlay');
            return;
        }
        
        // Redraw base image
        ctx.drawImage(img, 0, 0);
        
        // Get current image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        console.log('🎭 Canvas size:', canvas.width, 'x', canvas.height);
        console.log('🎭 Mask data length:', maskImageData.data.length);
        
        // Apply blue overlay based on alpha channel (transparency)
        // Opaque (alpha > 0) = product area
        // Transparent (alpha = 0) = background
        let opaquePixelCount = 0;
        let transparentPixelCount = 0;
        
        for (let i = 0; i < maskImageData.data.length; i += 4) {
            const alpha = maskImageData.data[i + 3]; // Alpha channel (0-255)
            
            if (alpha > 10) { // Opaque/semi-transparent = product
                opaquePixelCount++;
                // Blend with semi-transparent blue (50% opacity)
                imageData.data[i] = imageData.data[i] * 0.5 + 0 * 0.5;         // R
                imageData.data[i + 1] = imageData.data[i + 1] * 0.5 + 100 * 0.5; // G
                imageData.data[i + 2] = imageData.data[i + 2] * 0.5 + 255 * 0.5; // B
                // Alpha remains unchanged
            } else {
                transparentPixelCount++;
            }
        }
        
        console.log('🎭 Opaque pixels (product):', opaquePixelCount);
        console.log('🎭 Transparent pixels (background):', transparentPixelCount);
        
        // Draw the overlaid image
        ctx.putImageData(imageData, 0, 0);
        console.log('✅ Mask overlay applied');
    }
    
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
    const maskSizeSlider = document.getElementById('range-mask-brush-size');
    const maskSizeVal = document.getElementById('val-mask-brush-size');
    if (maskSizeSlider && maskSizeVal) {
        maskSizeSlider.addEventListener('input', (e) => {
            maskBrushSize = parseInt(e.target.value);
            maskSizeVal.textContent = maskBrushSize + 'px';
            console.log('🖌️ Mask brush size changed to:', maskBrushSize);
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
        
        // If mask is visible, reapply mask overlay
        if (maskVisible && maskImageData) {
            applyMaskOverlay();
        }
    }
    
    // Helper function to apply current adjustments (used by toggleMask)
    function applyCurrentAdjustments() {
        if (brightness !== 0 || wb !== 5500 || hue !== 0) {
            applyAllAdjustments();
        }
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
    
    // Mask history variables (declared early for use in drawing functions)
    let maskHistory = [];
    let maskHistoryIndex = -1;
    const maxMaskHistory = 20;
    
    // Save current mask state to history
    function saveMaskHistory() {
        // Remove any states after current index
        maskHistory = maskHistory.slice(0, maskHistoryIndex + 1);
        
        // Save current mask state
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        maskHistory.push(maskData);
        
        // Limit history size
        if (maskHistory.length > maxMaskHistory) {
            maskHistory.shift();
        } else {
            maskHistoryIndex++;
        }
        
        console.log('💾 Mask history saved, index:', maskHistoryIndex, 'total:', maskHistory.length);
    }
    
    function startDrawing(e) {
        if (!currentTool) return;
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = (e.clientX - rect.left) * (canvas.width / rect.width);
        lastY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Save mask history when starting to draw on mask
        const isMaskTool = currentTool === 'mask-brush' || currentTool === 'mask-eraser';
        if (isMaskTool) {
            saveMaskHistory();
        }
    }
    
    function draw(e) {
        if (!isDrawing || !currentTool) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Check if using mask tools
        const isMaskTool = currentTool === 'mask-brush' || currentTool === 'mask-eraser';
        
        if (isMaskTool) {
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
            // Brush: paint blue overlay (product area)
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
        } else if (currentTool === 'mask-eraser') {
            // Eraser: remove blue overlay (background area)
            maskCtx.globalCompositeOperation = 'destination-out';
        }
        
        maskCtx.beginPath();
        maskCtx.moveTo(x1, y1);
        maskCtx.lineTo(x2, y2);
        maskCtx.stroke();
        
        // Redraw the entire canvas with mask overlay
        ctx.drawImage(img, 0, 0);
        applyCurrentAdjustments();
        
        // Apply mask overlay if visible
        if (maskVisible) {
            ctx.save();
            ctx.drawImage(maskCanvas, 0, 0);
            ctx.restore();
        }
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
                // REMOVED: alert popup
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
            // Mask overlay is already shown by tab switching
        });
    }
    
    if (maskEraserBtn) {
        maskEraserBtn.addEventListener('click', () => {
            currentTool = 'mask-eraser';
            maskEraserBtn.classList.add('border-2', 'border-blue-400', 'text-blue-600');
            maskEraserBtn.classList.remove('border-gray-200');
            maskBrushBtn.classList.remove('border-2', 'border-blue-400', 'text-blue-600');
            maskBrushBtn.classList.add('border-gray-200');
            // Mask overlay is already shown by tab switching
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
    
    // ==================== MASK EDITING FUNCTIONS ====================
    
    // Set mask mode (brush or eraser)
    window.setMaskMode = function(mode) {
        const maskBrushBtn = document.getElementById('mask-mode-brush');
        const maskEraserBtn = document.getElementById('mask-mode-eraser');
        
        if (mode === 'brush') {
            currentTool = 'mask-brush';
            if (maskBrushBtn) {
                maskBrushBtn.classList.add('bg-blue-100', 'border-blue-400');
                maskBrushBtn.classList.remove('bg-white', 'border-gray-200');
            }
            if (maskEraserBtn) {
                maskEraserBtn.classList.remove('bg-blue-100', 'border-blue-400');
                maskEraserBtn.classList.add('bg-white', 'border-gray-200');
            }
        } else if (mode === 'eraser') {
            currentTool = 'mask-eraser';
            if (maskEraserBtn) {
                maskEraserBtn.classList.add('bg-blue-100', 'border-blue-400');
                maskEraserBtn.classList.remove('bg-white', 'border-gray-200');
            }
            if (maskBrushBtn) {
                maskBrushBtn.classList.remove('bg-blue-100', 'border-blue-400');
                maskBrushBtn.classList.add('bg-white', 'border-gray-200');
            }
        }
        
        console.log('🎨 Mask mode set to:', mode);
    };
    
    // Undo mask edit
    window.undoMask = function() {
        if (maskHistoryIndex > 0) {
            maskHistoryIndex--;
            const maskData = maskHistory[maskHistoryIndex];
            maskCtx.putImageData(maskData, 0, 0);
            applyMaskOverlay();
            console.log('↶ Mask undo, index:', maskHistoryIndex);
        } else {
            console.log('⚠️ No more undo history');
        }
    };
    
    // Redo mask edit
    window.redoMask = function() {
        if (maskHistoryIndex < maskHistory.length - 1) {
            maskHistoryIndex++;
            const maskData = maskHistory[maskHistoryIndex];
            maskCtx.putImageData(maskData, 0, 0);
            applyMaskOverlay();
            console.log('↷ Mask redo, index:', maskHistoryIndex);
        } else {
            console.log('⚠️ No more redo history');
        }
    };
    
    // Preview mask (show final result without mask overlay)
    window.previewMask = function() {
        if (!maskImageData) {
            alert('マスクデータがありません');
            return;
        }
        
        // Temporarily hide mask overlay
        maskVisible = false;
        ctx.drawImage(img, 0, 0);
        applyCurrentAdjustments();
        
        alert('プレビュー表示中（マスクタブに戻ると編集を続けられます）');
        
        console.log('👁️ Mask preview shown');
    };
    
    // Reset mask to initial state (full blue overlay)
    window.resetMask = function() {
        if (!confirm('マスクをリセットしますか？（元に戻せません）')) {
            return;
        }
        
        // Clear mask history
        maskHistory = [];
        maskHistoryIndex = -1;
        
        // Reset mask to full blue overlay
        maskCtx.fillStyle = 'rgba(0, 100, 255, 0.5)';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        
        // Save to history
        saveMaskHistory();
        
        // Redraw overlay
        applyMaskOverlay();
        
        console.log('🔄 Mask reset');
    };
    
    // Save mask
    window.saveMask = async function(productSku) {
        console.log('💾 saveMask called for SKU:', productSku);
        
        if (!maskCanvas || !maskCtx) {
            alert('マスクが見つかりません');
            console.error('❌ maskCanvas not initialized');
            return;
        }
        
        try {
            // Get mask as data URL
            const maskDataUrl = maskCanvas.toDataURL('image/png');
            console.log('📸 Mask data URL created, length:', maskDataUrl.length);
            
            // Send to server
            console.log('📤 Sending mask to /api/update-mask/' + productSku);
            const response = await window.authenticatedFetch(`/api/update-mask/${productSku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maskDataUrl })
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.details || error.error || 'Save failed');
            }
            
            const result = await response.json();
            console.log('✅ Mask saved:', result);
            
            alert('マスクを保存しました！');
            window.location.reload();
            
        } catch (error) {
            console.error('❌ Mask save error:', error);
            alert('マスクの保存に失敗しました: ' + error.message);
        }
    };
    
    window.logger.debug('✅ Image processing initialized');
});

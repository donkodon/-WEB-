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
        
        // Load mask image if available
        if (maskImageUrl && maskImageUrl !== '') {
            console.log('🎭 Mask URL exists, loading mask image...');
            loadMaskImage();
        } else {
            console.log('⚠️ No mask URL provided');
            // Initialize with empty mask (no overlay)
            // Create all-black mask (no product area marked)
            const initialMaskData = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
            for (let i = 0; i < initialMaskData.data.length; i += 4) {
                initialMaskData.data[i] = 0;       // R (black)
                initialMaskData.data[i + 1] = 0;   // G (black)
                initialMaskData.data[i + 2] = 0;   // B (black)
                initialMaskData.data[i + 3] = 255; // A (opaque)
            }
            maskCtx.putImageData(initialMaskData, 0, 0);
            
            // Store initial mask data
            maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            console.log('✅ Initial empty mask data created (no overlay)');
            
            // Save initial mask state to history
            if (typeof saveMaskHistory === 'function') {
                saveMaskHistory();
            }
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
            
            // Store mask data in maskImageData AND maskCanvas
            maskImageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
            maskCtx.putImageData(maskImageData, 0, 0); // Copy to maskCanvas for editing
            console.log('✅ Mask data extracted, length:', maskImageData.data.length);
            window.logger.debug('✅ Mask data extracted and cached');
            
            // Check first few pixels (RGBA)
            console.log('🎭 Sample mask pixels (RGBA):', 
                'Pixel 0:', maskImageData.data[0], maskImageData.data[1], maskImageData.data[2], maskImageData.data[3],
                'Pixel 1:', maskImageData.data[4], maskImageData.data[5], maskImageData.data[6], maskImageData.data[7]
            );
            
            // Save to history after loading
            if (typeof saveMaskHistory === 'function') {
                saveMaskHistory();
            }
            
            // If mask is visible, apply overlay immediately after loading
            if (maskVisible) {
                console.log('🎭 Mask visible flag is true, applying overlay...');
                applyMaskOverlay();
            }
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
    
    // ==================== SWITCH TO ORIGINAL FOR MASK ====================
    // Called when switching to mask editing tab
    // callback: 画像描画完了後に呼ぶ関数（マスクオーバーレイ表示など）
    window.switchToOriginalForMask = function(callback) {
        console.log('🎨 switchToOriginalForMask called');
        console.log('📸 Current showingOriginal:', showingOriginal);
        
        // Update toggle button
        const button = document.getElementById('btn-toggle-original');
        if (button) {
            button.innerHTML = '<i class="fas fa-image mr-2"></i> 処理後画像を表示';
        }
        
        // If already showing original, just redraw and call callback immediately
        if (showingOriginal) {
            console.log('✅ Already showing original image, redrawing canvas');
            ctx.drawImage(img, 0, 0);
            if (callback) callback();
            return;
        }
        
        // Switch to original image
        showingOriginal = true;
        
        // Create a new image object to load original
        const originalImg = new Image();
        originalImg.crossOrigin = "Anonymous";
        originalImg.onload = function() {
            // Update main img object
            img.src = originalSrc;
            // Redraw canvas with original image
            ctx.drawImage(originalImg, 0, 0);
            console.log('✅ Switched to original image for mask editing');
            // 画像ロード完了後にコールバック実行（マスクオーバーレイ表示）
            if (callback) callback();
        };
        originalImg.onerror = function() {
            // CORS失敗時はプロキシ経由で再試行
            console.warn('⚠️ originalImg CORS failed, using proxy');
            const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(originalSrc)}`;
            const proxyImg = new Image();
            proxyImg.onload = function() {
                img.src = proxyUrl;
                ctx.drawImage(proxyImg, 0, 0);
                console.log('✅ Switched to original via proxy');
                if (callback) callback();
            };
            proxyImg.onerror = function() {
                console.error('❌ Failed to load original via proxy too');
                if (callback) callback(); // エラーでもコールバックは実行
            };
            proxyImg.src = proxyUrl;
        };
        originalImg.src = originalSrc;
    };
    
    // ==================== SWITCH TO PROCESSED IMAGE ====================
    // Called when switching to adjust tab
    window.switchToProcessedImage = function() {
        console.log('🎨 switchToProcessedImage called');
        console.log('📸 Current showingOriginal:', showingOriginal);
        console.log('📸 processedSrc:', processedSrc);
        
        // If already showing processed, no need to switch
        if (!showingOriginal) {
            console.log('✅ Already showing processed image');
            return;
        }
        
        // Switch to processed image
        img.src = processedSrc;
        showingOriginal = false;
        console.log('✅ Switched to processed image for adjustments');
        
        // Update toggle button if it exists
        const button = document.getElementById('btn-toggle-original');
        if (button) {
            button.innerHTML = '<i class="fas fa-image mr-2"></i> 元画像を確認';
        }
    };
    
    // ==================== SHOW/HIDE MASK OVERLAY ====================
    // Called from tab switching
    window.showMaskOverlay = function() {
        console.log('🎭 showMaskOverlay called');
        console.log('🎭 maskImageData:', !!maskImageData);
        console.log('🎭 maskVisible (before):', maskVisible);
        
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
        
        // フラグに関わらず常に描画する（switchToOriginalForMask後にcanvasがリセットされるため）
        maskVisible = true;
        applyMaskOverlay();
        console.log('✅ Mask overlay applied');
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
        
        // Apply blue overlay based on RGB brightness
        // Bright (RGB sum > 10) = product area → show blue overlay
        // Dark (RGB sum <= 10) = background area → no overlay
        let darkPixelCount = 0;
        let brightPixelCount = 0;
        
        for (let i = 0; i < maskImageData.data.length; i += 4) {
            const r = maskImageData.data[i];     // Red channel (0-255)
            const g = maskImageData.data[i + 1]; // Green channel (0-255)
            const b = maskImageData.data[i + 2]; // Blue channel (0-255)
            const brightness = r + g + b;         // Total brightness (0-765)
            
            // Check if pixel is bright (product area)
            // RGB (255,255,255) has brightness = 765
            // RGB (0,0,0) has brightness = 0
            // RGB (1,1,1) has brightness = 3
            // Use threshold of 10 to include dark colors
            if (brightness > 10) {
                brightPixelCount++;
                // Apply blue overlay to product area (50% opacity)
                imageData.data[i] = imageData.data[i] * 0.5 + 0 * 0.5;         // R
                imageData.data[i + 1] = imageData.data[i + 1] * 0.5 + 100 * 0.5; // G
                imageData.data[i + 2] = imageData.data[i + 2] * 0.5 + 255 * 0.5; // B
                // Alpha remains unchanged
            } else {
                darkPixelCount++;
                // No overlay on background area (dark pixels)
            }
        }
        
        console.log('🎭 Bright pixels (product with blue overlay):', brightPixelCount);
        console.log('🎭 Dark pixels (background, no overlay):', darkPixelCount);
        
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
        currentTool = 'crop';
        maskMode = false;
        canvas.style.cursor = 'crosshair';
        window.logger.debug('✅ Crop tool selected');
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
    
    // ==================== CROP OVERLAY CANVAS ====================
    // main-canvas の上に重ねる透明な canvas（切り抜き選択枠の描画用）
    const cropOverlay = document.createElement('canvas');
    cropOverlay.style.position = 'absolute';
    cropOverlay.style.top = '0';
    cropOverlay.style.left = '0';
    cropOverlay.style.pointerEvents = 'none'; // クリックはmain-canvasが受け取る
    cropOverlay.style.display = 'none';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(cropOverlay);
    const cropCtx = cropOverlay.getContext('2d');

    // 切り抜き選択状態
    let cropStartX = 0, cropStartY = 0;
    let cropEndX = 0, cropEndY = 0;
    let isCropping = false;

    // オーバーレイのサイズをmain-canvasに合わせる
    function syncCropOverlaySize() {
        const rect = canvas.getBoundingClientRect();
        cropOverlay.width = rect.width;
        cropOverlay.height = rect.height;
        cropOverlay.style.width = rect.width + 'px';
        cropOverlay.style.height = rect.height + 'px';
    }

    // 切り抜き選択枠を描画
    function drawCropRect(x1, y1, x2, y2) {
        cropCtx.clearRect(0, 0, cropOverlay.width, cropOverlay.height);
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);

        // 選択範囲外を暗くする
        cropCtx.fillStyle = 'rgba(0,0,0,0.45)';
        cropCtx.fillRect(0, 0, cropOverlay.width, cropOverlay.height);
        cropCtx.clearRect(rx, ry, rw, rh);

        // 選択枠（点線）
        cropCtx.strokeStyle = '#3b82f6';
        cropCtx.lineWidth = 2;
        cropCtx.setLineDash([6, 3]);
        cropCtx.strokeRect(rx, ry, rw, rh);

        // 四隅のハンドル
        cropCtx.setLineDash([]);
        cropCtx.fillStyle = '#3b82f6';
        const corners = [[rx,ry],[rx+rw,ry],[rx,ry+rh],[rx+rw,ry+rh]];
        corners.forEach(([cx, cy]) => {
            cropCtx.fillRect(cx - 4, cy - 4, 8, 8);
        });
    }

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

        // 切り抜きツール: 選択開始
        if (currentTool === 'crop') {
            syncCropOverlaySize();
            cropOverlay.style.display = 'block';
            cropStartX = e.clientX - rect.left;
            cropStartY = e.clientY - rect.top;
            cropEndX = cropStartX;
            cropEndY = cropStartY;
            isCropping = true;
        }
    }
    
    function draw(e) {
        if (!isDrawing || !currentTool) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        // 切り抜きツール: 選択枠をリアルタイム描画
        if (currentTool === 'crop') {
            cropEndX = e.clientX - rect.left;
            cropEndY = e.clientY - rect.top;
            drawCropRect(cropStartX, cropStartY, cropEndX, cropEndY);
            return;
        }
        
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
        if (!isDrawing) return;
        isDrawing = false;

        // 切り抜きツール: 選択確定 → 範囲外を透明化
        if (currentTool === 'crop' && isCropping) {
            isCropping = false;
            cropOverlay.style.display = 'none';
            cropCtx.clearRect(0, 0, cropOverlay.width, cropOverlay.height);

            // CSS座標 → canvas座標に変換
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x1 = Math.round(Math.min(cropStartX, cropEndX) * scaleX);
            const y1 = Math.round(Math.min(cropStartY, cropEndY) * scaleY);
            const x2 = Math.round(Math.max(cropStartX, cropEndX) * scaleX);
            const y2 = Math.round(Math.max(cropStartY, cropEndY) * scaleY);
            const w = x2 - x1;
            const h = y2 - y1;

            // 選択範囲が小さすぎる場合はキャンセル
            if (w < 5 || h < 5) {
                console.log('⚠️ Crop area too small, cancelled');
                return;
            }

            // 選択範囲内の画像を切り出して canvas を再構成
            const croppedData = ctx.getImageData(x1, y1, w, h);
            canvas.width = w;
            canvas.height = h;
            ctx.putImageData(croppedData, 0, 0);

            // maskCanvas も同サイズにリサイズ（マスクを選択範囲に合わせてトリミング）
            const croppedMask = maskCtx.getImageData(x1, y1, w, h);
            maskCanvas.width = w;
            maskCanvas.height = h;
            maskCtx.putImageData(croppedMask, 0, 0);
            maskImageData = maskCtx.getImageData(0, 0, w, h);

            // originalImage キャッシュをリセット（切り抜き後を新しい原点に）
            originalImage = ctx.getImageData(0, 0, w, h);

            console.log(`✅ Crop applied: (${x1},${y1}) ${w}x${h}`);

            // クロップ後はツールを解除してカーソルを戻す
            currentTool = null;
            canvas.style.cursor = 'default';
            // ボタンのアクティブ状態をリセット
            document.querySelectorAll('.tool-btn').forEach(btn =>
                btn.classList.remove('border-blue-500', 'bg-blue-50')
            );
            return;
        }
        
        // マスクツール使用後: ストローク完了時点でヒストリ保存 + maskImageData同期
        const isMaskTool = currentTool === 'mask-brush' || currentTool === 'mask-eraser';
        if (isMaskTool) {
            saveMaskHistory();
            // maskImageData を maskCanvas の最新状態で同期
            maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            console.log('💾 Stroke complete: history saved, maskImageData synced');
        }
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
        console.log('🎨 drawMask called, tool:', currentTool, 'size:', maskBrushSize);
        
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.lineWidth = maskBrushSize;
        maskCtx.globalCompositeOperation = 'source-over';
        
        if (currentTool === 'mask-brush') {
            // Brush: paint white (product area - will show blue overlay)
            maskCtx.strokeStyle = 'rgba(255, 255, 255, 1.0)'; // Solid white
            console.log('🖌️ Painting white (product area)');
        } else if (currentTool === 'mask-eraser') {
            // Eraser: paint black (background area - will NOT show blue overlay)
            maskCtx.strokeStyle = 'rgba(0, 0, 0, 1.0)'; // Solid black
            console.log('🧹 Painting black (background area)');
        }
        
        maskCtx.beginPath();
        maskCtx.moveTo(x1, y1);
        maskCtx.lineTo(x2, y2);
        maskCtx.stroke();
        
        // Update maskImageData with current mask canvas
        maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        console.log('✅ maskImageData updated, length:', maskImageData.data.length);
        
        // Redraw the entire canvas with updated mask overlay
        ctx.drawImage(img, 0, 0);
        applyCurrentAdjustments();
        
        // Apply updated mask overlay
        if (maskVisible) {
            applyMaskOverlay();
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
        const button = document.getElementById('btn-save');
        if (!button) {
            window.logger.error('❌ btn-save not found');
            return;
        }
        
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 保存中...';
        
        try {
            // Canvas to base64
            const imageData = canvas.toDataURL('image/png');
            
            window.logger.debug('💾 Saving edited image:', imageId);
            window.logger.debug('📊 Image data length:', imageData.length);
            
            const response = await window.authenticatedFetch('/api/save-edited-image/' + imageId, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageData: imageData,
                    imageId: imageId
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 成功メッセージ表示
                button.innerHTML = '<i class="fas fa-check mr-2"></i> 保存完了！';
                button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                button.classList.add('bg-green-600');
                
                setTimeout(() => {
                    // 画像調整画面へ遷移（現在の編集画面をリロード）
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (error) {
            window.logger.error('Save error:', error);
            alert('保存に失敗しました: ' + error.message);
        } finally {
            if (button.disabled) {
                button.disabled = false;
                // 失敗時のみ元のテキストに戻す
                if (!button.classList.contains('bg-green-600')) {
                    button.innerHTML = '<i class="fas fa-save mr-2"></i> 保存してダッシュボードへ';
                }
            }
        }
    };
    
    // ==================== MASK EDITING FUNCTIONS =============    
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
    
    // Undo mask edit (1ストローク前に戻る)
    window.undoMask = function() {
        if (maskHistoryIndex > 0) {
            maskHistoryIndex--;
            const maskData = maskHistory[maskHistoryIndex];
            // maskCanvas を1つ前の状態に戻す
            maskCtx.putImageData(maskData, 0, 0);
            // maskImageData も同期（saveMask時に使われる）
            maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            // canvasを再描画してオーバーレイを反映
            ctx.drawImage(img, 0, 0);
            applyMaskOverlay();
            console.log('↶ Undo: index', maskHistoryIndex + 1, '→', maskHistoryIndex);
        } else {
            console.log('⚠️ これ以上元に戻せません (index:', maskHistoryIndex, ')');
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
    
    // ==================== SAVE MASK → 背景削除合成 → 画像調整タブ ====================
    // 処理フロー:
    //   1. マスクをR2に保存 (/api/save-mask)
    //   2. オリジナル画像 × マスクをブラウザで合成 → 透過PNG
    //   3. 合成画像をR2にアップロード (/api/upload-processed-image)
    //      → DB の processed_images も更新される
    //   4. canvasを合成画像で更新
    //   5. 画像調整タブへ切替
    window.saveMask = async function(productSku) {
        console.log('💾 saveMask called for SKU:', productSku);
        
        if (!maskCanvas || !maskCtx) {
            console.error('❌ maskCanvas not initialized');
            return;
        }

        // ボタンをローディング状態に
        const saveBtn = document.querySelector('#mask-tools button.bg-blue-600');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 処理中...';
        }
        
        try {
            // ── Step 1: マスクをR2に保存 ──
            const maskDataUrl = maskCanvas.toDataURL('image/png');
            console.log('📸 Step1: Saving mask for SKU:', productSku, '| filenamePart:', filenamePart);
            
            const maskRes = await window.authenticatedFetch(`/api/save-mask/${productSku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maskDataUrl, filenamePart })
            });
            if (!maskRes.ok) {
                const err = await maskRes.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error('マスク保存失敗: ' + (err.details || err.error));
            }
            const maskResult = await maskRes.json();
            console.log('✅ Step1 done: mask saved to', maskResult.r2Key);

            // ── Step 2: オリジナル × マスク → 透過PNG合成 ──
            console.log('🎨 Step2: Compositing original × mask...');
            
            // オリジナル画像をロード（imgオブジェクトは既にメモリ上にある）
            // originalSrc はクロージャ内の変数
            const origImg = await new Promise((resolve, reject) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => resolve(i);
                i.onerror = () => {
                    // CORS失敗 → プロキシ経由
                    const pi = new Image();
                    pi.onload = () => resolve(pi);
                    pi.onerror = () => reject(new Error('Failed to load original image'));
                    pi.src = `/api/images/proxy?url=${encodeURIComponent(originalSrc)}`;
                };
                // ?v= パラメータを除いたURLで取得（CORSが通る）
                i.src = originalSrc;
            });

            // 合成用キャンバスを作成
            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = origImg.width;
            compositeCanvas.height = origImg.height;
            const compCtx = compositeCanvas.getContext('2d');

            // オリジナル画像を描画
            compCtx.drawImage(origImg, 0, 0);

            // マスクを使ってピクセルごとに背景を透明化
            // マスク: 白(255,255,255) = 商品エリア(残す), 黒(0,0,0) = 背景(透明)
            const imgData = compCtx.getImageData(0, 0, compositeCanvas.width, compositeCanvas.height);
            
            // maskCanvas を合成キャンバスと同サイズにスケール
            const maskTemp = document.createElement('canvas');
            maskTemp.width = compositeCanvas.width;
            maskTemp.height = compositeCanvas.height;
            const maskTempCtx = maskTemp.getContext('2d');
            maskTempCtx.drawImage(maskCanvas, 0, 0, compositeCanvas.width, compositeCanvas.height);
            const maskData = maskTempCtx.getImageData(0, 0, compositeCanvas.width, compositeCanvas.height);

            // マスクの明るさ(R+G+B)でアルファを設定
            for (let i = 0; i < imgData.data.length; i += 4) {
                const r = maskData.data[i];
                const g = maskData.data[i + 1];
                const b = maskData.data[i + 2];
                const brightness = (r + g + b) / 3; // 0=黒(背景) 255=白(商品)
                imgData.data[i + 3] = brightness;   // アルファチャンネルに設定
            }
            compCtx.putImageData(imgData, 0, 0);

            const compositeDataUrl = compositeCanvas.toDataURL('image/png');
            console.log('✅ Step2 done: composite image generated');

            // ── Step 3: 合成画像をR2にアップロード ──
            console.log('📤 Step3: Uploading composite to /api/upload-processed-image...');
            
            const uploadRes = await window.authenticatedFetch(`/api/upload-processed-image/${productSku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: compositeDataUrl, filenamePart })
            });
            if (!uploadRes.ok) {
                const err = await uploadRes.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error('アップロード失敗: ' + (err.details || err.error));
            }
            const uploadResult = await uploadRes.json();
            console.log('✅ Step3 done: uploaded to', uploadResult.r2Key);

            // ── Step 4: canvasを合成画像で更新 ──
            console.log('🖼️ Step4: Updating canvas with composite image...');
            // processedSrc を新URLに更新（クロージャ変数を再代入）
            // image-proxy経由のURLに切り替え（キャッシュバスター付き）
            const newProcessedUrl = `/api/image-proxy/${productSku}/${filenamePart}_p.png?v=${Date.now()}`;
            
            // img オブジェクトを新しい処理済み画像に切り替え
            img.src = newProcessedUrl;
            showingOriginal = false;
            maskVisible = false;
            
            // canvasに合成画像を直接描画（即時反映）
            canvas.width = compositeCanvas.width;
            canvas.height = compositeCanvas.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(compositeCanvas, 0, 0);
            
            // originalImageキャッシュも更新
            originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            console.log('✅ Step4 done: canvas updated');

            // ── Step 5: 画像調整タブへ切替 ──
            console.log('🔄 Step5: Switching to adjust tab...');
            if (window.switchTab) {
                window.switchTab('adjust');
            }
            console.log('✅ All steps done!');

        } catch (error) {
            console.error('❌ saveMask error:', error);
            alert('保存中にエラーが発生しました: ' + error.message);
        } finally {
            // ボタンを元に戻す
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> 保存';
            }
        }
    };

    // ==================== SAVE BUTTON EVENT ====================
    const saveButton = document.getElementById('btn-save');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            window.saveEditedImage();
        });
        window.logger.debug('✅ Save button event listener attached');
    } else {
        window.logger.error('❌ btn-save element not found - save will not work');
    }

    
    window.logger.debug('✅ Image processing initialized');
});

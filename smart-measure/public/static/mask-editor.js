/**
 * Mask Editor - Canvas-based mask editing tool
 * Allows users to edit background removal masks with brush and eraser
 */

window.logger.debug('🎨 Loading mask-editor.js...');

// Global state
let maskEditorState = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    brushSize: 20,
    mode: 'brush', // 'brush' or 'eraser'
    originalImage: null,
    maskImage: null,
    history: [],
    historyIndex: -1,
    maxHistory: 20
};

/**
 * Initialize mask editor
 * @param {string} originalImageUrl - URL of the original image
 * @param {string} maskImageUrl - URL of the mask image (optional)
 */
window.initMaskEditor = async function(originalImageUrl, maskImageUrl) {
    window.logger.debug('🎨 Initializing mask editor...');
    window.logger.debug('📸 Original image:', originalImageUrl);
    window.logger.debug('🎭 Mask image:', maskImageUrl);
    
    // Try mask-canvas first (dedicated mask editor page), then main-canvas (edit page)
    const canvas = document.getElementById('mask-canvas') || document.getElementById('main-canvas');
    if (!canvas) {
        window.logger.error('❌ Canvas element not found');
        return;
    }
    
    window.logger.debug('✅ Using canvas:', canvas.id);
    
    maskEditorState.canvas = canvas;
    maskEditorState.ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Load original image
    try {
        maskEditorState.originalImage = await loadImage(originalImageUrl);
        window.logger.debug('✅ Original image loaded:', maskEditorState.originalImage.width, 'x', maskEditorState.originalImage.height);
        
        // Set canvas size to match image
        canvas.width = maskEditorState.originalImage.width;
        canvas.height = maskEditorState.originalImage.height;
        
        // Load mask image if provided
        if (maskImageUrl) {
            maskEditorState.maskImage = await loadImage(maskImageUrl);
            window.logger.debug('✅ Mask image loaded');
        } else {
            // Create empty mask (all black = keep all areas)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = canvas.width;
            maskCanvas.height = canvas.height;
            const maskCtx = maskCanvas.getContext('2d');
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
            
            maskEditorState.maskImage = new Image();
            maskEditorState.maskImage.src = maskCanvas.toDataURL();
            await new Promise(resolve => maskEditorState.maskImage.onload = resolve);
            window.logger.debug('✅ Empty mask created');
        }
        
        // Initial render
        renderMaskEditor();
        
        // Save initial state to history
        saveHistory();
        
        // Setup event listeners
        setupEventListeners();
        
        window.logger.debug('✅ Mask editor initialized');
        
    } catch (error) {
        window.logger.error('❌ Failed to initialize mask editor:', error);
        alert('マスクエディタの初期化に失敗しました: ' + error.message);
    }
};

/**
 * Load image from URL
 */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image: ' + url));
        img.src = url;
    });
}

/**
 * Render mask editor canvas
 */
function renderMaskEditor() {
    const { canvas, ctx, originalImage, maskImage } = maskEditorState;
    
    if (!canvas || !ctx || !originalImage) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw original image
    ctx.drawImage(originalImage, 0, 0);
    
    // Draw mask overlay (semi-transparent)
    if (maskImage) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(maskImage, 0, 0);
        ctx.globalAlpha = 1.0;
    }
}

/**
 * Setup event listeners for drawing
 */
function setupEventListeners() {
    const canvas = maskEditorState.canvas;
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    });
}

/**
 * Start drawing
 */
function startDrawing(e) {
    maskEditorState.isDrawing = true;
    draw(e);
}

/**
 * Draw on mask
 */
function draw(e) {
    if (!maskEditorState.isDrawing) return;
    
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Draw on mask image
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    
    // Draw existing mask
    if (maskEditorState.maskImage) {
        maskCtx.drawImage(maskEditorState.maskImage, 0, 0);
    }
    
    // Draw brush stroke
    maskCtx.globalCompositeOperation = maskEditorState.mode === 'brush' ? 'source-over' : 'destination-out';
    maskCtx.fillStyle = maskEditorState.mode === 'brush' ? 'white' : 'black';
    maskCtx.beginPath();
    maskCtx.arc(x, y, maskEditorState.brushSize / 2, 0, Math.PI * 2);
    maskCtx.fill();
    
    // Update mask image
    maskEditorState.maskImage = new Image();
    maskEditorState.maskImage.src = maskCanvas.toDataURL();
    maskEditorState.maskImage.onload = () => {
        renderMaskEditor();
    };
}

/**
 * Stop drawing
 */
function stopDrawing() {
    if (maskEditorState.isDrawing) {
        maskEditorState.isDrawing = false;
        saveHistory();
    }
}

/**
 * Save current state to history
 */
function saveHistory() {
    const canvas = document.createElement('canvas');
    canvas.width = maskEditorState.canvas.width;
    canvas.height = maskEditorState.canvas.height;
    const ctx = canvas.getContext('2d');
    
    if (maskEditorState.maskImage) {
        ctx.drawImage(maskEditorState.maskImage, 0, 0);
    }
    
    const imageData = canvas.toDataURL();
    
    // Remove future history if we're not at the end
    maskEditorState.history = maskEditorState.history.slice(0, maskEditorState.historyIndex + 1);
    
    // Add new state
    maskEditorState.history.push(imageData);
    
    // Limit history size
    if (maskEditorState.history.length > maskEditorState.maxHistory) {
        maskEditorState.history.shift();
    } else {
        maskEditorState.historyIndex++;
    }
    
    window.logger.debug('💾 History saved:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
}

/**
 * Undo last action
 */
window.maskEditorUndo = function() {
    if (maskEditorState.historyIndex > 0) {
        maskEditorState.historyIndex--;
        const imageData = maskEditorState.history[maskEditorState.historyIndex];
        
        maskEditorState.maskImage = new Image();
        maskEditorState.maskImage.src = imageData;
        maskEditorState.maskImage.onload = () => {
            renderMaskEditor();
            window.logger.debug('↩️ Undo:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
        };
    } else {
        window.logger.debug('⚠️ No more undo');
    }
};

/**
 * Redo last undone action
 */
window.maskEditorRedo = function() {
    if (maskEditorState.historyIndex < maskEditorState.history.length - 1) {
        maskEditorState.historyIndex++;
        const imageData = maskEditorState.history[maskEditorState.historyIndex];
        
        maskEditorState.maskImage = new Image();
        maskEditorState.maskImage.src = imageData;
        maskEditorState.maskImage.onload = () => {
            renderMaskEditor();
            window.logger.debug('↪️ Redo:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
        };
    } else {
        window.logger.debug('⚠️ No more redo');
    }
};

/**
 * Reset mask to initial state
 */
window.maskEditorReset = function() {
    if (confirm('マスクをリセットしますか？')) {
        maskEditorState.historyIndex = 0;
        const imageData = maskEditorState.history[0];
        
        maskEditorState.maskImage = new Image();
        maskEditorState.maskImage.src = imageData;
        maskEditorState.maskImage.onload = () => {
            renderMaskEditor();
            window.logger.debug('🔄 Reset to initial state');
        };
    }
};

/**
 * Set brush size
 */
window.maskEditorSetBrushSize = function(size) {
    maskEditorState.brushSize = size;
    window.logger.debug('🖌️ Brush size set to:', size);
};

/**
 * Set mode (brush or eraser)
 */
window.maskEditorSetMode = function(mode) {
    maskEditorState.mode = mode;
    window.logger.debug('✏️ Mode set to:', mode);
    
    // Update UI
    document.querySelectorAll('[data-mode]').forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('bg-blue-600', 'text-white');
            btn.classList.remove('bg-gray-100', 'text-gray-700');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-gray-100', 'text-gray-700');
        }
    });
};

/**
 * Preview result (apply mask to original image)
 */
window.maskEditorPreview = function() {
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = maskEditorState.canvas.width;
    previewCanvas.height = maskEditorState.canvas.height;
    const previewCtx = previewCanvas.getContext('2d');
    
    // Draw original image
    previewCtx.drawImage(maskEditorState.originalImage, 0, 0);
    
    // Apply mask
    if (maskEditorState.maskImage) {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskEditorState.canvas.width;
        maskCanvas.height = maskEditorState.canvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(maskEditorState.maskImage, 0, 0);
        
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const imageData = previewCtx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
        
        // Apply mask: white = remove, black = keep
        for (let i = 0; i < maskData.data.length; i += 4) {
            const maskValue = maskData.data[i]; // R channel of mask
            if (maskValue > 128) {
                // White area - remove (set alpha to 0)
                imageData.data[i + 3] = 0;
            }
        }
        
        previewCtx.putImageData(imageData, 0, 0);
    }
    
    // Show preview in modal
    const previewDataUrl = previewCanvas.toDataURL();
    const previewWindow = window.open('', '_blank', 'width=800,height=600');
    previewWindow.document.write(`
        <html>
        <head>
            <title>マスクプレビュー</title>
            <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; background: #f0f0f0; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
            </style>
        </head>
        <body>
            <img src="${previewDataUrl}" alt="Preview" />
        </body>
        </html>
    `);
};

/**
 * Save mask
 */
window.maskEditorSave = async function(sku) {
    window.logger.debug('💾 Saving mask for SKU:', sku);
    
    if (!maskEditorState.maskImage) {
        alert('マスクが見つかりません');
        return;
    }
    
    // Get mask as data URL
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskEditorState.canvas.width;
    maskCanvas.height = maskEditorState.canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(maskEditorState.maskImage, 0, 0);
    const maskDataUrl = maskCanvas.toDataURL('image/png');
    
    try {
        // Save mask to server
        const res = await fetch(`/api/update-mask/${sku}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maskDataUrl })
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.details || error.error || 'Save failed');
        }
        
        const data = await res.json();
        window.logger.debug('✅ Mask saved:', data);
        
        alert('マスクを保存しました！');
        
        // Optionally regenerate image
        if (confirm('編集したマスクで画像を再生成しますか？')) {
            await window.maskEditorRegenerate(sku);
        }
        
    } catch (error) {
        window.logger.error('❌ Save failed:', error);
        alert('保存に失敗しました: ' + error.message);
    }
};

/**
 * Regenerate image with edited mask (client-side processing)
 */
window.maskEditorRegenerate = async function(sku) {
    window.logger.debug('🔄 Regenerating image for SKU:', sku);
    
    try {
        // Get URLs from server
        const res = await fetch(`/api/regenerate-with-mask/${sku}`, {
            method: 'POST'
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.details || error.error || 'Regeneration failed');
        }
        
        const data = await res.json();
        window.logger.debug('📦 URLs retrieved:', data);
        
        // Load original image and mask
        window.logger.debug('📸 Loading original image...');
        const originalImage = await loadImage(data.originalUrl);
        
        window.logger.debug('🎭 Loading mask image...');
        const maskImage = await loadImage(data.maskUrl);
        
        // Create canvas for composition
        const canvas = document.createElement('canvas');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        const ctx = canvas.getContext('2d');
        
        // Draw original image
        ctx.drawImage(originalImage, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Get mask data
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskImage.width;
        maskCanvas.height = maskImage.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(maskImage, 0, 0);
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        
        window.logger.debug('🎨 Applying mask to image...');
        
        // Apply mask: white in mask = transparent in result
        for (let i = 0; i < imageData.data.length; i += 4) {
            const maskValue = maskData.data[i]; // R channel
            if (maskValue > 128) {
                // White area in mask - make transparent
                imageData.data[i + 3] = 0; // Set alpha to 0
            }
        }
        
        // Put modified image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Add white background
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        const finalCtx = finalCanvas.getContext('2d');
        
        // Fill white background
        finalCtx.fillStyle = 'white';
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        
        // Draw processed image on top
        finalCtx.drawImage(canvas, 0, 0);
        
        // Resize to 1200x1200 if needed
        let finalDataUrl;
        if (typeof window.resizeAndCenterImage === 'function') {
            window.logger.debug('📐 Resizing to 1200x1200...');
            finalDataUrl = await window.resizeAndCenterImage(finalCanvas.toDataURL('image/png'), 1200, 1200);
        } else {
            finalDataUrl = finalCanvas.toDataURL('image/png');
        }
        
        window.logger.debug('📤 Uploading regenerated image...');
        
        // Upload regenerated image
        const uploadRes = await fetch(`/api/upload-processed-measurement/${sku}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageDataUrl: finalDataUrl })
        });
        
        if (!uploadRes.ok) {
            const error = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.details || error.error || 'Upload failed');
        }
        
        const uploadData = await uploadRes.json();
        window.logger.debug('✅ Image regenerated and uploaded:', uploadData.processedUrl);
        
        alert('画像を再生成しました！\n新しい画像URL: ' + uploadData.processedUrl);
        
        // Redirect back to dashboard
        if (confirm('ダッシュボードに戻りますか？')) {
            window.location.href = '/dashboard';
        }
        
    } catch (error) {
        window.logger.error('❌ Regeneration failed:', error);
        alert('再生成に失敗しました: ' + error.message);
    }
};

window.logger.debug('✅ mask-editor.js loaded');

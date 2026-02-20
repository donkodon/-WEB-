/**
 * Mask Editor - Canvas-based mask editing tool
 * Allows users to edit background removal masks with brush and eraser
 * 
 * Fix notes:
 * - ブラシ描画: offscreenMaskCanvas を常に保持し、同期的に描画
 * - 消しゴム: destination-out ではなく黒塗りに統一
 * - 座標: CSS transform スケールを考慮した正確な座標計算
 * - 保存: /api/save-mask を呼び出し、元のファイル名（_mask付き）で上書き保存
 */

window.logger.debug('🎨 Loading mask-editor.js...');

// Global state
let maskEditorState = {
    canvas: null,
    ctx: null,
    offscreenMaskCanvas: null,  // マスク編集用オフスクリーンキャンバス（常時保持）
    offscreenMaskCtx: null,
    isDrawing: false,
    brushSize: 20,
    mode: 'brush', // 'brush' or 'eraser'
    originalImage: null,
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    originalMaskImageUrl: null,  // 元のマスクURL（保存時のファイル名確定に使用）
    sku: null
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

    // SKUをcontainerから取得
    const container = document.getElementById('mask-editor-container');
    if (container) {
        maskEditorState.sku = container.dataset.sku || null;
    }

    // Try mask-canvas first (dedicated mask editor page), then main-canvas (edit page)
    const canvas = document.getElementById('mask-canvas') || document.getElementById('main-canvas');
    if (!canvas) {
        window.logger.error('❌ Canvas element not found');
        return;
    }

    window.logger.debug('✅ Using canvas:', canvas.id);

    maskEditorState.canvas = canvas;
    maskEditorState.ctx = canvas.getContext('2d', { willReadFrequently: true });
    maskEditorState.originalMaskImageUrl = maskImageUrl || null;

    // Load original image
    try {
        maskEditorState.originalImage = await loadImage(originalImageUrl);
        window.logger.debug('✅ Original image loaded:', maskEditorState.originalImage.width, 'x', maskEditorState.originalImage.height);

        // Set canvas size to match image
        canvas.width = maskEditorState.originalImage.width;
        canvas.height = maskEditorState.originalImage.height;

        // オフスクリーンマスクキャンバスを初期化
        maskEditorState.offscreenMaskCanvas = document.createElement('canvas');
        maskEditorState.offscreenMaskCanvas.width = canvas.width;
        maskEditorState.offscreenMaskCanvas.height = canvas.height;
        maskEditorState.offscreenMaskCtx = maskEditorState.offscreenMaskCanvas.getContext('2d', { willReadFrequently: true });

        // Load mask image if provided
        if (maskImageUrl) {
            try {
                const maskImg = await loadImage(maskImageUrl);
                maskEditorState.offscreenMaskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                window.logger.debug('✅ Mask image loaded and drawn to offscreen canvas');
            } catch (maskErr) {
                window.logger.warn('⚠️ Failed to load mask image, creating empty mask:', maskErr);
                // 読み込み失敗時は空のマスク（黒=すべて保持）
                maskEditorState.offscreenMaskCtx.fillStyle = 'black';
                maskEditorState.offscreenMaskCtx.fillRect(0, 0, canvas.width, canvas.height);
            }
        } else {
            // 空のマスク（黒=すべて保持）
            maskEditorState.offscreenMaskCtx.fillStyle = 'black';
            maskEditorState.offscreenMaskCtx.fillRect(0, 0, canvas.width, canvas.height);
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
 * オリジナル画像 + マスクオーバーレイ（半透明）を描画
 */
function renderMaskEditor() {
    const { canvas, ctx, originalImage, offscreenMaskCanvas } = maskEditorState;

    if (!canvas || !ctx || !originalImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw original image
    ctx.drawImage(originalImage, 0, 0);

    // Draw mask overlay (半透明で重ねる)
    if (offscreenMaskCanvas) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(offscreenMaskCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
    }
}

/**
 * Get canvas position with CSS scale correction
 * CSSでcanvasがスケールされている場合の正確な座標を返す
 */
function getCanvasPosition(e) {
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();

    // CSSスケール補正（canvas描画サイズ / CSS表示サイズ）
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

/**
 * Setup event listeners for drawing
 */
function setupEventListeners() {
    const canvas = maskEditorState.canvas;

    // --- Mouse Events ---
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // --- Touch Events ---
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startDrawingAt(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        drawAt(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopDrawing();
    }, { passive: false });
}

/**
 * Start drawing (mouse)
 */
function startDrawing(e) {
    maskEditorState.isDrawing = true;
    const pos = getCanvasPosition(e);
    drawDot(pos.x, pos.y);
}

/**
 * Start drawing at specific coordinates (touch)
 */
function startDrawingAt(clientX, clientY) {
    maskEditorState.isDrawing = true;
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    drawDot(x, y);
}

/**
 * Draw on mask (mouse move)
 */
function draw(e) {
    if (!maskEditorState.isDrawing) return;
    const pos = getCanvasPosition(e);
    drawDot(pos.x, pos.y);
}

/**
 * Draw at specific coordinates (touch move)
 */
function drawAt(clientX, clientY) {
    if (!maskEditorState.isDrawing) return;
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    drawDot(x, y);
}

/**
 * Draw a single dot on the offscreen mask canvas
 * ブラシ: 白く塗る（削除エリア）
 * 消しゴム: 黒く塗る（保持エリア）
 */
function drawDot(x, y) {
    const { offscreenMaskCtx, brushSize, mode } = maskEditorState;
    if (!offscreenMaskCtx) return;

    const radius = brushSize / 2;

    // compositeOperation をリセットしてから描画
    offscreenMaskCtx.globalCompositeOperation = 'source-over';

    if (mode === 'brush') {
        // ブラシ: 白く塗る → 背景として削除
        offscreenMaskCtx.fillStyle = 'white';
    } else {
        // 消しゴム: 黒く塗る → 商品として保持
        offscreenMaskCtx.fillStyle = 'black';
    }

    offscreenMaskCtx.beginPath();
    offscreenMaskCtx.arc(x, y, radius, 0, Math.PI * 2);
    offscreenMaskCtx.fill();

    // 即時描画反映
    renderMaskEditor();
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
    if (!maskEditorState.offscreenMaskCanvas) return;

    // 現在のoffscreenMaskCanvasの状態をコピー
    const snapshot = document.createElement('canvas');
    snapshot.width = maskEditorState.offscreenMaskCanvas.width;
    snapshot.height = maskEditorState.offscreenMaskCanvas.height;
    const snapCtx = snapshot.getContext('2d');
    snapCtx.drawImage(maskEditorState.offscreenMaskCanvas, 0, 0);

    const imageData = snapshot.toDataURL();

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
 * Restore mask from history data URL
 */
function restoreMaskFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const { offscreenMaskCtx, offscreenMaskCanvas } = maskEditorState;
            if (offscreenMaskCtx && offscreenMaskCanvas) {
                offscreenMaskCtx.clearRect(0, 0, offscreenMaskCanvas.width, offscreenMaskCanvas.height);
                offscreenMaskCtx.drawImage(img, 0, 0);
            }
            renderMaskEditor();
            resolve();
        };
        img.src = dataUrl;
    });
}

/**
 * Undo last action
 */
window.maskEditorUndo = async function() {
    if (maskEditorState.historyIndex > 0) {
        maskEditorState.historyIndex--;
        const imageData = maskEditorState.history[maskEditorState.historyIndex];
        await restoreMaskFromDataUrl(imageData);
        window.logger.debug('↩️ Undo:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
    } else {
        window.logger.debug('⚠️ No more undo');
    }
};

/**
 * Redo last undone action
 */
window.maskEditorRedo = async function() {
    if (maskEditorState.historyIndex < maskEditorState.history.length - 1) {
        maskEditorState.historyIndex++;
        const imageData = maskEditorState.history[maskEditorState.historyIndex];
        await restoreMaskFromDataUrl(imageData);
        window.logger.debug('↪️ Redo:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
    } else {
        window.logger.debug('⚠️ No more redo');
    }
};

/**
 * Reset mask to initial state
 */
window.maskEditorReset = async function() {
    if (confirm('マスクをリセットしますか？')) {
        maskEditorState.historyIndex = 0;
        const imageData = maskEditorState.history[0];
        await restoreMaskFromDataUrl(imageData);
        window.logger.debug('🔄 Reset to initial state');
    }
};

/**
 * Set brush size
 */
window.maskEditorSetBrushSize = function(size) {
    maskEditorState.brushSize = parseInt(size, 10);
    window.logger.debug('🖌️ Brush size set to:', maskEditorState.brushSize);
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
    const { originalImage, offscreenMaskCanvas, canvas } = maskEditorState;

    if (!originalImage || !offscreenMaskCanvas) {
        alert('プレビューできません: 画像またはマスクが初期化されていません');
        return;
    }

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const previewCtx = previewCanvas.getContext('2d');

    // Draw original image
    previewCtx.drawImage(originalImage, 0, 0);

    // Apply mask
    const maskData = offscreenMaskCanvas.getContext('2d').getImageData(0, 0, offscreenMaskCanvas.width, offscreenMaskCanvas.height);
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

    // Show preview in modal
    const previewDataUrl = previewCanvas.toDataURL();
    const previewWindow = window.open('', '_blank', 'width=800,height=600');
    if (previewWindow) {
        previewWindow.document.write(`
            <html>
            <head>
                <title>マスクプレビュー</title>
                <style>
                    body { margin: 0; display: flex; justify-content: center; align-items: center; background: #f0f0f0; min-height: 100vh; }
                    img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                </style>
            </head>
            <body>
                <img src="${previewDataUrl}" alt="Preview" />
            </body>
            </html>
        `);
    }
};

/**
 * Extract filename part (without extension) from URL
 * 例: "https://example.com/company/sku/image_mask.png" → "image_mask"
 * 例: "https://example.com/company/sku/abc123.jpg" → "abc123"
 */
function extractFilenamePart(url) {
    if (!url) return null;
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split('/').pop() || '';
        // 拡張子を除去
        return filename.replace(/\.[^.]+$/, '');
    } catch (e) {
        // URLパースに失敗した場合はそのまま返す
        const filename = url.split('/').pop() || '';
        return filename.replace(/\.[^.]+$/, '');
    }
}

/**
 * Save mask
 * マスク画像と同じファイル名（元のマスクURLのファイル名）で上書き保存
 * マスクが未存在の場合は {sku}_mask というファイル名で新規保存
 */
window.maskEditorSave = async function(sku) {
    window.logger.debug('💾 Saving mask for SKU:', sku);

    const { offscreenMaskCanvas, originalMaskImageUrl } = maskEditorState;

    if (!offscreenMaskCanvas) {
        alert('マスクが見つかりません');
        return;
    }

    // Get mask as PNG data URL
    const maskDataUrl = offscreenMaskCanvas.toDataURL('image/png');

    // ファイル名を元のマスクURLから取得
    // 元のマスクURL例: https://pub-xxx.r2.dev/{companyId}/{sku}/abc123_mask.png
    // → filenamePart = "abc123_mask"（拡張子なし）
    let filenamePart = extractFilenamePart(originalMaskImageUrl);
    
    if (!filenamePart) {
        // マスクが未存在（初回保存）の場合は {sku}_mask を使用
        filenamePart = `${sku}_mask`;
        window.logger.debug('📄 No existing mask URL, using default filename:', filenamePart);
    } else {
        window.logger.debug('📄 Filename part:', filenamePart, '(from mask URL:', originalMaskImageUrl, ')');
    }

    try {
        // /api/save-mask を呼び出して同じファイル名で上書き保存
        const res = await fetch(`/api/save-mask/${sku}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maskDataUrl, filenamePart })
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

/**
 * Mask Editor - Canvas-based mask editing tool
 *
 * 修正済みバグ:
 * 【ブラシ】
 *   - offscreenMaskCanvas を常時保持し非同期Image生成を廃止（即時描画）
 *   - CSS scale 補正で正確な座標計算
 *   - 消しゴムを destination-out → 黒塗り(fillStyle='black') に統一
 *   - crossOrigin画像のtainted canvas問題: loadImage失敗時は /api/image-proxy 経由で取得
 *
 * 【保存】
 *   - /api/save-mask に window.authenticatedFetch でFirebaseトークンを送信
 *   - companyId はサーバー側でFirebase認証済みuserから取得（cookieに依存しない）
 *   - 元のマスクURLのファイル名で上書き保存（初回は {sku}_mask）
 */

window.logger.debug('🎨 Loading mask-editor.js...');

// Global state
let maskEditorState = {
    canvas: null,
    ctx: null,
    offscreenMaskCanvas: null,
    offscreenMaskCtx: null,
    isDrawing: false,
    brushSize: 20,
    mode: 'brush',  // 'brush' (削除) or 'eraser' (復元)
    viewMode: 'mask',  // 'mask' (白黒), 'overlay' (重ね表示), 'result' (結果)
    originalImage: null,
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    originalMaskImageUrl: null,
    sku: null,
    filenamePart: null  // オリジナル画像のファイル名ベース (例: 4469bcc2-09b1-4218-8ad4-78fd92ced9a7)
};

// =============================================
// 画像ロード（CORS tainted canvas 対策）
// =============================================

/**
 * 画像をロード（crossOrigin=anonymous で試み、失敗したらプロキシ経由）
 */
async function loadImage(url) {
    // まず crossOrigin=anonymous で試みる
    try {
        return await loadImageDirect(url, true);
    } catch (e) {
        window.logger.warn('⚠️ crossOrigin load failed, trying proxy:', url, e.message);
        // プロキシ経由で再試行（tainted canvas を回避）
        try {
            return await loadImageViaProxy(url);
        } catch (e2) {
            window.logger.warn('⚠️ proxy also failed, trying without crossOrigin:', url, e2.message);
            // 最終フォールバック: crossOrigin なし（tainted になるが表示はできる）
            return await loadImageDirect(url, false);
        }
    }
}

function loadImageDirect(url, withCrossOrigin) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (withCrossOrigin) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load: ' + url));
        // キャッシュバスターは付けない（R2のCORSを信頼）
        img.src = url;
    });
}

async function loadImageViaProxy(url) {
    // /api/images/proxy?url=... 経由でサーバーから取得
    const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Proxy fetch failed: ' + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return await loadImageDirect(objectUrl, false);
}

// =============================================
// 初期化
// =============================================

window.initMaskEditor = async function(originalImageUrl, maskImageUrl) {
    window.logger.debug('🎨 Initializing mask editor...');
    window.logger.debug('📸 Original image:', originalImageUrl);
    window.logger.debug('🎭 Mask image:', maskImageUrl);

    const container = document.getElementById('mask-editor-container');
    if (container) {
        maskEditorState.sku = container.dataset.sku || null;
        maskEditorState.filenamePart = container.dataset.filenamePart || null;
        window.logger.debug('📁 filenamePart from container:', maskEditorState.filenamePart);
    }

    const canvas = document.getElementById('mask-canvas') || document.getElementById('main-canvas');
    if (!canvas) {
        window.logger.error('❌ Canvas element not found');
        return;
    }

    window.logger.debug('✅ Using canvas:', canvas.id);

    maskEditorState.canvas = canvas;
    maskEditorState.ctx = canvas.getContext('2d', { willReadFrequently: true });
    maskEditorState.originalMaskImageUrl = maskImageUrl || null;

    try {
        // オリジナル画像のロード
        maskEditorState.originalImage = await loadImage(originalImageUrl);
        window.logger.debug('✅ Original image loaded:',
            maskEditorState.originalImage.width, 'x', maskEditorState.originalImage.height);

        canvas.width = maskEditorState.originalImage.width;
        canvas.height = maskEditorState.originalImage.height;

        // オフスクリーンマスクキャンバス初期化
        maskEditorState.offscreenMaskCanvas = document.createElement('canvas');
        maskEditorState.offscreenMaskCanvas.width = canvas.width;
        maskEditorState.offscreenMaskCanvas.height = canvas.height;
        maskEditorState.offscreenMaskCtx = maskEditorState.offscreenMaskCanvas.getContext('2d', { willReadFrequently: true });

        // マスク画像のロード
        if (maskImageUrl) {
            try {
                const maskImg = await loadImage(maskImageUrl);
                maskEditorState.offscreenMaskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                window.logger.debug('✅ Mask image drawn to offscreen canvas');
            } catch (maskErr) {
                window.logger.warn('⚠️ Mask load failed, creating empty mask:', maskErr.message);
                maskEditorState.offscreenMaskCtx.fillStyle = 'black';
                maskEditorState.offscreenMaskCtx.fillRect(0, 0, canvas.width, canvas.height);
            }
        } else {
            maskEditorState.offscreenMaskCtx.fillStyle = 'black';
            maskEditorState.offscreenMaskCtx.fillRect(0, 0, canvas.width, canvas.height);
            window.logger.debug('✅ Empty mask created');
        }

        renderMaskEditor();
        saveHistory();
        setupEventListeners();
        
        // UIの初期状態を設定
        window.maskEditorSetMode('brush');  // デフォルト: 削除ブラシ
        window.maskEditorSetViewMode('mask');  // デフォルト: マスク表示

        window.logger.debug('✅ Mask editor initialized successfully');

    } catch (error) {
        window.logger.error('❌ Failed to initialize mask editor:', error);
        alert('マスクエディタの初期化に失敗しました: ' + error.message);
    }
};

// =============================================
// 描画
// =============================================

function renderMaskEditor() {
    const { canvas, ctx, originalImage, offscreenMaskCanvas, viewMode } = maskEditorState;
    if (!canvas || !ctx || !originalImage) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // viewModeに応じて表示を切り替え
    switch(viewMode) {
        case 'mask':
            // マスクモード: 元画像 + マスク（半透明）
            try {
                ctx.drawImage(originalImage, 0, 0);
            } catch (e) {
                window.logger.warn('⚠️ drawImage originalImage failed (tainted?):', e.message);
            }
            if (offscreenMaskCanvas) {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(offscreenMaskCanvas, 0, 0);
                ctx.globalAlpha = 1.0;
            }
            break;
            
        case 'overlay':
            // オーバーレイモード: 元画像 + 削除エリアを赤色半透明で表示
            try {
                ctx.drawImage(originalImage, 0, 0);
            } catch (e) {
                window.logger.warn('⚠️ drawImage originalImage failed (tainted?):', e.message);
            }
            if (offscreenMaskCanvas) {
                // マスクの白いピクセル（削除エリア）だけを赤色で表示
                const maskData = maskEditorState.offscreenMaskCtx.getImageData(0, 0, canvas.width, canvas.height);
                const overlayData = ctx.createImageData(canvas.width, canvas.height);
                
                for (let i = 0; i < maskData.data.length; i += 4) {
                    const gray = maskData.data[i];  // グレースケール値
                    if (gray > 128) {  // 白い部分（削除エリア）
                        overlayData.data[i] = 255;      // R: 赤色
                        overlayData.data[i+1] = 0;      // G
                        overlayData.data[i+2] = 0;      // B
                        overlayData.data[i+3] = 128;    // A: 半透明
                    }
                }
                ctx.putImageData(overlayData, 0, 0);
            }
            break;
            
        case 'result':
            // 結果モード: 背景削除結果を表示
            try {
                ctx.drawImage(originalImage, 0, 0);
            } catch (e) {
                window.logger.warn('⚠️ drawImage originalImage failed (tainted?):', e.message);
            }
            if (offscreenMaskCanvas) {
                // マスクを適用（白→透明、黒→不透明）
                ctx.globalCompositeOperation = 'destination-in';
                
                // マスクを反転して適用
                const invertedMask = createInvertedMaskForPreview();
                ctx.drawImage(invertedMask, 0, 0);
                
                ctx.globalCompositeOperation = 'source-over';
            }
            break;
    }
}

/**
 * マスクを反転（白→透明、黒→不透明）
 * プレビュー用の一時的なcanvasを生成
 */
function createInvertedMaskForPreview() {
    const { offscreenMaskCanvas } = maskEditorState;
    if (!offscreenMaskCanvas) return null;
    
    const inverted = document.createElement('canvas');
    inverted.width = offscreenMaskCanvas.width;
    inverted.height = offscreenMaskCanvas.height;
    const ctx = inverted.getContext('2d');
    
    // マスクを描画
    ctx.drawImage(offscreenMaskCanvas, 0, 0);
    
    // ピクセル単位で反転
    const imageData = ctx.getImageData(0, 0, inverted.width, inverted.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const gray = imageData.data[i];  // グレースケール値（0-255）
        // 白(255) → Alpha 0（透明）
        // 黒(0) → Alpha 255（不透明）
        imageData.data[i] = 255;      // R
        imageData.data[i+1] = 255;    // G
        imageData.data[i+2] = 255;    // B
        imageData.data[i+3] = 255 - gray;  // Alpha（反転）
    }
    ctx.putImageData(imageData, 0, 0);
    
    return inverted;
}

/**
 * CSS scale を考慮した canvas 座標計算
 */
function getCanvasPosition(e) {
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function setupEventListeners() {
    const canvas = maskEditorState.canvas;

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

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

function startDrawing(e) {
    maskEditorState.isDrawing = true;
    const pos = getCanvasPosition(e);
    drawDot(pos.x, pos.y);
}

function startDrawingAt(clientX, clientY) {
    maskEditorState.isDrawing = true;
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    drawDot(x, y);
}

function draw(e) {
    if (!maskEditorState.isDrawing) return;
    const pos = getCanvasPosition(e);
    drawDot(pos.x, pos.y);
}

function drawAt(clientX, clientY) {
    if (!maskEditorState.isDrawing) return;
    const canvas = maskEditorState.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    drawDot(x, y);
}

/**
 * オフスクリーンキャンバスに1点描画
 * ブラシ → 白（削除エリア）
 * 消しゴム → 黒（保持エリア）
 */
function drawDot(x, y) {
    const { offscreenMaskCtx, brushSize, mode } = maskEditorState;
    if (!offscreenMaskCtx) return;

    offscreenMaskCtx.globalCompositeOperation = 'source-over';
    offscreenMaskCtx.fillStyle = (mode === 'brush') ? 'white' : 'black';
    offscreenMaskCtx.beginPath();
    offscreenMaskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    offscreenMaskCtx.fill();

    renderMaskEditor();
}

function stopDrawing() {
    if (maskEditorState.isDrawing) {
        maskEditorState.isDrawing = false;
        saveHistory();
    }
}

// =============================================
// 履歴管理
// =============================================

function saveHistory() {
    if (!maskEditorState.offscreenMaskCanvas) return;

    const snapshot = document.createElement('canvas');
    snapshot.width = maskEditorState.offscreenMaskCanvas.width;
    snapshot.height = maskEditorState.offscreenMaskCanvas.height;
    snapshot.getContext('2d').drawImage(maskEditorState.offscreenMaskCanvas, 0, 0);

    maskEditorState.history = maskEditorState.history.slice(0, maskEditorState.historyIndex + 1);
    maskEditorState.history.push(snapshot.toDataURL());

    if (maskEditorState.history.length > maskEditorState.maxHistory) {
        maskEditorState.history.shift();
    } else {
        maskEditorState.historyIndex++;
    }

    window.logger.debug('💾 History saved:', maskEditorState.historyIndex + 1, '/', maskEditorState.history.length);
}

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

window.maskEditorUndo = async function() {
    if (maskEditorState.historyIndex > 0) {
        maskEditorState.historyIndex--;
        await restoreMaskFromDataUrl(maskEditorState.history[maskEditorState.historyIndex]);
        window.logger.debug('↩️ Undo:', maskEditorState.historyIndex + 1);
    }
};

window.maskEditorRedo = async function() {
    if (maskEditorState.historyIndex < maskEditorState.history.length - 1) {
        maskEditorState.historyIndex++;
        await restoreMaskFromDataUrl(maskEditorState.history[maskEditorState.historyIndex]);
        window.logger.debug('↪️ Redo:', maskEditorState.historyIndex + 1);
    }
};

window.maskEditorReset = async function() {
    if (confirm('マスクをリセットしますか？')) {
        maskEditorState.historyIndex = 0;
        await restoreMaskFromDataUrl(maskEditorState.history[0]);
        window.logger.debug('🔄 Reset');
    }
};

// =============================================
// ツール設定
// =============================================

window.maskEditorSetBrushSize = function(size) {
    maskEditorState.brushSize = parseInt(size, 10);
    window.logger.debug('🖌️ Brush size:', maskEditorState.brushSize);
};

window.maskEditorSetMode = function(mode) {
    maskEditorState.mode = mode;
    window.logger.debug('✏️ Mode:', mode);
    
    // UIの更新（赤・緑の色分け）
    document.querySelectorAll('[data-mode]').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        if (btn.dataset.mode === 'brush') {
            // 削除ブラシ（赤）
            btn.classList.toggle('bg-red-600', isActive);
            btn.classList.toggle('bg-red-700', false);
            btn.classList.toggle('bg-green-600', false);
            btn.classList.toggle('bg-green-700', false);
            btn.classList.toggle('text-white', true);
            if (!isActive) {
                btn.classList.add('opacity-60');
            } else {
                btn.classList.remove('opacity-60');
            }
        } else if (btn.dataset.mode === 'eraser') {
            // 復元ブラシ（緑）
            btn.classList.toggle('bg-green-600', isActive);
            btn.classList.toggle('bg-green-700', false);
            btn.classList.toggle('bg-red-600', false);
            btn.classList.toggle('bg-red-700', false);
            btn.classList.toggle('text-white', true);
            if (!isActive) {
                btn.classList.add('opacity-60');
            } else {
                btn.classList.remove('opacity-60');
            }
        }
    });
};

// 表示モード切替
window.maskEditorSetViewMode = function(viewMode) {
    maskEditorState.viewMode = viewMode;
    window.logger.debug('👁️ View mode:', viewMode);
    
    // UIの更新
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
        const isActive = btn.dataset.viewMode === viewMode;
        btn.classList.toggle('bg-gray-700', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-gray-100', !isActive);
        btn.classList.toggle('text-gray-700', !isActive);
    });
    
    // 再描画
    renderMaskEditor();
};

// =============================================
// プレビュー
// =============================================

window.maskEditorPreview = function() {
    const { originalImage, offscreenMaskCanvas, canvas } = maskEditorState;
    if (!originalImage || !offscreenMaskCanvas) {
        alert('プレビューできません: 初期化が完了していません');
        return;
    }

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.drawImage(originalImage, 0, 0);

    const maskData = offscreenMaskCanvas.getContext('2d').getImageData(0, 0, offscreenMaskCanvas.width, offscreenMaskCanvas.height);
    const imageData = previewCtx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
        if (maskData.data[i] > 128) imageData.data[i + 3] = 0;
    }
    previewCtx.putImageData(imageData, 0, 0);

    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) {
        w.document.write(`<html><head><title>マスクプレビュー</title>
        <style>body{margin:0;display:flex;justify-content:center;align-items:center;background:#ccc;min-height:100vh;}
        img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head>
        <body><img src="${previewCanvas.toDataURL()}" /></body></html>`);
    }
};

// =============================================
// 保存
// =============================================

/**
 * マスクを保存
 * - maskDataUrl だけ送る（ファイル名はサーバー側がDBから決定）
 * - Firebase トークンを authenticatedFetch で送信
 * - alert/confirm は一切表示しない（トースト通知のみ）
 */
window.maskEditorSave = async function(sku) {
    window.logger.debug('💾 Saving mask for SKU:', sku);

    const { offscreenMaskCanvas } = maskEditorState;
    if (!offscreenMaskCanvas) {
        showToast('マスクが見つかりません', 'error');
        return;
    }

    const maskDataUrl = offscreenMaskCanvas.toDataURL('image/png');
    const fetchFn = (typeof window.authenticatedFetch === 'function')
        ? window.authenticatedFetch
        : fetch;

    try {
        showToast('保存中...', 'info');

        // filenamePart を一緒に送る（例: 4469bcc2-09b1-4218-8ad4-78fd92ced9a7）
        // サーバー側で {filenamePart}_mask.png として保存される
        const filenamePart = maskEditorState.filenamePart || null;
        window.logger.debug('📁 Sending filenamePart:', filenamePart);

        const res = await fetchFn(`/api/save-mask/${sku}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maskDataUrl, filenamePart })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.details || errorData.error || `Save failed (${res.status})`);
        }

        const data = await res.json();
        window.logger.debug('✅ Mask saved:', data.r2Key, '| overwrite:', data.isOverwrite);
        window.logger.debug('📍 Mask URL:', data.maskUrl);
        window.logger.debug('📦 Mask basename:', data.maskBasename);

        showToast('マスクを保存しました', 'success');

    } catch (error) {
        window.logger.error('❌ Save failed:', error);
        showToast('保存に失敗しました: ' + error.message, 'error');
    }
};

/**
 * トースト通知を表示（alert/confirmの代替）
 */
function showToast(message, type = 'info') {
    // 既存のトーストがあれば削除
    const existing = document.getElementById('mask-toast');
    if (existing) existing.remove();

    const colors = {
        success: 'bg-green-600',
        error:   'bg-red-600',
        info:    'bg-blue-600'
    };
    const icons = {
        success: '✓',
        error:   '✕',
        info:    '…'
    };

    const toast = document.createElement('div');
    toast.id = 'mask-toast';
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    // 3秒後に自動消去（errorは5秒）
    setTimeout(() => toast.remove(), type === 'error' ? 5000 : 3000);
}

// =============================================
// 再生成
// =============================================

window.maskEditorRegenerate = async function(sku) {
    window.logger.debug('🔄 Regenerating image for SKU:', sku);

    try {
        const fetchFn = (typeof window.authenticatedFetch === 'function')
            ? window.authenticatedFetch
            : fetch;

        const res = await fetchFn(`/api/regenerate-with-mask/${sku}`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.details || err.error || 'Regeneration failed');
        }

        const data = await res.json();
        window.logger.debug('📦 URLs:', data);

        const originalImage = await loadImage(data.originalUrl);
        const maskImage = await loadImage(data.maskUrl);

        const canvas = document.createElement('canvas');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(originalImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskImage.width;
        maskCanvas.height = maskImage.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.drawImage(maskImage, 0, 0);
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

        for (let i = 0; i < imageData.data.length; i += 4) {
            if (maskData.data[i] > 128) imageData.data[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.fillStyle = 'white';
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        finalCtx.drawImage(canvas, 0, 0);

        let finalDataUrl;
        if (typeof window.resizeAndCenterImage === 'function') {
            finalDataUrl = await window.resizeAndCenterImage(finalCanvas.toDataURL('image/png'), 1200, 1200);
        } else {
            finalDataUrl = finalCanvas.toDataURL('image/png');
        }

        const uploadRes = await fetchFn(`/api/upload-processed-measurement/${sku}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageDataUrl: finalDataUrl })
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(err.details || err.error || 'Upload failed');
        }

        const uploadData = await uploadRes.json();
        window.logger.debug('✅ Image regenerated:', uploadData.processedUrl);

        alert('画像を再生成しました！\n' + uploadData.processedUrl);

        if (confirm('ダッシュボードに戻りますか？')) {
            window.location.href = '/dashboard';
        }

    } catch (error) {
        window.logger.error('❌ Regeneration failed:', error);
        alert('再生成に失敗しました: ' + error.message);
    }
};

window.logger.debug('✅ mask-editor.js loaded');

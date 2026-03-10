/**
 * free-crop-tool.js - 自由サイズクロップツール
 * 
 * 責務:
 * - ユーザーがマウスドラッグで自由に範囲を選択できる
 * - 8箇所のハンドル（四隅+辺）でサイズ調整
 * - 選択範囲の移動
 * - 選択範囲をPNG画像として保存
 * 
 * アーキテクチャ:
 * - State管理: active, srcCanvas, overlay, crop座標
 * - UI操作: オーバーレイcanvas、プレビュー、情報表示
 * - 座標変換: canvas表示座標 ↔ 元画像座標
 * - API連携: 選択範囲をbase64 PNG化してサーバーに送信
 */
(function () {
    'use strict';

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 定数定義
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const CONFIG = {
        MIN_SIZE: 50,              // 最小サイズ (px)
        HANDLE_SIZE: 12,           // ハンドルのサイズ (px)
        HANDLE_COLOR: '#ff6600',   // ハンドルの色（オレンジ）
        BORDER_COLOR: '#ff6600',   // 枠線の色
        BORDER_WIDTH: 2,           // 枠線の太さ (px)
        OVERLAY_OPACITY: 0.5,      // 外側の暗幕の透明度
        PREVIEW_SIZE: 200          // プレビューcanvasのサイズ (px)
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // State管理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const state = {
        active: false,             // ツールがアクティブか
        srcCanvas: null,           // 元画像を描画したcanvas
        overlay: null,             // オーバーレイcanvas要素
        overlayCtx: null,          // オーバーレイcanvasコンテキスト
        
        // クロップ座標（元画像座標系）
        cropX: 0,
        cropY: 0,
        cropW: 0,
        cropH: 0,
        
        // ドラッグ状態
        isSelecting: false,        // 新規選択中
        isDragging: false,         // 移動中
        isResizing: false,         // リサイズ中
        dragStartX: 0,             // ドラッグ開始X座標
        dragStartY: 0,             // ドラッグ開始Y座標
        activeHandle: null         // アクティブなハンドル ('nw','ne','sw','se','n','e','s','w','move')
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ライフサイクル管理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * クロップツールを開始
     */
    function startFreeCrop() {
        const S = window.EditorState;
        if (!S) {
            console.error('[free-crop] EditorState not found');
            return;
        }

        const imgUrl = S.processedSrc || S.originalSrc;
        if (!imgUrl) {
            alert('画像URLが取得できません。');
            return;
        }

        showCropPanel();
        setStatus('画像を読み込み中...');

        loadImage(imgUrl)
            .then(imageData => {
                initializeCropState(imageData);
                buildOverlay();
                state.active = true;
                setStatus('画像上でドラッグして範囲を選択してください');
                
                window.logger && window.logger.info(
                    `✅ [free-crop] Tool started: ${state.srcCanvas.width}×${state.srcCanvas.height}`
                );
            })
            .catch(error => {
                console.error('[free-crop] Failed to load image:', error);
                setStatus('❌ 画像の読み込みに失敗しました');
            });
    }

    /**
     * クロップツールを終了
     */
    function stopFreeCrop() {
        state.active = false;
        removeOverlay();
        hideCropPanel();
        resetCropState();
        
        // クロップ枠を非表示に戻す
        if (window.CropOverlay) {
            window.CropOverlay.hide();
        }
        
        window.logger && window.logger.debug('✅ [free-crop] Tool stopped');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 画像読み込み
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * 画像を読み込んでcanvasに描画
     * @param {string} url - 画像URL
     * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
     */
    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const loader = new Image();
            loader.crossOrigin = 'anonymous';
            
            loader.onload = function () {
                const canvas = document.createElement('canvas');
                canvas.width = loader.naturalWidth;
                canvas.height = loader.naturalHeight;
                canvas.getContext('2d').drawImage(loader, 0, 0);
                
                resolve({
                    canvas: canvas,
                    width: canvas.width,
                    height: canvas.height
                });
            };
            
            loader.onerror = function () {
                reject(new Error('Image load failed'));
            };
            
            // キャッシュバスター付きでロード
            loader.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
        });
    }

    /**
     * クロップ状態を初期化
     * @param {{canvas: HTMLCanvasElement}} imageData
     */
    function initializeCropState(imageData) {
        state.srcCanvas = imageData.canvas;
        state.cropX = 0;
        state.cropY = 0;
        state.cropW = 0;
        state.cropH = 0;
    }

    /**
     * クロップ状態をリセット
     */
    function resetCropState() {
        state.srcCanvas = null;
        state.cropX = 0;
        state.cropY = 0;
        state.cropW = 0;
        state.cropH = 0;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // UI管理（パネル表示切り替え）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    function showCropPanel() {
        const adjustTools = document.getElementById('adjust-tools');
        const maskTools = document.getElementById('mask-tools');
        const cropPanel = document.getElementById('free-crop-panel');
        
        if (adjustTools) adjustTools.style.display = 'none';
        if (maskTools) maskTools.style.display = 'none';
        if (cropPanel) cropPanel.style.display = 'flex';
    }

    function hideCropPanel() {
        const adjustTools = document.getElementById('adjust-tools');
        const cropPanel = document.getElementById('free-crop-panel');
        
        if (adjustTools) adjustTools.style.display = 'block';
        if (cropPanel) cropPanel.style.display = 'none';
    }

    function setStatus(text) {
        const status = document.getElementById('free-crop-status');
        if (status) status.textContent = text;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // オーバーレイ管理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * オーバーレイcanvasを作成して画像キャンバスに重ねる
     */
    function buildOverlay() {
        const mainCanvas = window.EditorState.canvas;
        if (!mainCanvas) {
            console.error('[free-crop] Main canvas not found');
            return;
        }

        const canvasWrapper = mainCanvas.parentElement;
        if (!canvasWrapper) {
            console.error('[free-crop] Canvas wrapper not found');
            return;
        }

        // オーバーレイcanvas作成
        state.overlay = document.createElement('canvas');
        state.overlay.id = 'free-crop-overlay';
        state.overlay.style.position = 'absolute';
        state.overlay.style.top = '0';
        state.overlay.style.left = '0';
        state.overlay.style.cursor = 'crosshair';
        state.overlay.style.zIndex = '100';
        state.overlay.style.pointerEvents = 'auto';

        // 画像キャンバスと同じサイズに設定
        state.overlay.width = mainCanvas.offsetWidth;
        state.overlay.height = mainCanvas.offsetHeight;
        state.overlay.style.width = mainCanvas.offsetWidth + 'px';
        state.overlay.style.height = mainCanvas.offsetHeight + 'px';

        state.overlayCtx = state.overlay.getContext('2d');

        // イベントリスナー登録
        state.overlay.addEventListener('mousedown', onMouseDown);
        state.overlay.addEventListener('mousemove', onMouseMove);
        state.overlay.addEventListener('mouseup', onMouseUp);
        state.overlay.addEventListener('mouseleave', onMouseUp);

        // 画像キャンバスの親要素に追加
        canvasWrapper.style.position = 'relative';
        canvasWrapper.appendChild(state.overlay);
        
        window.logger && window.logger.debug(
            `✅ [free-crop] Overlay created: ${state.overlay.width}×${state.overlay.height}px`
        );
        
        renderOverlay();
    }

    /**
     * オーバーレイを削除
     */
    function removeOverlay() {
        if (state.overlay && state.overlay.parentElement) {
            state.overlay.removeEventListener('mousedown', onMouseDown);
            state.overlay.removeEventListener('mousemove', onMouseMove);
            state.overlay.removeEventListener('mouseup', onMouseUp);
            state.overlay.removeEventListener('mouseleave', onMouseUp);
            state.overlay.parentElement.removeChild(state.overlay);
            state.overlay = null;
            state.overlayCtx = null;
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 座標変換
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * Canvas表示座標 → 元画像座標
     * @param {number} cx - Canvas X座標
     * @param {number} cy - Canvas Y座標
     * @returns {{x: number, y: number}}
     */
    function canvasToImage(cx, cy) {
        const mainCanvas = window.EditorState.canvas;
        const scaleX = state.srcCanvas.width / mainCanvas.offsetWidth;
        const scaleY = state.srcCanvas.height / mainCanvas.offsetHeight;
        
        return {
            x: Math.round(cx * scaleX),
            y: Math.round(cy * scaleY)
        };
    }

    /**
     * 元画像座標 → Canvas表示座標
     * @param {number} ix - 元画像 X座標
     * @param {number} iy - 元画像 Y座標
     * @returns {{x: number, y: number}}
     */
    function imageToCanvas(ix, iy) {
        const mainCanvas = window.EditorState.canvas;
        const scaleX = mainCanvas.offsetWidth / state.srcCanvas.width;
        const scaleY = mainCanvas.offsetHeight / state.srcCanvas.height;
        
        return {
            x: ix * scaleX,
            y: iy * scaleY
        };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // マウスイベント処理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    function onMouseDown(e) {
        if (!state.active) return;

        const rect = state.overlay.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // 選択範囲がない場合は新規選択開始
        if (state.cropW === 0 || state.cropH === 0) {
            startNewSelection(mx, my);
            return;
        }

        // ハンドルを検出
        state.activeHandle = detectHandle(mx, my);

        if (state.activeHandle === 'move') {
            startDragging(mx, my);
        } else if (state.activeHandle) {
            startResizing(mx, my);
        } else {
            // 範囲外クリック → 新規選択
            startNewSelection(mx, my);
        }
    }

    function onMouseMove(e) {
        if (!state.active) return;

        const rect = state.overlay.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // カーソル更新（ドラッグ中以外）
        if (!state.isSelecting && !state.isDragging && !state.isResizing) {
            const handle = detectHandle(mx, my);
            updateCursor(handle);
        }

        // 新規選択中
        if (state.isSelecting) {
            updateSelection(mx, my);
            return;
        }

        // 移動中
        if (state.isDragging) {
            updateDragPosition(mx, my);
            return;
        }

        // リサイズ中
        if (state.isResizing) {
            updateResize(mx, my);
        }
    }

    function onMouseUp(e) {
        state.isSelecting = false;
        state.isDragging = false;
        state.isResizing = false;
        state.activeHandle = null;

        // 選択完了
        if (state.cropW > 0 && state.cropH > 0) {
            setStatus('選択範囲を調整するか、「確定して保存」をクリックしてください');
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // マウス操作ヘルパー
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    function startNewSelection(mx, my) {
        state.isSelecting = true;
        const img = canvasToImage(mx, my);
        state.cropX = img.x;
        state.cropY = img.y;
        state.cropW = 0;
        state.cropH = 0;
        state.dragStartX = mx;
        state.dragStartY = my;
    }

    function startDragging(mx, my) {
        state.isDragging = true;
        state.dragStartX = mx;
        state.dragStartY = my;
    }

    function startResizing(mx, my) {
        state.isResizing = true;
        state.dragStartX = mx;
        state.dragStartY = my;
    }

    function updateSelection(mx, my) {
        const img = canvasToImage(mx, my);
        state.cropW = img.x - state.cropX;
        state.cropH = img.y - state.cropY;

        // 負の値を補正
        if (state.cropW < 0) {
            state.cropX = img.x;
            state.cropW = -state.cropW;
        }
        if (state.cropH < 0) {
            state.cropY = img.y;
            state.cropH = -state.cropH;
        }

        renderOverlay();
        updatePreview();
        updateInfo();
    }

    function updateDragPosition(mx, my) {
        const dx = mx - state.dragStartX;
        const dy = my - state.dragStartY;
        const imgDelta = canvasToImage(dx, dy);
        
        state.cropX += imgDelta.x;
        state.cropY += imgDelta.y;

        // 画像境界内に制限
        state.cropX = Math.max(0, Math.min(state.srcCanvas.width - state.cropW, state.cropX));
        state.cropY = Math.max(0, Math.min(state.srcCanvas.height - state.cropH, state.cropY));

        state.dragStartX = mx;
        state.dragStartY = my;

        renderOverlay();
        updatePreview();
        updateInfo();
    }

    function updateResize(mx, my) {
        const dx = mx - state.dragStartX;
        const dy = my - state.dragStartY;
        const imgDelta = canvasToImage(dx, dy);

        resizeCropRegion(state.activeHandle, imgDelta.x, imgDelta.y);

        state.dragStartX = mx;
        state.dragStartY = my;

        renderOverlay();
        updatePreview();
        updateInfo();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ハンドル検出
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * マウス座標から最も近いハンドルを検出
     * @param {number} mx - マウスX座標
     * @param {number} my - マウスY座標
     * @returns {string|null} - ハンドルID ('nw','ne','sw','se','n','e','s','w','move') or null
     */
    function detectHandle(mx, my) {
        if (state.cropW === 0 || state.cropH === 0) return null;

        const pos = imageToCanvas(state.cropX, state.cropY);
        const size = imageToCanvas(state.cropW, state.cropH);
        const cx = pos.x;
        const cy = pos.y;
        const cw = size.x;
        const ch = size.y;

        const hs = CONFIG.HANDLE_SIZE;

        // 四隅
        if (isNear(mx, my, cx, cy, hs)) return 'nw';
        if (isNear(mx, my, cx + cw, cy, hs)) return 'ne';
        if (isNear(mx, my, cx, cy + ch, hs)) return 'sw';
        if (isNear(mx, my, cx + cw, cy + ch, hs)) return 'se';

        // 辺
        if (isNearHorizontal(mx, my, cx + cw/2, cy, cw, hs)) return 'n';
        if (isNearHorizontal(mx, my, cx + cw/2, cy + ch, cw, hs)) return 's';
        if (isNearVertical(mx, my, cx, cy + ch/2, ch, hs)) return 'w';
        if (isNearVertical(mx, my, cx + cw, cy + ch/2, ch, hs)) return 'e';

        // 内側
        if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
            return 'move';
        }

        return null;
    }

    function isNear(mx, my, tx, ty, threshold) {
        return Math.abs(mx - tx) <= threshold && Math.abs(my - ty) <= threshold;
    }

    function isNearHorizontal(mx, my, tx, ty, width, threshold) {
        return Math.abs(my - ty) <= threshold && mx >= tx - width/2 && mx <= tx + width/2;
    }

    function isNearVertical(mx, my, tx, ty, height, threshold) {
        return Math.abs(mx - tx) <= threshold && my >= ty - height/2 && my <= ty + height/2;
    }

    /**
     * ハンドルに応じてカーソルを変更
     */
    function updateCursor(handle) {
        if (!state.overlay) return;

        const cursors = {
            'nw': 'nw-resize',
            'ne': 'ne-resize',
            'sw': 'sw-resize',
            'se': 'se-resize',
            'n': 'n-resize',
            's': 's-resize',
            'w': 'w-resize',
            'e': 'e-resize',
            'move': 'move'
        };

        state.overlay.style.cursor = cursors[handle] || 'crosshair';
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // リサイズ処理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * ハンドルに応じてクロップ領域をリサイズ
     * @param {string} handle - ハンドルID
     * @param {number} dx - X方向の移動量
     * @param {number} dy - Y方向の移動量
     */
    function resizeCropRegion(handle, dx, dy) {
        const oldX = state.cropX;
        const oldY = state.cropY;
        const oldW = state.cropW;
        const oldH = state.cropH;

        switch (handle) {
            case 'nw':
                state.cropX += dx;
                state.cropY += dy;
                state.cropW -= dx;
                state.cropH -= dy;
                break;
            case 'ne':
                state.cropY += dy;
                state.cropW += dx;
                state.cropH -= dy;
                break;
            case 'sw':
                state.cropX += dx;
                state.cropW -= dx;
                state.cropH += dy;
                break;
            case 'se':
                state.cropW += dx;
                state.cropH += dy;
                break;
            case 'n':
                state.cropY += dy;
                state.cropH -= dy;
                break;
            case 's':
                state.cropH += dy;
                break;
            case 'w':
                state.cropX += dx;
                state.cropW -= dx;
                break;
            case 'e':
                state.cropW += dx;
                break;
        }

        // 最小サイズ制限
        if (state.cropW < CONFIG.MIN_SIZE) {
            state.cropX = oldX;
            state.cropW = oldW;
        }
        if (state.cropH < CONFIG.MIN_SIZE) {
            state.cropY = oldY;
            state.cropH = oldH;
        }

        // 画像境界制限
        state.cropX = Math.max(0, Math.min(state.srcCanvas.width - state.cropW, state.cropX));
        state.cropY = Math.max(0, Math.min(state.srcCanvas.height - state.cropH, state.cropY));
        state.cropW = Math.min(state.srcCanvas.width - state.cropX, state.cropW);
        state.cropH = Math.min(state.srcCanvas.height - state.cropY, state.cropH);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 描画処理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * オーバーレイを描画（暗幕 + 枠線 + ハンドル + サイズ表示）
     */
    function renderOverlay() {
        if (!state.overlayCtx) return;

        state.overlayCtx.clearRect(0, 0, state.overlay.width, state.overlay.height);

        if (state.cropW === 0 || state.cropH === 0) return;

        const pos = imageToCanvas(state.cropX, state.cropY);
        const size = imageToCanvas(state.cropW, state.cropH);
        const cx = pos.x;
        const cy = pos.y;
        const cw = size.x;
        const ch = size.y;

        // 外側を暗くする（4つの矩形で構成）
        state.overlayCtx.fillStyle = `rgba(0, 0, 0, ${CONFIG.OVERLAY_OPACITY})`;
        state.overlayCtx.fillRect(0, 0, state.overlay.width, cy);                     // 上
        state.overlayCtx.fillRect(0, cy, cx, ch);                                      // 左
        state.overlayCtx.fillRect(cx + cw, cy, state.overlay.width - cx - cw, ch);    // 右
        state.overlayCtx.fillRect(0, cy + ch, state.overlay.width, state.overlay.height - cy - ch); // 下

        // 枠線
        state.overlayCtx.strokeStyle = CONFIG.BORDER_COLOR;
        state.overlayCtx.lineWidth = CONFIG.BORDER_WIDTH;
        state.overlayCtx.strokeRect(cx, cy, cw, ch);

        // ハンドルを描画（8箇所）
        drawHandle(cx, cy);              // nw
        drawHandle(cx + cw, cy);         // ne
        drawHandle(cx, cy + ch);         // sw
        drawHandle(cx + cw, cy + ch);    // se
        drawHandle(cx + cw/2, cy);       // n
        drawHandle(cx + cw/2, cy + ch);  // s
        drawHandle(cx, cy + ch/2);       // w
        drawHandle(cx + cw, cy + ch/2);  // e

        // サイズ表示
        state.overlayCtx.fillStyle = CONFIG.BORDER_COLOR;
        state.overlayCtx.font = 'bold 14px sans-serif';
        state.overlayCtx.textAlign = 'center';
        state.overlayCtx.fillText(`${state.cropW} × ${state.cropH}`, cx + cw/2, cy - 10);
    }

    /**
     * ハンドルを描画
     * @param {number} x - X座標
     * @param {number} y - Y座標
     */
    function drawHandle(x, y) {
        const hs = CONFIG.HANDLE_SIZE / 2;
        
        // ハンドル本体
        state.overlayCtx.fillStyle = CONFIG.HANDLE_COLOR;
        state.overlayCtx.fillRect(x - hs, y - hs, CONFIG.HANDLE_SIZE, CONFIG.HANDLE_SIZE);
        
        // 白い枠線
        state.overlayCtx.strokeStyle = '#ffffff';
        state.overlayCtx.lineWidth = 2;
        state.overlayCtx.strokeRect(x - hs, y - hs, CONFIG.HANDLE_SIZE, CONFIG.HANDLE_SIZE);
    }

    /**
     * プレビューを更新
     */
    function updatePreview() {
        const previewCanvas = document.getElementById('free-crop-preview-canvas');
        if (!previewCanvas || state.cropW === 0 || state.cropH === 0) return;

        const ctx = previewCanvas.getContext('2d');
        const previewSize = CONFIG.PREVIEW_SIZE;

        // アスペクト比を維持してプレビュー
        const scale = Math.min(previewSize / state.cropW, previewSize / state.cropH);
        const pw = state.cropW * scale;
        const ph = state.cropH * scale;
        const px = (previewSize - pw) / 2;
        const py = (previewSize - ph) / 2;

        ctx.clearRect(0, 0, previewSize, previewSize);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, previewSize, previewSize);

        ctx.drawImage(
            state.srcCanvas,
            state.cropX, state.cropY, state.cropW, state.cropH,
            px, py, pw, ph
        );
    }

    /**
     * 選択範囲情報を更新
     */
    function updateInfo() {
        const infoDiv = document.getElementById('free-crop-info');
        if (!infoDiv) return;

        if (state.cropW > 0 && state.cropH > 0) {
            infoDiv.innerHTML = `
                <div class="text-xs text-gray-600 space-y-1">
                    <div><span class="font-bold">サイズ:</span> ${state.cropW} × ${state.cropH} px</div>
                    <div><span class="font-bold">位置:</span> (${state.cropX}, ${state.cropY})</div>
                    <div><span class="font-bold">アスペクト比:</span> ${(state.cropW / state.cropH).toFixed(2)}</div>
                </div>
            `;
        } else {
            infoDiv.innerHTML = '<div class="text-xs text-gray-400">範囲を選択してください</div>';
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 保存処理
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * 選択範囲をクロップしてサーバーに保存
     */
    async function saveCrop() {
        if (!state.srcCanvas || state.cropW === 0 || state.cropH === 0) {
            alert('選択範囲が指定されていません');
            return;
        }

        setStatus('保存中...');

        try {
            // クロップした画像を作成
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = state.cropW;
            croppedCanvas.height = state.cropH;
            const ctx = croppedCanvas.getContext('2d');
            ctx.drawImage(
                state.srcCanvas,
                state.cropX, state.cropY, state.cropW, state.cropH,
                0, 0, state.cropW, state.cropH
            );

            const dataUrl = croppedCanvas.toDataURL('image/png');

            // APIに送信
            const S = window.EditorState;
            const response = await window.authenticatedFetch(`/api/save-cropped-image/${S.sku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageDataUrl: dataUrl,
                    width: state.cropW,
                    height: state.cropH
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || '保存に失敗しました');
            }

            const result = await response.json();
            
            window.logger && window.logger.info(
                `✅ [free-crop] Saved: ${state.cropW}×${state.cropH}, key=${result.r2Key}`
            );
            
            alert(`切り抜き完了！\nサイズ: ${state.cropW} × ${state.cropH} px`);
            
            stopFreeCrop();
            window.location.reload();

        } catch (error) {
            console.error('❌ [free-crop] Save error:', error);
            setStatus('❌ 保存に失敗しました');
            alert('保存に失敗しました: ' + error.message);
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // イベントリスナー登録
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    document.addEventListener('DOMContentLoaded', function() {
        const btnConfirm = document.getElementById('free-crop-confirm');
        const btnCancel = document.getElementById('free-crop-cancel');

        if (btnConfirm) {
            btnConfirm.addEventListener('click', saveCrop);
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', stopFreeCrop);
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 公開API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    window.FreeCropTool = {
        start: startFreeCrop,
        stop: stopFreeCrop
    };

    window.logger && window.logger.debug('✅ [free-crop-tool] Module initialized');
})();

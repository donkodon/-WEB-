/**
 * free-crop-tool.js - 自由サイズクロップツール
 * 
 * 機能:
 * 1. マウスドラッグで矩形選択（自由サイズ）
 * 2. 四隅と辺のハンドルでサイズ調整
 * 3. 内側をドラッグで位置移動
 * 4. 選択範囲をそのままPNGで保存
 */
(function () {
    'use strict';

    // ── 定数 ──────────────────────────────────────────────────────
    const MIN_SIZE = 50;           // 最小サイズ
    const HANDLE_SIZE = 12;        // ハンドルのサイズ
    const HANDLE_COLOR = '#ff6600'; // ハンドルの色（オレンジ）
    const BORDER_COLOR = '#ff6600'; // 枠線の色
    const BORDER_WIDTH = 2;        // 枠線の太さ

    // ── 状態 ──────────────────────────────────────────────────────
    let active = false;
    let srcCanvas = null;
    let overlay = null;
    let overlayCtx = null;

    // クロップ座標（元画像座標系）
    let cropX = 0;
    let cropY = 0;
    let cropW = 0;
    let cropH = 0;

    // ドラッグ状態
    let isSelecting = false;  // 初期選択中
    let isDragging = false;   // 移動中
    let isResizing = false;   // リサイズ中
    let dragStartX = 0;
    let dragStartY = 0;
    let activeHandle = null;  // 'nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w', 'move'

    // ── 公開関数：クロップツールを開始 ─────────────────────────────
    function startFreeCrop() {
        const S = window.EditorState;
        if (!S) return;

        const imgUrl = S.processedSrc || S.originalSrc;
        if (!imgUrl) {
            alert('画像URLが取得できません。');
            return;
        }

        // サイドバーをクロップパネルに切り替え
        showCropPanel();
        setStatus('画像を読み込み中...');

        // 画像を読み込む
        const loader = new Image();
        loader.crossOrigin = 'anonymous';
        loader.onload = function () {
            srcCanvas = document.createElement('canvas');
            srcCanvas.width = loader.naturalWidth;
            srcCanvas.height = loader.naturalHeight;
            srcCanvas.getContext('2d').drawImage(loader, 0, 0);

            window.logger && window.logger.info(`✅ [free-crop] Image loaded: ${srcCanvas.width}×${srcCanvas.height}`);

            // 初期選択範囲をリセット
            cropX = 0;
            cropY = 0;
            cropW = 0;
            cropH = 0;

            // オーバーレイを作成
            buildOverlay();
            active = true;
            setStatus('画像上でドラッグして範囲を選択してください');
        };
        loader.onerror = function () {
            setStatus('❌ 画像の読み込みに失敗しました');
        };
        loader.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    }

    // ── クロップツールを終了 ────────────────────────────────────────
    function stopFreeCrop() {
        active = false;
        removeOverlay();
        hideCropPanel();
        srcCanvas = null;
        cropX = cropY = cropW = cropH = 0;
        
        // クロップ枠を非表示に戻す
        if (window.CropOverlay) {
            window.CropOverlay.hide();
        }
    }

    // ── サイドバー切り替え ─────────────────────────────────────────
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

    // ── オーバーレイcanvasを作成 ────────────────────────────────────
    function buildOverlay() {
        const container = document.getElementById('canvas-container');
        if (!container) return;

        overlay = document.createElement('canvas');
        overlay.id = 'free-crop-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.cursor = 'crosshair';
        overlay.style.zIndex = '100';

        // canvasと同じサイズに設定
        const mainCanvas = window.EditorState.canvas;
        overlay.width = mainCanvas.offsetWidth;
        overlay.height = mainCanvas.offsetHeight;
        overlay.style.width = mainCanvas.offsetWidth + 'px';
        overlay.style.height = mainCanvas.offsetHeight + 'px';

        overlayCtx = overlay.getContext('2d');

        // イベントリスナー
        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
        overlay.addEventListener('mouseleave', onMouseUp);

        container.appendChild(overlay);
        renderOverlay();
    }

    function removeOverlay() {
        if (overlay && overlay.parentElement) {
            overlay.removeEventListener('mousedown', onMouseDown);
            overlay.removeEventListener('mousemove', onMouseMove);
            overlay.removeEventListener('mouseup', onMouseUp);
            overlay.removeEventListener('mouseleave', onMouseUp);
            overlay.parentElement.removeChild(overlay);
            overlay = null;
            overlayCtx = null;
        }
    }

    // ── 座標変換 ────────────────────────────────────────────────────
    function canvasToImage(cx, cy) {
        const mainCanvas = window.EditorState.canvas;
        const scaleX = srcCanvas.width / mainCanvas.offsetWidth;
        const scaleY = srcCanvas.height / mainCanvas.offsetHeight;
        return {
            x: Math.round(cx * scaleX),
            y: Math.round(cy * scaleY)
        };
    }

    function imageToCanvas(ix, iy) {
        const mainCanvas = window.EditorState.canvas;
        const scaleX = mainCanvas.offsetWidth / srcCanvas.width;
        const scaleY = mainCanvas.offsetHeight / srcCanvas.height;
        return {
            x: ix * scaleX,
            y: iy * scaleY
        };
    }

    // ── マウスイベント ──────────────────────────────────────────────
    function onMouseDown(e) {
        if (!active) return;

        const rect = overlay.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // 選択範囲がない場合は新規選択開始
        if (cropW === 0 || cropH === 0) {
            isSelecting = true;
            const img = canvasToImage(mx, my);
            cropX = img.x;
            cropY = img.y;
            cropW = 0;
            cropH = 0;
            dragStartX = mx;
            dragStartY = my;
            return;
        }

        // ハンドルを検出
        activeHandle = detectHandle(mx, my);

        if (activeHandle === 'move') {
            isDragging = true;
            dragStartX = mx;
            dragStartY = my;
        } else if (activeHandle) {
            isResizing = true;
            dragStartX = mx;
            dragStartY = my;
        } else {
            // 範囲外クリック → 新規選択
            isSelecting = true;
            const img = canvasToImage(mx, my);
            cropX = img.x;
            cropY = img.y;
            cropW = 0;
            cropH = 0;
            dragStartX = mx;
            dragStartY = my;
        }
    }

    function onMouseMove(e) {
        if (!active) return;

        const rect = overlay.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // カーソル更新
        if (!isSelecting && !isDragging && !isResizing) {
            const handle = detectHandle(mx, my);
            updateCursor(handle);
        }

        // 新規選択中
        if (isSelecting) {
            const img = canvasToImage(mx, my);
            cropW = img.x - cropX;
            cropH = img.y - cropY;

            // 負の値を補正
            if (cropW < 0) {
                cropX = img.x;
                cropW = -cropW;
            }
            if (cropH < 0) {
                cropY = img.y;
                cropH = -cropH;
            }

            renderOverlay();
            updatePreview();
            updateInfo();
            return;
        }

        // 移動中
        if (isDragging) {
            const dx = mx - dragStartX;
            const dy = my - dragStartY;
            const imgDelta = canvasToImage(dx, dy);
            
            cropX += imgDelta.x;
            cropY += imgDelta.y;

            // 画像境界内に制限
            cropX = Math.max(0, Math.min(srcCanvas.width - cropW, cropX));
            cropY = Math.max(0, Math.min(srcCanvas.height - cropH, cropY));

            dragStartX = mx;
            dragStartY = my;

            renderOverlay();
            updatePreview();
            updateInfo();
            return;
        }

        // リサイズ中
        if (isResizing) {
            const dx = mx - dragStartX;
            const dy = my - dragStartY;
            const imgDelta = canvasToImage(dx, dy);

            resizeCropRegion(activeHandle, imgDelta.x, imgDelta.y);

            dragStartX = mx;
            dragStartY = my;

            renderOverlay();
            updatePreview();
            updateInfo();
        }
    }

    function onMouseUp(e) {
        isSelecting = false;
        isDragging = false;
        isResizing = false;
        activeHandle = null;

        // 選択完了
        if (cropW > 0 && cropH > 0) {
            setStatus('選択範囲を調整するか、「確定して保存」をクリックしてください');
        }
    }

    // ── ハンドル検出 ────────────────────────────────────────────────
    function detectHandle(mx, my) {
        if (cropW === 0 || cropH === 0) return null;

        const pos = imageToCanvas(cropX, cropY);
        const size = imageToCanvas(cropW, cropH);
        const cx = pos.x;
        const cy = pos.y;
        const cw = size.x;
        const ch = size.y;

        const hs = HANDLE_SIZE;

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

    // ── カーソル更新 ────────────────────────────────────────────────
    function updateCursor(handle) {
        if (!overlay) return;

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

        overlay.style.cursor = cursors[handle] || 'crosshair';
    }

    // ── リサイズ処理 ────────────────────────────────────────────────
    function resizeCropRegion(handle, dx, dy) {
        const oldX = cropX;
        const oldY = cropY;
        const oldW = cropW;
        const oldH = cropH;

        switch (handle) {
            case 'nw':
                cropX += dx;
                cropY += dy;
                cropW -= dx;
                cropH -= dy;
                break;
            case 'ne':
                cropY += dy;
                cropW += dx;
                cropH -= dy;
                break;
            case 'sw':
                cropX += dx;
                cropW -= dx;
                cropH += dy;
                break;
            case 'se':
                cropW += dx;
                cropH += dy;
                break;
            case 'n':
                cropY += dy;
                cropH -= dy;
                break;
            case 's':
                cropH += dy;
                break;
            case 'w':
                cropX += dx;
                cropW -= dx;
                break;
            case 'e':
                cropW += dx;
                break;
        }

        // 最小サイズ制限
        if (cropW < MIN_SIZE) {
            cropX = oldX;
            cropW = oldW;
        }
        if (cropH < MIN_SIZE) {
            cropY = oldY;
            cropH = oldH;
        }

        // 画像境界制限
        cropX = Math.max(0, Math.min(srcCanvas.width - cropW, cropX));
        cropY = Math.max(0, Math.min(srcCanvas.height - cropH, cropY));
        cropW = Math.min(srcCanvas.width - cropX, cropW);
        cropH = Math.min(srcCanvas.height - cropY, cropH);
    }

    // ── オーバーレイ描画 ────────────────────────────────────────────
    function renderOverlay() {
        if (!overlayCtx) return;

        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

        if (cropW === 0 || cropH === 0) return;

        const pos = imageToCanvas(cropX, cropY);
        const size = imageToCanvas(cropW, cropH);
        const cx = pos.x;
        const cy = pos.y;
        const cw = size.x;
        const ch = size.y;

        // 外側を暗くする
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        overlayCtx.fillRect(0, 0, overlay.width, cy);
        overlayCtx.fillRect(0, cy, cx, ch);
        overlayCtx.fillRect(cx + cw, cy, overlay.width - cx - cw, ch);
        overlayCtx.fillRect(0, cy + ch, overlay.width, overlay.height - cy - ch);

        // 枠線
        overlayCtx.strokeStyle = BORDER_COLOR;
        overlayCtx.lineWidth = BORDER_WIDTH;
        overlayCtx.strokeRect(cx, cy, cw, ch);

        // ハンドルを描画
        drawHandle(cx, cy);              // nw
        drawHandle(cx + cw, cy);         // ne
        drawHandle(cx, cy + ch);         // sw
        drawHandle(cx + cw, cy + ch);    // se
        drawHandle(cx + cw/2, cy);       // n
        drawHandle(cx + cw/2, cy + ch);  // s
        drawHandle(cx, cy + ch/2);       // w
        drawHandle(cx + cw, cy + ch/2);  // e

        // サイズ表示
        overlayCtx.fillStyle = BORDER_COLOR;
        overlayCtx.font = 'bold 14px sans-serif';
        overlayCtx.textAlign = 'center';
        overlayCtx.fillText(`${cropW} × ${cropH}`, cx + cw/2, cy - 10);
    }

    function drawHandle(x, y) {
        const hs = HANDLE_SIZE / 2;
        overlayCtx.fillStyle = HANDLE_COLOR;
        overlayCtx.fillRect(x - hs, y - hs, HANDLE_SIZE, HANDLE_SIZE);
        overlayCtx.strokeStyle = '#ffffff';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(x - hs, y - hs, HANDLE_SIZE, HANDLE_SIZE);
    }

    // ── プレビュー更新 ──────────────────────────────────────────────
    function updatePreview() {
        const previewCanvas = document.getElementById('free-crop-preview-canvas');
        if (!previewCanvas || cropW === 0 || cropH === 0) return;

        const ctx = previewCanvas.getContext('2d');
        const previewSize = 200;

        // アスペクト比を維持してプレビュー
        const scale = Math.min(previewSize / cropW, previewSize / cropH);
        const pw = cropW * scale;
        const ph = cropH * scale;
        const px = (previewSize - pw) / 2;
        const py = (previewSize - ph) / 2;

        ctx.clearRect(0, 0, previewSize, previewSize);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, previewSize, previewSize);

        ctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, px, py, pw, ph);
    }

    // ── 情報表示更新 ────────────────────────────────────────────────
    function updateInfo() {
        const infoDiv = document.getElementById('free-crop-info');
        if (!infoDiv) return;

        if (cropW > 0 && cropH > 0) {
            infoDiv.innerHTML = `
                <div class="text-xs text-gray-600 space-y-1">
                    <div><span class="font-bold">サイズ:</span> ${cropW} × ${cropH} px</div>
                    <div><span class="font-bold">位置:</span> (${cropX}, ${cropY})</div>
                    <div><span class="font-bold">アスペクト比:</span> ${(cropW / cropH).toFixed(2)}</div>
                </div>
            `;
        } else {
            infoDiv.innerHTML = '<div class="text-xs text-gray-400">範囲を選択してください</div>';
        }
    }

    // ── ステータス表示 ──────────────────────────────────────────────
    function setStatus(text) {
        const status = document.getElementById('free-crop-status');
        if (status) status.textContent = text;
    }

    // ── 保存処理 ────────────────────────────────────────────────────
    async function saveCrop() {
        if (!srcCanvas || cropW === 0 || cropH === 0) {
            alert('選択範囲が指定されていません');
            return;
        }

        setStatus('保存中...');

        try {
            // クロップした画像を作成
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = cropW;
            croppedCanvas.height = cropH;
            const ctx = croppedCanvas.getContext('2d');
            ctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            const dataUrl = croppedCanvas.toDataURL('image/png');

            // アップロード
            const S = window.EditorState;
            const response = await window.authenticatedFetch(`/api/save-cropped-image/${S.sku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageDataUrl: dataUrl,
                    width: cropW,
                    height: cropH
                })
            });

            if (!response.ok) {
                throw new Error('保存に失敗しました');
            }

            window.logger && window.logger.info('✅ [free-crop] Saved:', cropW, 'x', cropH);
            alert(`切り抜き完了！\nサイズ: ${cropW} × ${cropH} px`);
            
            stopFreeCrop();
            window.location.reload();

        } catch (error) {
            console.error('❌ [free-crop] Save error:', error);
            setStatus('❌ 保存に失敗しました');
            alert('保存に失敗しました: ' + error.message);
        }
    }

    // ── イベントリスナー設定 ────────────────────────────────────────
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

    // ── 公開API ─────────────────────────────────────────────────────
    window.FreeCropTool = {
        start: startFreeCrop,
        stop: stopFreeCrop
    };

    window.logger && window.logger.debug('✅ [free-crop-tool] initialized');
})();

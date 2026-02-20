/**
 * crop-tool.js
 * 切り抜きツール（矩形選択 → キャンバス即時トリミング）
 * 依存: editor-state.js
 */
(function () {
    'use strict';

    // ── 切り抜きオーバーレイ（main-canvas に重ねる透明 canvas） ──────
    let cropOverlay = null;
    let cropCtx     = null;

    let cropStartX = 0, cropStartY = 0;
    let cropEndX   = 0, cropEndY   = 0;
    let isCropping = false;

    function initCropOverlay() {
        const S = window.EditorState;
        if (!S) return;
        const { canvas } = S;

        cropOverlay               = document.createElement('canvas');
        cropOverlay.style.position = 'absolute';
        cropOverlay.style.top      = '0';
        cropOverlay.style.left     = '0';
        cropOverlay.style.pointerEvents = 'none';
        cropOverlay.style.display       = 'none';

        const parent = canvas.parentElement;
        parent.style.position = 'relative';
        parent.appendChild(cropOverlay);

        cropCtx = cropOverlay.getContext('2d');
    }

    function syncCropOverlaySize() {
        const S    = window.EditorState;
        if (!S || !cropOverlay) return;
        const rect = S.canvas.getBoundingClientRect();

        cropOverlay.width        = rect.width;
        cropOverlay.height       = rect.height;
        cropOverlay.style.width  = rect.width  + 'px';
        cropOverlay.style.height = rect.height + 'px';
    }

    function drawCropRect(x1, y1, x2, y2) {
        if (!cropCtx || !cropOverlay) return;

        cropCtx.clearRect(0, 0, cropOverlay.width, cropOverlay.height);

        const rx = Math.min(x1, x2);
        const ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1);
        const rh = Math.abs(y2 - y1);

        // 選択範囲外を半透明黒で覆う
        cropCtx.fillStyle = 'rgba(0,0,0,0.45)';
        cropCtx.fillRect(0, 0, cropOverlay.width, cropOverlay.height);
        cropCtx.clearRect(rx, ry, rw, rh);

        // 点線枠
        cropCtx.strokeStyle = '#3b82f6';
        cropCtx.lineWidth   = 2;
        cropCtx.setLineDash([6, 3]);
        cropCtx.strokeRect(rx, ry, rw, rh);

        // 四隅ハンドル
        cropCtx.setLineDash([]);
        cropCtx.fillStyle = '#3b82f6';
        [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]].forEach(([cx, cy]) => {
            cropCtx.fillRect(cx - 4, cy - 4, 8, 8);
        });
    }

    // ── 切り抜き確定処理 ─────────────────────────────────────────────

    function applyCrop() {
        const S = window.EditorState;
        if (!S) return;

        const { canvas, ctx, maskCanvas, maskCtx } = S;
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;

        const x1 = Math.round(Math.min(cropStartX, cropEndX) * scaleX);
        const y1 = Math.round(Math.min(cropStartY, cropEndY) * scaleY);
        const x2 = Math.round(Math.max(cropStartX, cropEndX) * scaleX);
        const y2 = Math.round(Math.max(cropStartY, cropEndY) * scaleY);
        const w  = x2 - x1;
        const h  = y2 - y1;

        // 小さすぎる場合はキャンセル
        if (w < 5 || h < 5) {
            console.log('⚠️ Crop area too small, cancelled');
            return;
        }

        // 切り出してキャンバスを再構成
        const croppedData = ctx.getImageData(x1, y1, w, h);
        canvas.width  = w;
        canvas.height = h;
        ctx.putImageData(croppedData, 0, 0);

        // maskCanvas も同様にトリミング
        const croppedMask   = maskCtx.getImageData(x1, y1, w, h);
        maskCanvas.width    = w;
        maskCanvas.height   = h;
        maskCtx.putImageData(croppedMask, 0, 0);
        S.maskImageData = maskCtx.getImageData(0, 0, w, h);

        // originalImage キャッシュをリセット
        S.originalImage = ctx.getImageData(0, 0, w, h);

        console.log(`✅ Crop applied: (${x1},${y1}) ${w}x${h}`);

        // ツール解除
        S.currentTool       = null;
        canvas.style.cursor = 'default';
        document.querySelectorAll('.tool-btn').forEach(btn =>
            btn.classList.remove('border-blue-500', 'bg-blue-50')
        );
    }

    // ── 公開インターフェース（image-processing.js から呼ばれる） ──────

    window.CropTool = {
        initCropOverlay,

        /** mousedown 時の処理 */
        onMouseDown(e) {
            const S = window.EditorState;
            if (!S || S.currentTool !== 'crop') return false;

            const rect     = S.canvas.getBoundingClientRect();
            syncCropOverlaySize();
            cropOverlay.style.display = 'block';
            cropStartX = e.clientX - rect.left;
            cropStartY = e.clientY - rect.top;
            cropEndX   = cropStartX;
            cropEndY   = cropStartY;
            isCropping = true;
            return true;
        },

        /** mousemove 時の処理 */
        onMouseMove(e) {
            const S = window.EditorState;
            if (!S || S.currentTool !== 'crop' || !isCropping) return false;

            const rect = S.canvas.getBoundingClientRect();
            cropEndX   = e.clientX - rect.left;
            cropEndY   = e.clientY - rect.top;
            drawCropRect(cropStartX, cropStartY, cropEndX, cropEndY);
            return true;
        },

        /** mouseup / mouseout 時の処理 */
        onMouseUp() {
            const S = window.EditorState;
            if (!S || S.currentTool !== 'crop' || !isCropping) return false;

            isCropping = false;
            if (cropOverlay) {
                cropOverlay.style.display = 'none';
                cropCtx.clearRect(0, 0, cropOverlay.width, cropOverlay.height);
            }

            applyCrop();
            return true;
        }
    };

    window.logger && window.logger.debug('✅ [crop-tool] initialized');
})();

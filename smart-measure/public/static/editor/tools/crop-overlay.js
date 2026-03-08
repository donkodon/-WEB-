/**
 * crop-overlay.js
 * 常時表示される1000×1000のクロップ枠オーバーレイ
 * 
 * 機能:
 * - 画像調整画面で常にクロップ枠を表示
 * - 枠の外側を暗く表示（opacity: 0.5）
 * - 枠内だけがはっきり見える
 * - クロップ座標の変更時に枠を更新
 */
(function () {
    'use strict';

    const CROP_SIZE = 1000; // 固定サイズ
    const OVERLAY_OPACITY = 0.5; // 枠外の暗さ
    const FRAME_COLOR = '#00ff00'; // 枠の色（緑）
    const FRAME_WIDTH = 2; // 枠の太さ

    let overlayElement = null;
    let canvasContainer = null;

    /**
     * クロップ枠のオーバーレイを初期化
     */
    function initCropOverlay() {
        const S = window.EditorState;
        if (!S) {
            window.logger && window.logger.error('❌ [crop-overlay] EditorState not found');
            return;
        }

        canvasContainer = S.canvas.parentElement;
        if (!canvasContainer) {
            window.logger && window.logger.error('❌ [crop-overlay] Canvas container not found');
            return;
        }

        // オーバーレイ要素を作成
        overlayElement = document.createElement('div');
        overlayElement.id = 'crop-overlay-always';
        overlayElement.style.position = 'absolute';
        overlayElement.style.top = '0';
        overlayElement.style.left = '0';
        overlayElement.style.width = '100%';
        overlayElement.style.height = '100%';
        overlayElement.style.pointerEvents = 'none'; // クリックイベントを透過
        overlayElement.style.zIndex = '10'; // canvas の上に表示

        canvasContainer.style.position = 'relative'; // 親要素を relative に
        canvasContainer.appendChild(overlayElement);

        window.logger && window.logger.debug('✅ [crop-overlay] Initialized');
    }

    /**
     * クロップ枠を更新（座標変更時に呼ぶ）
     */
    function updateCropOverlay() {
        if (!overlayElement) {
            window.logger && window.logger.warn('⚠️ [crop-overlay] Overlay not initialized');
            return;
        }

        const S = window.EditorState;
        if (!S) return;

        const { canvas, cropX, cropY, cropSize } = S;

        // cropX, cropY, cropSize が未設定の場合はスキップ
        if (cropX === null || cropY === null || cropSize === null) {
            overlayElement.innerHTML = '';
            return;
        }

        // canvas のサイズを取得
        const canvasWidth = canvas.offsetWidth;
        const canvasHeight = canvas.offsetHeight;

        // canvas の実際のサイズと表示サイズの比率を計算
        const scaleX = canvasWidth / canvas.width;
        const scaleY = canvasHeight / canvas.height;

        // クロップ領域の表示座標を計算
        const displayX = cropX * scaleX;
        const displayY = cropY * scaleY;
        const displaySize = cropSize * scaleX; // 正方形なので scaleX で統一

        // SVG でマスクを作成
        overlayElement.innerHTML = `
            <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0;">
                <defs>
                    <mask id="crop-mask-always">
                        <!-- 全体を白（表示） -->
                        <rect width="100%" height="100%" fill="white"/>
                        <!-- クロップ領域を黒（非表示） -->
                        <rect x="${displayX}" y="${displayY}" 
                              width="${displaySize}" height="${displaySize}" 
                              fill="black"/>
                    </mask>
                </defs>
                <!-- 枠の外側を暗くする -->
                <rect width="100%" height="100%" 
                      fill="black" 
                      opacity="${OVERLAY_OPACITY}" 
                      mask="url(#crop-mask-always)"/>
                <!-- クロップ枠を描画 -->
                <rect x="${displayX}" y="${displayY}" 
                      width="${displaySize}" height="${displaySize}" 
                      fill="none" 
                      stroke="${FRAME_COLOR}" 
                      stroke-width="${FRAME_WIDTH}"/>
                <!-- 枠のサイズ表示 -->
                <text x="${displayX + displaySize / 2}" 
                      y="${displayY - 10}" 
                      fill="${FRAME_COLOR}" 
                      text-anchor="middle" 
                      font-size="14" 
                      font-weight="bold">
                    ${CROP_SIZE} × ${CROP_SIZE}
                </text>
            </svg>
        `;

        window.logger && window.logger.debug(`✅ [crop-overlay] Updated: cropX=${cropX}, cropY=${cropY}, cropSize=${cropSize}`);
    }

    /**
     * オーバーレイを非表示
     */
    function hideCropOverlay() {
        if (overlayElement) {
            overlayElement.style.display = 'none';
        }
    }

    /**
     * オーバーレイを表示
     */
    function showCropOverlay() {
        if (overlayElement) {
            overlayElement.style.display = 'block';
            updateCropOverlay();
        }
    }

    /**
     * オーバーレイを削除
     */
    function destroyCropOverlay() {
        if (overlayElement && overlayElement.parentElement) {
            overlayElement.parentElement.removeChild(overlayElement);
            overlayElement = null;
        }
    }

    // ── 公開インターフェース ───────────────────────────────────────
    window.CropOverlay = {
        init: initCropOverlay,
        update: updateCropOverlay,
        hide: hideCropOverlay,
        show: showCropOverlay,
        destroy: destroyCropOverlay
    };

    window.logger && window.logger.debug('✅ [crop-overlay] Module loaded');
})();

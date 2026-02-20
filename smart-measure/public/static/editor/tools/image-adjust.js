/**
 * image-adjust.js
 * 画像調整（輝度・ホワイトバランス・色相）
 * 依存: editor-state.js
 */
(function () {
    'use strict';

    // ── ピクセル調整コア ─────────────────────────────────────────────

    /**
     * originalImage キャッシュを使ってキャンバスに調整結果を描画する。
     * maskVisible が true の場合はオーバーレイも再適用する。
     */
    function applyAllAdjustments() {
        const S = window.EditorState;
        if (!S || !S.originalImage) return;

        const { canvas, ctx, brightness, wb, hue, maskVisible } = S;

        // originalImage を一度書き戻してから取得
        ctx.putImageData(S.originalImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data      = imageData.data;

        const wbFactor  = (wb - 5500) / 3500;
        const hueFactor = hue / 180;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // 輝度
            r += brightness;
            g += brightness;
            b += brightness;

            // ホワイトバランス（簡易）
            if (wbFactor > 0) {
                r += wbFactor * 50;
                g += wbFactor * 30;
            } else {
                b += Math.abs(wbFactor) * 50;
            }

            // 色相シフト（RGB ミックスで簡易実装）
            if (hueFactor !== 0) {
                const tempR = r;
                r = r + hueFactor * (g - b) * 0.5;
                g = g + hueFactor * (b - tempR) * 0.5;
                b = b + hueFactor * (tempR - g) * 0.5;
            }

            // クランプ
            data[i]     = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }

        ctx.putImageData(imageData, 0, 0);

        // マスクオーバーレイを再適用
        if (maskVisible && S.maskImageData) {
            applyMaskOverlay();
        }
    }

    /**
     * 調整値がデフォルトと異なる場合のみ再描画する軽量版。
     * (maskVisible がオンのタイミングなど、余分な再描画を避けたい場合に使用)
     */
    function applyCurrentAdjustments() {
        const S = window.EditorState;
        if (!S) return;
        if (S.brightness !== 0 || S.wb !== 5500 || S.hue !== 0) {
            applyAllAdjustments();
        }
    }

    // ── マスクオーバーレイ（調整後の画像に重ねる） ───────────────────

    /**
     * マスクデータに基づき青色オーバーレイをキャンバスに描画する。
     * 白(bright) = 商品エリア → 50%青オーバーレイ
     * 黒(dark)   = 背景エリア → オーバーレイなし
     */
    function applyMaskOverlay() {
        const S = window.EditorState;
        if (!S || !S.maskImageData) {
            console.error('❌ [image-adjust] applyMaskOverlay: maskImageData is null');
            return;
        }

        const { canvas, ctx, img, maskImageData } = S;

        // ベース画像を再描画
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mData     = maskImageData.data;
        const iData     = imageData.data;
        let bright = 0, dark = 0;

        for (let i = 0; i < mData.length; i += 4) {
            const lum = mData[i] + mData[i + 1] + mData[i + 2]; // 0-765
            if (lum > 10) {
                // 商品エリア: 青オーバーレイ 50%
                iData[i]     = iData[i]     * 0.5;
                iData[i + 1] = iData[i + 1] * 0.5 + 50;
                iData[i + 2] = iData[i + 2] * 0.5 + 128;
                bright++;
            } else {
                dark++;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        console.log(`🎭 Mask overlay: bright=${bright} dark=${dark}`);
    }

    // ── スライダー UI ────────────────────────────────────────────────

    function setupSliders() {
        const S = window.EditorState;
        if (!S) return;

        // 輝度
        const brightnessSlider = document.getElementById('range-brightness');
        const brightnessVal    = document.getElementById('val-brightness');
        if (brightnessSlider) {
            brightnessSlider.addEventListener('input', (e) => {
                S.brightness = parseInt(e.target.value, 10);
                if (brightnessVal) brightnessVal.textContent = S.brightness;
                applyAllAdjustments();
            });
        }

        // ホワイトバランス
        const wbSlider = document.getElementById('range-wb');
        const wbVal    = document.getElementById('val-wb');
        if (wbSlider) {
            wbSlider.addEventListener('input', (e) => {
                S.wb = parseInt(e.target.value, 10);
                if (wbVal) wbVal.textContent = S.wb + 'K';
                applyAllAdjustments();
            });
        }

        // 色相
        const hueSlider = document.getElementById('range-hue');
        const hueVal    = document.getElementById('val-hue');
        if (hueSlider) {
            hueSlider.addEventListener('input', (e) => {
                S.hue = parseInt(e.target.value, 10);
                if (hueVal) hueVal.textContent = S.hue + '°';
                applyAllAdjustments();
            });
        }

        // ブラシサイズ（手動修正ツール用）
        const sizeSlider = document.getElementById('range-size');
        const sizeVal    = document.getElementById('val-size');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                S.brushSize = parseInt(e.target.value, 10);
                if (sizeVal) sizeVal.textContent = S.brushSize + 'px';
            });
        }

        // マスクブラシサイズ
        const maskSizeSlider = document.getElementById('range-mask-brush-size');
        const maskSizeVal    = document.getElementById('val-mask-brush-size');
        if (maskSizeSlider) {
            maskSizeSlider.addEventListener('input', (e) => {
                S.maskBrushSize = parseInt(e.target.value, 10);
                if (maskSizeVal) maskSizeVal.textContent = S.maskBrushSize + 'px';
            });
        }
    }

    // ── 画像保存 ─────────────────────────────────────────────────────

    /**
     * 調整済みキャンバスを PNG で保存 → /api/save-edited-image
     * 成功後 /dashboard へ遷移する
     */
    window.saveEditedImage = async function () {
        const S = window.EditorState;
        if (!S) return;

        const button = document.getElementById('btn-save');
        if (!button) {
            window.logger && window.logger.error('❌ btn-save not found');
            return;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 保存中...';

        try {
            const imageData = S.canvas.toDataURL('image/png');

            const response = await window.authenticatedFetch(
                '/api/save-edited-image/' + S.imageId,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageData, imageId: S.imageId })
                }
            );

            const result = await response.json();

            if (result.success) {
                button.innerHTML = '<i class="fas fa-check mr-2"></i> 保存完了！';
                button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                button.classList.add('bg-green-600');
                setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
            } else {
                throw new Error(result.error || '保存に失敗しました');
            }
        } catch (error) {
            window.logger && window.logger.error('Save error:', error);
            alert('保存に失敗しました: ' + error.message);
        } finally {
            if (button.disabled) {
                button.disabled = false;
                if (!button.classList.contains('bg-green-600')) {
                    button.innerHTML = '<i class="fas fa-save mr-2"></i> 保存してダッシュボードへ';
                }
            }
        }
    };

    // ── 初期化（DOMContentLoaded 後に呼ばれる） ──────────────────────

    /**
     * image-processing.js の init() から呼ばれる
     */
    window.ImageAdjust = {
        applyAllAdjustments,
        applyCurrentAdjustments,
        applyMaskOverlay,
        setup() {
            setupSliders();

            // 保存ボタン
            const saveButton = document.getElementById('btn-save');
            if (saveButton) {
                saveButton.addEventListener('click', () => window.saveEditedImage());
                window.logger && window.logger.debug('✅ [image-adjust] Save button attached');
            }

            window.logger && window.logger.debug('✅ [image-adjust] initialized');
        }
    };
})();

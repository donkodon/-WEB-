/**
 * image-adjust.js
 * 画像調整（輝度・ホワイトバランス・色相）
 * 依存: editor-state.js
 */
(function () {
    'use strict';

    // ── ヘルパー関数 ─────────────────────────────────────────────────

    /**
     * マスクのRGB値をアルファチャンネルに変換して画像に適用
     * @param {CanvasRenderingContext2D} ctx - メインキャンバスのコンテキスト
     * @param {HTMLCanvasElement} canvas - メインキャンバス
     * @param {HTMLCanvasElement} maskCanvas - マスクキャンバス
     * @param {CanvasRenderingContext2D} maskCtx - マスクコンテキスト
     * @returns {boolean} 処理成功時 true
     */
    function applyMaskAlphaToCanvas(ctx, canvas, maskCanvas, maskCtx) {
        if (!ctx || !canvas || !maskCanvas || !maskCtx) {
            console.error('❌ applyMaskAlphaToCanvas: Invalid parameters');
            return false;
        }
        
        try {
        // マスク画像の RGB 値を Alpha 値に変換して透過処理
        // 白（255）= 不透明（残す）、黒（0）= 透明（削除）
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < currentData.data.length; i += 4) {
            // マスクの輝度を取得（白=255、黒=0）
            const maskValue = (maskData.data[i] + maskData.data[i+1] + maskData.data[i+2]) / 3;
            // アルファ値として適用
            currentData.data[i + 3] = maskValue;
        }
        
        // 一時canvasを作成して透過画像を描画
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(currentData, 0, 0);
        
            // メインcanvasに白背景を描画してから透過画像を重ねる
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(tempCanvas, 0, 0);
            return true;
        } catch (error) {
            console.error('❌ applyMaskAlphaToCanvas error:', error);
            return false;
        }
    }

    // ── ピクセル調整コア ─────────────────────────────────────────────

    /**
     * 調整ベース画像をキャンバスに適用して調整結果を描画する。
     * 
     * 処理フロー:
     * 1. 白背景を塗る
     * 2. オリジナル画像を描画
     * 3. JSON調整（明るさ・WB・色相）を適用
     * 4. マスクで透過処理（RGB→Alpha変換）
     * 5. クロップ適用（cropEnabled の場合）
     * 6. マスクオーバーレイ表示（必要な場合）
     */
    function applyAllAdjustments() {
        const S = window.EditorState;
        if (!S || !S.originalImage) {
            console.error('❌ applyAllAdjustments: EditorState or originalImage missing');
            return;
        }

        const { canvas, ctx, brightness, wb, hue, maskVisible, maskCanvas, maskCtx } = S;

        // 1. 白背景を塗る
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. オリジナル画像を描画
        ctx.putImageData(S.originalImage, 0, 0);
        
        // 3. JSON調整を適用
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

        // 4. マスクで透過処理（マスクがある場合）
        if (maskCanvas && S.maskImageUrl) {
            applyMaskAlphaToCanvas(ctx, canvas, maskCanvas, maskCtx);
        }

        // 5. クロップ適用（cropEnabled の場合）
        // クロップはf画像生成時にのみ適用されるが、プレビューでも表示したい場合はここで適用
        // 注: 編集中はクロップ枠を表示するだけで、実際の切り出しは保存時に実行
        // この関数では通常クロップは適用せず、最終保存時の`generateFinalImage()`で適用

        // 6. マスクオーバーレイを再適用（編集中の表示用）
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
        if (!S || !S.originalImage) return;
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
            window.logger && window.logger.error('❌ [image-adjust] applyMaskOverlay: maskImageData is null');
            return;
        }

        const { canvas, ctx, maskCanvas, maskCtx } = S;
        let { maskImageData } = S;

        // ベース画像を再描画（常にオリジナル画像を使う）
        // originalForMask（マスクタブ切替時にセット）があればそれを優先。
        // なければ originalImage（初回ロード時のオリジナル画像）を使う。
        // ※ saveMask後の合成画像（adjustedImage）はここでは使わない。
        //   マスクオーバーレイは常にオリジナル画像の上に描画する。
        if (S.originalForMask) {
            ctx.putImageData(S.originalForMask, 0, 0);
        } else if (S.originalImage) {
            ctx.putImageData(S.originalImage, 0, 0);
        } else {
            // どちらのキャッシュもない場合のフォールバック（初期ロード直後など）
            ctx.drawImage(S.img, 0, 0);
        }

        // ── サイズ不一致チェック ──────────────────────────────────────
        // maskImageData のサイズが canvas と違う場合はスケールし直す
        const maskW = maskImageData.width;
        const maskH = maskImageData.height;

        if (maskW !== canvas.width || maskH !== canvas.height) {
            window.logger && window.logger.warn(`⚠️ Mask size (${maskW}x${maskH}) != canvas (${canvas.width}x${canvas.height}). Re-scaling mask.`);

            // maskCanvas を canvas サイズにリサイズして再描画
            const tmp    = document.createElement('canvas');
            tmp.width    = canvas.width;
            tmp.height   = canvas.height;
            const tmpCtx = tmp.getContext('2d');

            // maskCanvas の現在内容を新サイズに引き伸ばす
            tmpCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
            maskImageData = tmpCtx.getImageData(0, 0, canvas.width, canvas.height);

            // 以後の操作のために state も更新
            maskCanvas.width  = canvas.width;
            maskCanvas.height = canvas.height;
            maskCtx.putImageData(maskImageData, 0, 0);
            S.maskImageData = maskImageData;
        }

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mData     = maskImageData.data;
        const iData     = imageData.data;
        let bright = 0, dark = 0;

        for (let i = 0; i < mData.length; i += 4) {
            const lum = mData[i] + mData[i + 1] + mData[i + 2]; // 0-765
            if (lum > 10) {
                // 商品エリア: 青オーバーレイ 50%（rgba(0,100,255,0.5) をブレンド）
                iData[i]     = iData[i]     * 0.5;           // R: 元の50%
                iData[i + 1] = iData[i + 1] * 0.5 + 50;     // G: 元の50% + 50
                iData[i + 2] = iData[i + 2] * 0.5 + 127;    // B: 元の50% + 127 (=255*0.5)
                bright++;
            } else {
                dark++;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        window.logger && window.logger.debug(`🎭 Mask overlay: bright=${bright} dark=${dark} | canvas=${canvas.width}x${canvas.height} mask=${maskImageData.width}x${maskImageData.height}`);
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
     * 最終保存：マスク・p画像・f画像を一括アップロード → /dashboard へ遷移
     *
     * 保存フロー:
     *   1. pendingMaskDataUrl    → /api/save-mask/:sku          (mask.png)
     *   2. pendingCompositeDataUrl → /api/upload-processed-image/:sku (_p.png)
     *   3. canvas（調整済み）    → /api/save-edited-image/:imageId (_f.png)
     *   ※ 1・2 は saveMask() 時点でメモリ保留されたデータ
     *   ※ マスク編集をスキップした場合は 3 のみ実行
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
            // ── Step 1: マスク画像を R2 に保存（保留データがある場合のみ）──
            if (S.pendingMaskDataUrl) {
                window.logger && window.logger.debug('💾 [save] Step1: uploading mask...');
                const maskRes = await window.authenticatedFetch(`/api/save-mask/${S.sku}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        maskDataUrl:  S.pendingMaskDataUrl,
                        filenamePart: S.filenamePart
                    })
                });
                if (!maskRes.ok) {
                    const e = await maskRes.json().catch(() => ({ error: 'Unknown' }));
                    throw new Error('マスク保存失敗: ' + (e.details || e.error));
                }
                const maskResult = await maskRes.json();
                window.logger && window.logger.debug('✅ Step1 done: mask saved to', maskResult.r2Key);
            }

            // ── Step 2: p画像（背景削除合成）を R2 に保存（保留データがある場合のみ）──
            if (S.pendingCompositeDataUrl) {
                window.logger && window.logger.debug('💾 [save] Step2: uploading p-image...');
                const uploadRes = await window.authenticatedFetch(
                    `/api/upload-processed-image/${S.sku}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imageDataUrl: S.pendingCompositeDataUrl,
                            filenamePart: S.filenamePart
                        })
                    }
                );
                if (!uploadRes.ok) {
                    const e = await uploadRes.json().catch(() => ({ error: 'Unknown' }));
                    throw new Error('p画像アップロード失敗: ' + (e.details || e.error));
                }
                const uploadResult = await uploadRes.json();
                window.logger && window.logger.debug('✅ Step2 done: p-image saved to', uploadResult.r2Key);
            }

            // ── Step 2.5: 調整値をDBに保存 ──────────────────────────────
            window.logger && window.logger.debug('💾 [save] Step2.5: saving adjustments...');
            const adjustRes = await window.authenticatedFetch(`/api/save-adjustments/${S.sku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brightness: S.brightness,
                    whiteBalance: S.wb,
                    hue: S.hue
                })
            });
            if (!adjustRes.ok) {
                const e = await adjustRes.json().catch(() => ({ error: 'Unknown' }));
                const errorMsg = e.error || 'Unknown';
                const details = e.details ? ` (${e.details})` : '';
                window.logger && window.logger.error('❌ Adjustment save failed:', errorMsg, details);
                throw new Error(`調整値保存失敗: ${errorMsg}${details}`);
            }
            const adjustResult = await adjustRes.json();
            window.logger && window.logger.info('✅ Step2.5 done: adjustments saved', adjustResult);

            // ── Step 2.75: クロップ座標をDBに保存 ────────────────────────
            if (S.cropEnabled && S.cropX !== null && S.cropY !== null && S.cropSize !== null) {
                window.logger && window.logger.debug('💾 [save] Step2.75: saving crop metadata...');
                const cropRes = await window.authenticatedFetch(`/api/save-crop-metadata/${S.sku}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cropX: S.cropX,
                        cropY: S.cropY,
                        cropSize: S.cropSize,
                        cropEnabled: S.cropEnabled
                    })
                });
                if (!cropRes.ok) {
                    const e = await cropRes.json().catch(() => ({ error: 'Unknown' }));
                    const errorMsg = e.error || 'Unknown';
                    const details = e.details ? ` (${e.details})` : '';
                    window.logger && window.logger.error('❌ Crop metadata save failed:', errorMsg, details);
                    throw new Error(`クロップ座標保存失敗: ${errorMsg}${details}`);
                }
                const cropResult = await cropRes.json();
                window.logger && window.logger.info('✅ Step2.75 done: crop metadata saved', cropResult);
            } else {
                window.logger && window.logger.debug('⏭️ [save] Step2.75 skipped: no crop applied');
            }

            // ── Step 3: f画像生成（クロップ + 調整 + マスク適用） → R2保存 ──
            window.logger && window.logger.debug('💾 [save] Step3: generating and uploading f-image (final)...');
            
            // クロップが有効な場合は、クロップ適用済みの画像を生成
            let finalImageData;
            if (S.cropEnabled && S.cropX !== null && S.cropY !== null && S.cropSize !== null) {
                // クロップ適用: 元画像 → クロップ → 1000×1000にリサイズ → 調整・マスク適用
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                // 現在のcanvasからクロップ領域を切り出して1000×1000にリサイズ
                const OUTPUT_SIZE = 1000;
                tempCanvas.width = OUTPUT_SIZE;
                tempCanvas.height = OUTPUT_SIZE;
                
                // 白背景を塗る
                tempCtx.fillStyle = '#ffffff';
                tempCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
                
                // 元canvasのクロップ領域を1000×1000にリサイズして描画
                tempCtx.drawImage(
                    S.canvas,
                    S.cropX, S.cropY, S.cropSize, S.cropSize,  // 元画像のクロップ範囲
                    0, 0, OUTPUT_SIZE, OUTPUT_SIZE              // 1000×1000にリサイズ
                );
                
                finalImageData = tempCanvas.toDataURL('image/png');
                window.logger && window.logger.debug('✅ Crop applied to f-image:', { cropX: S.cropX, cropY: S.cropY, cropSize: S.cropSize });
            } else {
                // クロップなし: 現在のcanvasをそのまま使用
                finalImageData = S.canvas.toDataURL('image/png');
            }
            
            const imageData = finalImageData;

            const response = await window.authenticatedFetch(
                '/api/save-edited-image/' + S.imageId,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageData, imageId: S.imageId })
                }
            );

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || '最終画像の保存に失敗しました');
            }
            window.logger && window.logger.debug('✅ Step3 done: f-image saved');

            // ── 全保存完了 ────────────────────────────────────────────────
            // 保留データをクリア
            S.pendingMaskDataUrl      = null;
            S.pendingCompositeDataUrl = null;

            button.innerHTML = '<i class="fas fa-check mr-2"></i> 保存完了！';
            button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            button.classList.add('bg-green-600');
            setTimeout(() => { window.location.href = '/dashboard'; }, 1000);

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

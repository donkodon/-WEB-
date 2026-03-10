/**
 * mask-tools.js
 * マスク編集ツール（描画・履歴・保存・オーバーレイ表示切替）
 * 依存: editor-state.js, image-adjust.js
 */
(function () {
    'use strict';

    // ── 定数 ──────────────────────────────────────────────────────────
    const MAX_HISTORY = 20;
    const CANVAS_WAIT_TIMEOUT = 200;  // canvas初期化待機時間（ms）
    let maskHistory      = [];
    let maskHistoryIndex = -1;

    function saveMaskHistory() {
        const S = window.EditorState;
        if (!S) return;
        const { maskCtx, maskCanvas } = S;

        // 現在より未来の履歴を削除
        maskHistory = maskHistory.slice(0, maskHistoryIndex + 1);

        // 現在状態を保存
        const data = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        maskHistory.push(data);

        if (maskHistory.length > MAX_HISTORY) {
            maskHistory.shift();
        } else {
            maskHistoryIndex++;
        }
    }

    // ── マスク画像ロード ─────────────────────────────────────────────

    function loadMaskImage() {
        const S = window.EditorState;
        if (!S || !S.maskImageUrl) return;

        // /api/images/proxy 経由で読み込む（R2直URLのCORSを回避）
        const rawUrl = S.maskImageUrl;
        const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(rawUrl)}&_cb=${Date.now()}`;

        function doLoad(src) {
            const mi       = new Image();
            mi.crossOrigin = 'anonymous';
            S.maskImage    = mi;

            mi.onload = function () {
                const { canvas, maskCanvas, maskCtx } = S;

                // canvas がまだ 0 サイズの場合は待つ
                if (canvas.width === 0 || canvas.height === 0) {
                    setTimeout(() => doLoad(src), CANVAS_WAIT_TIMEOUT);
                    return;
                }

                // maskCanvas をメインキャンバスと同サイズに揃えてからマスクを描画
                maskCanvas.width  = canvas.width;
                maskCanvas.height = canvas.height;

                // マスク画像をキャンバスサイズにフィットさせて描画
                const { canvas: scaledCanvas, ctx: scaledCtx } = _createCanvas(canvas.width, canvas.height);
                scaledCtx.drawImage(mi, 0, 0, canvas.width, canvas.height);

                S.maskImageData = scaledCtx.getImageData(0, 0, canvas.width, canvas.height);
                maskCtx.putImageData(S.maskImageData, 0, 0);

                saveMaskHistory();
                
                // マスクロード完了後、画像調整を適用（マスク合成を含む）
                if (window.ImageAdjust && window.ImageAdjust.applyAllAdjustments) {
                    window.ImageAdjust.applyAllAdjustments();
                }

                if (S.maskVisible) {
                    window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
                }
            };

            mi.onerror = function () {
                if (src !== proxyUrl) {
                    doLoad(proxyUrl);
                } else {
                    console.error('❌ loadMaskImage failed:', rawUrl);
                }
            };

            mi.src = src;
        }

        // まずプロキシ経由で試みる（CORSとキャッシュ両方を解決）
        doLoad(proxyUrl);
    }

    // ── マスク描画（maskCanvas への書き込み） ────────────────────────

    function drawMask(x1, y1, x2, y2) {
        const S = window.EditorState;
        if (!S) return;
        const { maskCtx, maskCanvas, img, ctx, currentTool, maskBrushSize, maskVisible } = S;

        maskCtx.lineCap               = 'round';
        maskCtx.lineJoin              = 'round';
        maskCtx.lineWidth             = maskBrushSize;
        maskCtx.globalCompositeOperation = 'source-over';

        if (currentTool === 'mask-brush') {
            maskCtx.strokeStyle = 'rgba(255,255,255,1)'; // 白 = 商品
        } else {
            maskCtx.strokeStyle = 'rgba(0,0,0,1)';       // 黒 = 背景
        }

        maskCtx.beginPath();
        maskCtx.moveTo(x1, y1);
        maskCtx.lineTo(x2, y2);
        maskCtx.stroke();

        // maskImageData を同期
        S.maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

        // 画面を再描画
        // マスクタブ時は originalForMask キャッシュから再描画（img.src 依存を排除）
        // originalForMask がない場合のみ img にフォールバック
        if (S.originalForMask) {
            ctx.putImageData(S.originalForMask, 0, 0);
        } else {
            ctx.drawImage(img, 0, 0);
        }

        if (maskVisible) {
            window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
        }
    }

    // ── window API（tab-switching.js・editor.tsx から呼ばれる） ──────

    /** マスクタブに切り替える際：オリジナル画像をキャンバスに描画してオーバーレイを表示 */
    window.switchToOriginalForMask = function (callback) {
        const S = window.EditorState;
        if (!S) return;
        const { canvas, ctx, originalSrc, showingOriginal } = S;

        // トグルボタンのラベル更新
        const btn = document.getElementById('btn-toggle-original');
        if (btn) btn.innerHTML = '<i class="fas fa-image mr-2"></i> 処理後画像を表示';

        // すでにオリジナル表示中ならそのままコールバックを呼ぶ
        if (showingOriginal) {
            if (callback) callback();
            return;
        }

        S.showingOriginal = true;

        // ── img.src は変更しない ──
        // 独自の Image オブジェクトでオリジナルをロードして canvas に描画する。
        // これにより image-processing.js の img.onload が再発火せず、
        // originalImage キャッシュが保全される。
        function drawOriginal(src) {
            const tmpImg       = new Image();
            tmpImg.crossOrigin = 'anonymous';
            tmpImg.onload = function () {
                // ✅ 修正: canvasサイズを維持し、元画像をリサイズ後のサイズに拡大描画
                // これにより、画像調整タブとマスクタブでcanvasサイズが統一される
                window.logger && window.logger.debug(`📐 Drawing original image: ${tmpImg.naturalWidth}x${tmpImg.naturalHeight} → canvas ${canvas.width}x${canvas.height}`);
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(tmpImg, 0, 0, canvas.width, canvas.height);

                // ★ オリジナル画像を ImageData としてキャッシュする
                // drawMask / applyMaskOverlay の再描画ベースとして使用する
                S.originalForMask = ctx.getImageData(0, 0, canvas.width, canvas.height);
                window.logger && window.logger.debug('✅ Switched to original for mask, cached as originalForMask (canvas size maintained)');

                if (callback) callback();
            };
            tmpImg.onerror = function () {
                if (src !== `/api/images/proxy?url=${encodeURIComponent(originalSrc)}`) {
                    window.logger && window.logger.warn('⚠️ Direct load failed, retrying via proxy');
                    drawOriginal(`/api/images/proxy?url=${encodeURIComponent(originalSrc)}`);
                } else {
                    window.logger && window.logger.error('❌ Both direct & proxy failed for original');
                    if (callback) callback();
                }
            };
            tmpImg.src = src;
        }

        drawOriginal(originalSrc);
    };

    /** 調整タブに切り替える際：初回ロード時の画像（処理済み優先）をキャンバスに再描画 */
    window.switchToProcessedImage = function () {
        const S = window.EditorState;
        if (!S) return;

        S.showingOriginal = false;
        S.maskVisible     = false;

        // originalImage キャッシュ（初回ロード時の画像、processedSrc 優先）を再描画
        if (S.originalImage) {
            const { canvas, ctx } = S;
            canvas.width  = S.originalImage.width;
            canvas.height = S.originalImage.height;
            ctx.putImageData(S.originalImage, 0, 0);
            window.logger && window.logger.debug('✅ Switched to adjust tab (showing initial loaded image)');
        } else {
            // フォールバック：processedSrc 優先で再ロード
            S.img.src = S.processedSrc || S.originalSrc;
            window.logger && window.logger.debug('✅ Switched via img.src fallback (processedSrc priority)');
        }

        const btn = document.getElementById('btn-toggle-original');
        if (btn) btn.innerHTML = '<i class="fas fa-image mr-2"></i> 元画像を確認';
    };

    /** マスクオーバーレイを表示する */
    window.showMaskOverlay = function () {
        const S = window.EditorState;
        if (!S) return;

        if (!S.maskImageData) {
            // まだロードされていなければロードして再試行
            if (S.maskImageUrl && !S.maskImage) {
                loadMaskImage();
                setTimeout(() => {
                    if (S.maskImageData) {
                        S.maskVisible = true;
                        window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
                    }
                }, 1200);
            }
            return;
        }

        S.maskVisible = true;
        window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
        window.logger && window.logger.debug('✅ Mask overlay shown');
    };

    /** マスクオーバーレイを非表示にする */
    window.hideMaskOverlay = function () {
        const S = window.EditorState;
        if (!S || !S.maskVisible) return;

        S.maskVisible = false;

        // キャンバスを再描画する（img.src 依存を完全排除）
        // 常にオリジナル画像をベースとして再描画する
        // マスクタブ内: originalForMask（オリジナルのキャッシュ）を優先
        // 調整タブ復帰時: originalImage（オリジナル）
        if (S.originalForMask) {
            S.ctx.putImageData(S.originalForMask, 0, 0);
        } else if (S.originalImage) {
            S.ctx.putImageData(S.originalImage, 0, 0);
        } else {
            S.ctx.drawImage(S.img, 0, 0); // フォールバック
        }
        window.ImageAdjust && window.ImageAdjust.applyCurrentAdjustments();
        window.logger && window.logger.debug('✅ Mask overlay hidden');
    };

    /** オリジナル ↔ 処理済み をトグルする（調整タブ内のプレビュー確認ボタン） */
    window.toggleOriginal = function () {
        const S   = window.EditorState;
        if (!S) return;
        const btn = document.getElementById('btn-toggle-original');

        if (S.showingOriginal) {
            // 調整タブ表示に戻す: 常にオリジナル画像
            S.showingOriginal = false;
            if (S.originalImage) {
                const { canvas, ctx } = S;
                canvas.width  = S.originalImage.width;
                canvas.height = S.originalImage.height;
                ctx.putImageData(S.originalImage, 0, 0);
            } else {
                S.img.src = S.originalSrc; // フォールバック
            }
            if (btn) btn.innerHTML = '<i class="fas fa-image mr-2"></i> 元画像を確認';
        } else {
            // オリジナルを表示: 独自 Image でロード（img.src を汚染しない）
            S.showingOriginal = true;
            const tmpImg       = new Image();
            tmpImg.crossOrigin = 'anonymous';
            tmpImg.onload = function () {
                S.ctx.drawImage(tmpImg, 0, 0);
            };
            tmpImg.onerror = function () {
                tmpImg.src = `/api/images/proxy?url=${encodeURIComponent(S.originalSrc)}`;
            };
            tmpImg.src = S.originalSrc;
            if (btn) btn.innerHTML = '<i class="fas fa-image mr-2"></i> 処理後画像を表示';
        }
    };

    // ── マスク編集モード ON/OFF ──────────────────────────────────────

    window.enableMaskMode = function () {
        const S         = window.EditorState;
        if (!S) return;
        const panel     = document.getElementById('mask-panel');
        const indicator = document.getElementById('mask-mode-indicator');
        if (!panel || !indicator) return;

        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
            panel.classList.remove('hidden');
            indicator.classList.remove('hidden');
            S.maskMode    = true;
            S.currentTool = 'mask-eraser';
        } else {
            panel.classList.add('hidden');
            indicator.classList.add('hidden');
            S.maskMode    = false;
            S.currentTool = null;
        }
    };

    /** ブラシ / 消しゴム を切り替える（mask-tools UI ボタンから呼ばれる） */
    window.setMaskMode = function (mode) {
        const S = window.EditorState;
        if (!S) return;

        const brushBtn  = document.getElementById('mask-mode-brush');
        const eraserBtn = document.getElementById('mask-mode-eraser');

        if (mode === 'brush') {
            S.currentTool = 'mask-brush';
            brushBtn  && brushBtn.classList.add('bg-blue-100', 'border-blue-400');
            brushBtn  && brushBtn.classList.remove('bg-white', 'border-gray-200');
            eraserBtn && eraserBtn.classList.remove('bg-blue-100', 'border-blue-400');
            eraserBtn && eraserBtn.classList.add('bg-white', 'border-gray-200');
        } else {
            S.currentTool = 'mask-eraser';
            eraserBtn && eraserBtn.classList.add('bg-blue-100', 'border-blue-400');
            eraserBtn && eraserBtn.classList.remove('bg-white', 'border-gray-200');
            brushBtn  && brushBtn.classList.remove('bg-blue-100', 'border-blue-400');
            brushBtn  && brushBtn.classList.add('bg-white', 'border-gray-200');
        }
    };

    // ── 元に戻す ─────────────────────────────────────────────────────

    window.undoMask = function () {
        if (maskHistoryIndex <= 0) {
            window.logger && window.logger.debug('⚠️ これ以上元に戻せません');
            return;
        }

        const S = window.EditorState;
        if (!S) return;

        maskHistoryIndex--;
        const data    = maskHistory[maskHistoryIndex];
        S.maskCtx.putImageData(data, 0, 0);
        S.maskImageData = S.maskCtx.getImageData(
            0, 0, S.maskCanvas.width, S.maskCanvas.height
        );

        // ベース画像を再描画してからオーバーレイを適用
        // applyMaskOverlay 内で originalForMask / originalImage から再描画するので
        // ここでは明示的な描画は不要（applyMaskOverlay に一任）
        window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
        window.logger && window.logger.debug(`↶ Undo: index ${maskHistoryIndex + 1} → ${maskHistoryIndex}`);
    };

    // ── マスク保存 → 背景削除合成 → canvas描画 → 画像調整タブ ──────
    // ※ この時点では R2 へのアップロードは行わない。
    //    マスク・p画像のデータは EditorState に保留し、
    //    「保存してダッシュボードへ」ボタン押下時に一括アップロードする。

    window.saveMask = async function (productSku) {
        const S = window.EditorState;
        if (!S || !S.maskCanvas) {
            window.logger && window.logger.error('❌ maskCanvas not initialized');
            return;
        }

        const saveBtn = document.querySelector('#mask-tools button.bg-blue-600');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 処理中...';
        }

        try {
            // Step 1: マスクを base64 に変換してR2に保存
            const maskDataUrl = S.maskCanvas.toDataURL('image/png');
            window.logger && window.logger.debug('✅ Step1: Converting mask to PNG, length:', maskDataUrl.length);
            
            // R2に保存（authenticatedFetchを使用）
            const sku = S.sku;
            const filenamePart = S.filenamePart;
            window.logger && window.logger.info(`Saving mask: sku=${sku}`);
            
            const fetchFn = (typeof window.authenticatedFetch === 'function')
                ? window.authenticatedFetch
                : fetch;
            
            console.log(`🚀 [mask-tools] Sending mask to API: sku=${sku}, filenamePart=${filenamePart}`);
            console.log(`📦 [mask-tools] Mask data size: ${maskDataUrl.length} characters`);
            
            const maskRes = await fetchFn(`/api/save-mask/${sku}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maskDataUrl, filenamePart })
            });
            
            console.log(`📡 [mask-tools] API response status: ${maskRes.status} ${maskRes.statusText}`);
            
            if (!maskRes.ok) {
                const errorText = await maskRes.text();
                console.error(`❌ [mask-tools] API error response:`, errorText);
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText || 'Unknown error' };
                }
                const errorMsg = errorData.details || errorData.error || `Mask save failed (${maskRes.status})`;
                console.error(`❌ [mask-tools] Error message:`, errorMsg);
                throw new Error(errorMsg);
            }
            
            const maskResult = await maskRes.json();
            console.log(`✅ [mask-tools] API response:`, maskResult);
            console.log(`✅ [mask-tools] Mask saved to R2: ${maskResult.r2Key}`);
            console.log(`✅ [mask-tools] Mask URL: ${maskResult.maskUrl}`);
            
            // Verify R2 upload by trying to fetch the image
            if (maskResult.maskUrl) {
                console.log(`🔍 [mask-tools] Verifying R2 upload: ${maskResult.maskUrl}`);
                try {
                    const verifyRes = await fetch(maskResult.maskUrl);
                    console.log(`🔍 [mask-tools] Verification status: ${verifyRes.status}`);
                    if (verifyRes.ok) {
                        console.log(`✅ [mask-tools] R2 verification SUCCESS - image is accessible`);
                    } else {
                        console.error(`❌ [mask-tools] R2 verification FAILED - status ${verifyRes.status}`);
                        throw new Error(`Mask saved but not accessible on R2 (status: ${verifyRes.status})`);
                    }
                } catch (verifyError) {
                    console.error(`❌ [mask-tools] R2 verification ERROR:`, verifyError);
                    throw new Error(`Mask saved but verification failed: ${verifyError.message}`);
                }
            }
            
            // Store mask in memory for later use
            S.pendingMaskDataUrl = maskDataUrl;

            // Step 2: ベース画像 × マスク → 透過 PNG 合成
            // ★ 必ずオリジナル画像（背景あり）を使う
            // processedSrc（p画像）は背景削除済み透過PNGのため、
            // 背景部分のRGBが(0,0,0)になっており、マスク白で alpha=255 を付けると
            // 床など背景ピクセルが真っ黒になる。originalSrc なら木目等の色が保持される。
            const baseSrc = S.originalSrc;
            const origImg = await _loadImage(baseSrc);

            // 元画像サイズの合成用canvasを作成
            const { canvas: comp, ctx: compCtx } = _createCanvas(origImg.width, origImg.height);
            compCtx.drawImage(origImg, 0, 0);

            // maskCanvasを元画像サイズにスケール
            const { canvas: maskTmp, ctx: maskTmpCtx } = _createCanvas(origImg.width, origImg.height);
            maskTmpCtx.drawImage(S.maskCanvas, 0, 0, origImg.width, origImg.height);

            // 合成: マスク輝度をアルファ値に変換
            _applyMaskToImageData(compCtx, maskTmp);

            const compositeDataUrl = comp.toDataURL('image/png');
            window.logger && window.logger.debug('✅ Step2: composite (background-removed) generated');
            
            // Save processed image to R2
            try {
                const processedRes = await fetchFn(`/api/upload-processed-image/${sku}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        imageDataUrl: compositeDataUrl, 
                        filenamePart: filenamePart 
                    })
                });
                
                if (!processedRes.ok) {
                    window.logger && window.logger.warn(`Processed image upload failed: ${processedRes.status}`);
                } else {
                    const processedResult = await processedRes.json();
                    window.logger && window.logger.info(`Processed image saved: ${processedResult.r2Key || processedResult.url}`);
                }
            } catch (procErr) {
                window.logger && window.logger.warn(`Processed image upload error:`, procErr);
            }
            
            // Store composite in memory
            S.pendingCompositeDataUrl = compositeDataUrl;

            // Step 3: canvas を合成画像で更新（画面表示）
            // ✅ 修正：canvasサイズを維持し、合成画像をリサイズ後のサイズに拡大描画
            const { canvas, ctx } = S;
            // canvasサイズは変更しない（リサイズ後のサイズを維持: 例 1778×1000）
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 1. 白背景を塗る
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 2. 元画像全体をcanvasサイズに拡大描画
            ctx.drawImage(origImg, 0, 0, canvas.width, canvas.height);
            
            // 3. マスクで透過処理（destination-in = マスクの白部分だけ残す）
            const { canvas: maskForCanvas, ctx: maskForCanvasCtx } = _createCanvas(canvas.width, canvas.height);
            maskForCanvasCtx.drawImage(maskTmp, 0, 0, canvas.width, canvas.height);
            
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(maskForCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';  // 通常描画に戻す

            // adjustedImage キャッシュを合成済み画像で更新
            // （switchToProcessedImage・hideMaskOverlay がここから再描画する）
            // ※ originalImage は常にオリジナル画像のまま保持する（上書きしない）
            S.adjustedImage   = ctx.getImageData(0, 0, canvas.width, canvas.height);
            S.showingOriginal = false;
            S.maskVisible     = false;

            // processedSrc も合成画像 URL で更新（フォールバック用）
            // ※ compositeDataUrl はメモリ内 data URL なので、
            //   img.src には設定せず EditorState の参照だけ更新する
            S.processedSrc = compositeDataUrl;

            // Switch to adjust tab
            if (window.switchTab) window.switchTab('adjust');
            window.logger && window.logger.info('Mask save complete');
            
            // Success notification
            alert('✅ マスクと背景削除画像をR2に保存しました！');

        } catch (error) {
            window.logger && window.logger.error('Mask save error:', error);
            alert('❌ 保存中にエラーが発生しました: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled  = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> 保存';
            }
        }
    };

    // ── ユーティリティ関数 ──────────────────────────────────────────

    /**
     * 新しいcanvas要素とcontextを作成する
     * @param {number} width - canvas幅
     * @param {number} height - canvas高さ
     * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
     */
    function _createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        return { canvas, ctx };
    }

    /**
     * マスクcanvasの輝度をアルファ値に変換して、画像に適用する
     * @param {CanvasRenderingContext2D} targetCtx - 対象画像のcontext
     * @param {HTMLCanvasElement} maskCanvas - マスクcanvas
     */
    function _applyMaskToImageData(targetCtx, maskCanvas) {
        const width = maskCanvas.width;
        const height = maskCanvas.height;
        
        const imgData = targetCtx.getImageData(0, 0, width, height);
        const maskData = maskCanvas.getContext('2d').getImageData(0, 0, width, height);

        // マスク輝度 → アルファ値に変換
        for (let i = 0; i < imgData.data.length; i += 4) {
            const avg = (maskData.data[i] + maskData.data[i + 1] + maskData.data[i + 2]) / 3;
            imgData.data[i + 3] = avg;
        }
        
        targetCtx.putImageData(imgData, 0, 0);
    }

    /**
     * 画像を crossOrigin='anonymous' でロードし、失敗時はプロキシ経由で再試行する
     * @param {string} src - 画像URL
     * @returns {Promise<HTMLImageElement>}
     */
    function _loadImage(src) {
        return new Promise((resolve, reject) => {
            const i       = new Image();
            i.crossOrigin = 'anonymous';
            i.onload      = () => resolve(i);
            i.onerror     = () => {
                const p      = new Image();
                p.onload     = () => resolve(p);
                p.onerror    = () => reject(new Error('Failed to load: ' + src));
                p.src        = `/api/images/proxy?url=${encodeURIComponent(src)}`;
            };
            i.src = src;
        });
    }

    /**
     * maskCanvas を新しいサイズにリサイズする。
     * 既存のマスク内容は新サイズにスケールして引き継ぐ。
     * @param {number} newW - 新しい幅
     * @param {number} newH - 新しい高さ
     */
    function _resizeMaskCanvas(newW, newH) {
        const S = window.EditorState;
        if (!S) return;
        const { maskCanvas, maskCtx } = S;

        // 現在の内容を一時 canvas に保存
        const { canvas: tmp, ctx: tmpCtx } = _createCanvas(maskCanvas.width, maskCanvas.height);
        if (S.maskImageData) {
            tmpCtx.putImageData(S.maskImageData, 0, 0);
        }

        // maskCanvas を新サイズにリサイズ
        maskCanvas.width  = newW;
        maskCanvas.height = newH;

        // 内容をスケーリングして再描画
        maskCtx.drawImage(tmp, 0, 0, newW, newH);

        // maskImageData を更新
        S.maskImageData = maskCtx.getImageData(0, 0, newW, newH);
        window.logger && window.logger.debug(`📐 maskCanvas resized to ${newW}x${newH}`);
    }

    // ── 初期化（image-processing.js の init() から呼ばれる） ─────────

    window.MaskTools = {
        saveMaskHistory,
        loadMaskImage,
        drawMask,

        setup() {
            const S = window.EditorState;
            if (!S) return;

            // ブラシ / 消しゴムボタン（mask-tools パネル内）
            const brushBtn  = document.getElementById('mask-brush-btn');
            const eraserBtn = document.getElementById('mask-eraser-btn');

            if (brushBtn) {
                brushBtn.addEventListener('click', () => {
                    S.currentTool = 'mask-brush';
                    brushBtn.classList.add('border-2', 'border-blue-400', 'text-blue-600');
                    brushBtn.classList.remove('border-gray-200');
                    if (eraserBtn) {
                        eraserBtn.classList.remove('border-2', 'border-blue-400', 'text-blue-600');
                        eraserBtn.classList.add('border-gray-200');
                    }
                });
            }

            if (eraserBtn) {
                eraserBtn.addEventListener('click', () => {
                    S.currentTool = 'mask-eraser';
                    eraserBtn.classList.add('border-2', 'border-blue-400', 'text-blue-600');
                    eraserBtn.classList.remove('border-gray-200');
                    if (brushBtn) {
                        brushBtn.classList.remove('border-2', 'border-blue-400', 'text-blue-600');
                        brushBtn.classList.add('border-gray-200');
                    }
                });
            }

            window.logger && window.logger.debug('✅ [mask-tools] initialized');
        }
    };

    // ────────────────────────────────────────────────────────────────
    // グローバル関数: マスクをcanvasに適用（オリジナル画像ベース）
    // ────────────────────────────────────────────────────────────────
    /**
     * applyMaskToCanvas()
     * オリジナル画像 + マスク合成 を canvas に描画
     * 
     * 処理フロー:
     * 1. 白背景を塗る
     * 2. オリジナル画像を描画
     * 3. マスクで透過処理（destination-in合成）
     * 4. adjustedImage を更新（明るさ調整のベース）
     */
    /**
     * オリジナル画像 + マスク合成を canvas に描画
     * 処理フロー: 白背景 → オリジナル画像 → マスク透過処理 → adjustedImage更新
     */
    window.applyMaskToCanvas = function() {
        const S = window.EditorState;
        if (!S) {
            window.logger && window.logger.error('❌ EditorState is null');
            return;
        }
        if (!S.maskCanvas) {
            window.logger && window.logger.error('❌ maskCanvas is null');
            return;
        }
        if (!S.originalImage) {
            window.logger && window.logger.error('❌ originalImage is null');
            return;
        }

        const { canvas, ctx, maskCanvas } = S;
        
        window.logger && window.logger.info(`🎨 [applyMaskToCanvas] Canvas: ${canvas.width}×${canvas.height}, Mask: ${maskCanvas.width}×${maskCanvas.height}`);
        
        // 1. 白背景を塗る
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 2. オリジナル画像を描画
        ctx.putImageData(S.originalImage, 0, 0);
        
        // 3. マスクで透過処理（destination-in = マスクの白部分だけ残す）
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        
        // 4. adjustedImage キャッシュを更新
        S.adjustedImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        S.showingOriginal = false;
        S.maskVisible = false;
        
        window.logger && window.logger.info('✅ [applyMaskToCanvas] Complete');
    };
})();

/**
 * mask-tools.js
 * マスク編集ツール（描画・履歴・保存・オーバーレイ表示切替）
 * 依存: editor-state.js, image-adjust.js
 */
(function () {
    'use strict';

    // ── ヒストリ管理 ─────────────────────────────────────────────────
    const MAX_HISTORY = 20;
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

        window.logger && window.logger.debug(`💾 Mask history saved: index=${maskHistoryIndex} total=${maskHistory.length}`);
    }

    // ── マスク画像ロード ─────────────────────────────────────────────

    function loadMaskImage() {
        const S = window.EditorState;
        if (!S || !S.maskImageUrl) return;

        // キャッシュバスターを付与（ブラウザキャッシュで古いマスクが出ないようにする）
        const rawUrl  = S.maskImageUrl;
        const maskUrl = rawUrl + (rawUrl.includes('?') ? '&' : '?') + '_cb=' + Date.now();
        window.logger && window.logger.debug('🎭 loadMaskImage (cache-busted):', maskUrl);

        // /api/images/proxy 経由で読み込む（R2直URLのCORSを回避）
        const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(rawUrl)}&_cb=${Date.now()}`;

        function doLoad(src) {
            const mi       = new Image();
            mi.crossOrigin = 'anonymous';
            S.maskImage    = mi;

            mi.onload = function () {
                const { canvas, maskCanvas, maskCtx } = S;

                // canvas がまだ 0 サイズの場合は待つ
                if (canvas.width === 0 || canvas.height === 0) {
                    window.logger && window.logger.warn('⚠️ canvas not ready, retrying in 200ms');
                    setTimeout(() => doLoad(src), 200);
                    return;
                }

                window.logger && window.logger.debug('🎭 Mask image natural size:', mi.naturalWidth, 'x', mi.naturalHeight);
                window.logger && window.logger.debug('🎭 Canvas size:', canvas.width, 'x', canvas.height);

                // maskCanvas をメインキャンバスと同サイズに揃えてからマスクを描画
                maskCanvas.width  = canvas.width;
                maskCanvas.height = canvas.height;

                // マスク画像をキャンバスサイズにフィットさせて描画
                // （マスク保存時のサイズ != 現在のキャンバスサイズの場合もスケールで合わせる）
                const tmp    = document.createElement('canvas');
                tmp.width    = canvas.width;
                tmp.height   = canvas.height;
                const tmpCtx = tmp.getContext('2d');
                tmpCtx.drawImage(mi, 0, 0, canvas.width, canvas.height);

                S.maskImageData = tmpCtx.getImageData(0, 0, canvas.width, canvas.height);
                maskCtx.putImageData(S.maskImageData, 0, 0);

                window.logger && window.logger.debug('✅ Mask loaded & synced to canvas size:', canvas.width, 'x', canvas.height);

                saveMaskHistory();

                if (S.maskVisible) {
                    window.ImageAdjust && window.ImageAdjust.applyMaskOverlay();
                }
            };

            mi.onerror = function () {
                if (src !== proxyUrl) {
                    window.logger && window.logger.warn('⚠️ Direct load failed, retrying via proxy:', proxyUrl);
                    doLoad(proxyUrl);
                } else {
                    window.logger && window.logger.error('❌ loadMaskImage failed (both direct and proxy):', rawUrl);
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
                if (canvas.width !== tmpImg.naturalWidth || canvas.height !== tmpImg.naturalHeight) {
                    window.logger && window.logger.debug(`📐 Resizing canvas: ${canvas.width}x${canvas.height} → ${tmpImg.naturalWidth}x${tmpImg.naturalHeight}`);
                    canvas.width  = tmpImg.naturalWidth;
                    canvas.height = tmpImg.naturalHeight;
                    _resizeMaskCanvas(tmpImg.naturalWidth, tmpImg.naturalHeight);
                }
                ctx.drawImage(tmpImg, 0, 0);

                // ★ オリジナル画像を ImageData としてキャッシュする
                // drawMask / applyMaskOverlay の再描画ベースとして使用する
                S.originalForMask = ctx.getImageData(0, 0, canvas.width, canvas.height);
                window.logger && window.logger.debug('✅ Switched to original for mask, cached as originalForMask');

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

    /** 調整タブに切り替える際：合成済み画像（adjustedImage）または オリジナル をキャンバスに再描画 */
    window.switchToProcessedImage = function () {
        const S = window.EditorState;
        if (!S) return;

        S.showingOriginal = false;
        S.maskVisible     = false;

        // saveMask後は adjustedImage（合成済み白抜き画像）が存在するのでそちらを優先。
        // saveMask前は adjustedImage が null なので originalImage（オリジナル）を使う。
        // img.src は変更しない（img.onload を再発火させないため）。
        if (S.adjustedImage) {
            const { canvas, ctx } = S;
            canvas.width  = S.adjustedImage.width;
            canvas.height = S.adjustedImage.height;
            ctx.putImageData(S.adjustedImage, 0, 0);
            window.logger && window.logger.debug('✅ Switched to adjusted image (from adjustedImage cache)');
        } else if (S.originalImage) {
            const { canvas, ctx } = S;
            canvas.width  = S.originalImage.width;
            canvas.height = S.originalImage.height;
            ctx.putImageData(S.originalImage, 0, 0);
            window.logger && window.logger.debug('✅ Switched to original image (adjustedImage not yet set)');
        } else {
            // どちらもない場合のフォールバック（初期ロード前）
            S.img.src = S.originalSrc;
            window.logger && window.logger.debug('✅ Switched to original image (fallback via img.src)');
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
        // 調整タブ復帰時: adjustedImage（saveMask後）または originalImage（未保存）
        // マスクタブ内: originalForMask（オリジナルキャッシュ）
        if (S.showingOriginal && S.originalForMask) {
            S.ctx.putImageData(S.originalForMask, 0, 0);
        } else if (!S.showingOriginal && S.adjustedImage) {
            S.ctx.putImageData(S.adjustedImage, 0, 0);
        } else if (!S.showingOriginal && S.originalImage) {
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
            // 調整タブ表示に戻す: adjustedImage（saveMask後）または originalImage
            S.showingOriginal = false;
            if (S.adjustedImage) {
                const { canvas, ctx } = S;
                canvas.width  = S.adjustedImage.width;
                canvas.height = S.adjustedImage.height;
                ctx.putImageData(S.adjustedImage, 0, 0);
            } else if (S.originalImage) {
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
            // Step 1: マスクを base64 に変換して保留（R2 アップロードは後で）
            const maskDataUrl = S.maskCanvas.toDataURL('image/png');
            S.pendingMaskDataUrl = maskDataUrl;
            window.logger && window.logger.debug('✅ Step1: mask data stored in memory (pending upload)');

            // Step 2: ベース画像 × マスク → 透過 PNG 合成
            // ★ 必ずオリジナル画像（背景あり）を使う
            // processedSrc（p画像）は背景削除済み透過PNGのため、
            // 背景部分のRGBが(0,0,0)になっており、マスク白で alpha=255 を付けると
            // 床など背景ピクセルが真っ黒になる。originalSrc なら木目等の色が保持される。
            const baseSrc = S.originalSrc;
            window.logger && window.logger.debug('🖼️ saveMask base image (original):', baseSrc);
            const origImg = await _loadImage(baseSrc);

            const comp    = document.createElement('canvas');
            comp.width    = origImg.width;
            comp.height   = origImg.height;
            const compCtx = comp.getContext('2d');
            compCtx.drawImage(origImg, 0, 0);

            const imgData = compCtx.getImageData(0, 0, comp.width, comp.height);

            // maskCanvas をスケールしてピクセルデータを取得
            const maskTmp    = document.createElement('canvas');
            maskTmp.width    = comp.width;
            maskTmp.height   = comp.height;
            const maskTmpCtx = maskTmp.getContext('2d');
            maskTmpCtx.drawImage(S.maskCanvas, 0, 0, comp.width, comp.height);
            const maskData   = maskTmpCtx.getImageData(0, 0, comp.width, comp.height);

            // マスク輝度 → アルファ値に変換
            for (let i = 0; i < imgData.data.length; i += 4) {
                const avg = (maskData.data[i] + maskData.data[i + 1] + maskData.data[i + 2]) / 3;
                imgData.data[i + 3] = avg;
            }
            compCtx.putImageData(imgData, 0, 0);

            const compositeDataUrl = comp.toDataURL('image/png');
            // p画像も保留（R2 アップロードは後で）
            S.pendingCompositeDataUrl = compositeDataUrl;
            window.logger && window.logger.debug('✅ Step2: composite generated & stored in memory (pending upload)');

            // Step 3: canvas を合成画像で更新（画面表示のみ、R2 保存なし）
            const { canvas, ctx } = S;
            canvas.width  = comp.width;
            canvas.height = comp.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 白背景を先に敷く（透明ピクセルが黒く見えるのを防ぐ）
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(comp, 0, 0);

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

            window.logger && window.logger.debug('✅ Step3: canvas updated (display only), originalImage & processedSrc updated');

            // Step 4: 画像調整タブへ切替
            if (window.switchTab) window.switchTab('adjust');
            window.logger && window.logger.debug('✅ saveMask complete (pending: mask + p-image will be saved on final save)');

        } catch (error) {
            window.logger && window.logger.error('❌ saveMask error:', error);
            alert('保存中にエラーが発生しました: ' + error.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled  = false;
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> 保存';
            }
        }
    };

    /** 画像を crossOrigin='anonymous' でロードし、失敗時はプロキシ経由で再試行する */
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

    // ── maskCanvas をリサイズ（内容をスケーリングして保持） ──────────

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
        const tmp    = document.createElement('canvas');
        tmp.width    = maskCanvas.width;
        tmp.height   = maskCanvas.height;
        const tmpCtx = tmp.getContext('2d');
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
})();

/**
 * Crop Helper - Square Crop UI
 * 自動センタークロップ + ドラッグ調整UI
 * 出力: 1000×1000 PNG → /api/upload-processed-image/:sku
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    // モーダル DOM（初回のみ作成）
    // ─────────────────────────────────────────────
    function ensureModal() {
        if (document.getElementById('crop-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'crop-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 hidden';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col" style="max-height:90vh;">
                <!-- ヘッダー -->
                <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-crop-alt mr-2 text-blue-600"></i>正方形クロップ</h2>
                        <p class="text-xs text-gray-500 mt-0.5">枠をドラッグして位置調整 → 確定で保存（1000×1000）</p>
                    </div>
                    <button id="crop-close-btn" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>

                <!-- ボディ -->
                <div class="flex gap-4 p-6 overflow-auto flex-1">
                    <!-- 左: 編集エリア -->
                    <div class="flex-1 flex flex-col items-center">
                        <p class="text-xs text-gray-500 mb-2 font-medium">元画像（枠をドラッグして調整）</p>
                        <div id="crop-canvas-wrap" class="relative select-none overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                             style="width:380px;height:380px;flex-shrink:0;">
                            <!-- 元画像（背景として表示） -->
                            <img id="crop-source-img" class="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                            <!-- クロップ枠（SVGオーバーレイ） -->
                            <svg id="crop-overlay" class="absolute inset-0" style="width:100%;height:100%;">
                                <!-- 暗幕 -->
                                <defs>
                                    <mask id="crop-mask">
                                        <rect width="100%" height="100%" fill="white"/>
                                        <rect id="crop-mask-hole" fill="black"/>
                                    </mask>
                                </defs>
                                <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#crop-mask)"/>
                                <!-- 枠本体（ドラッグターゲット） -->
                                <rect id="crop-frame" fill="none" stroke="white" stroke-width="2"
                                      stroke-dasharray="6,3" style="cursor:move;"/>
                                <!-- 四隅ハンドル -->
                                <rect id="crop-handle-tl" width="10" height="10" fill="white" style="cursor:nw-resize;"/>
                                <rect id="crop-handle-tr" width="10" height="10" fill="white" style="cursor:ne-resize;"/>
                                <rect id="crop-handle-bl" width="10" height="10" fill="white" style="cursor:sw-resize;"/>
                                <rect id="crop-handle-br" width="10" height="10" fill="white" style="cursor:se-resize;"/>
                            </svg>
                        </div>
                        <!-- ボタン -->
                        <div class="flex gap-3 mt-4">
                            <button id="crop-reset-btn"
                                    class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1">
                                <i class="fas fa-redo-alt text-xs"></i>自動センター
                            </button>
                            <button id="crop-save-btn"
                                    class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-1 shadow">
                                <i class="fas fa-save text-xs"></i>確定して保存
                            </button>
                        </div>
                    </div>

                    <!-- 右: プレビュー -->
                    <div class="flex flex-col items-center" style="width:220px;flex-shrink:0;">
                        <p class="text-xs text-gray-500 mb-2 font-medium">プレビュー（1000×1000）</p>
                        <div class="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden" style="width:200px;height:200px;">
                            <canvas id="crop-preview-canvas" width="200" height="200" class="block"></canvas>
                        </div>
                        <p class="text-xs text-gray-400 mt-2">保存後のイメージ</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // ─────────────────────────────────────────────
    // 状態
    // ─────────────────────────────────────────────
    let state = {
        // 表示用（380×380コンテナ内のスケール座標）
        frameX: 0, frameY: 0, frameSize: 0,
        // 元画像の実サイズ
        imgW: 0, imgH: 0,
        // コンテナ内に描画された画像の実際の位置・サイズ（object-contain計算後）
        dispX: 0, dispY: 0, dispW: 0, dispH: 0,
        // ドラッグ
        drag: null,   // 'move' | 'tl' | 'tr' | 'bl' | 'br'
        dragStartX: 0, dragStartY: 0,
        dragStartFrame: null,
        // 保存先
        sku: '', filenamePart: '', imageId: '', originalUrl: '',
        // ロード済み Image オブジェクト
        image: null,
    };

    const CONTAINER = 380; // 編集エリアの px

    // ─────────────────────────────────────────────
    // 公開エントリポイント
    // ─────────────────────────────────────────────
    window.openCropModal = async function (imageId, sku, filenamePart, originalUrl) {
        ensureModal();

        state.sku = sku;
        state.filenamePart = filenamePart;
        state.imageId = imageId;
        state.originalUrl = originalUrl;

        // 画像ロード
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = originalUrl;
        });
        state.image = img;
        state.imgW = img.naturalWidth;
        state.imgH = img.naturalHeight;

        // ソース表示
        document.getElementById('crop-source-img').src = originalUrl;

        // コンテナ内でのobject-contain計算
        calcDispRect();

        // 自動センタークロップ
        autoCenter();

        // モーダル表示
        document.getElementById('crop-modal').classList.remove('hidden');

        // イベント初期化
        initEvents();
    };

    // ─────────────────────────────────────────────
    // object-contain 計算
    // ─────────────────────────────────────────────
    function calcDispRect() {
        const { imgW, imgH } = state;
        const scale = Math.min(CONTAINER / imgW, CONTAINER / imgH);
        const dW = imgW * scale;
        const dH = imgH * scale;
        state.dispW = dW;
        state.dispH = dH;
        state.dispX = (CONTAINER - dW) / 2;
        state.dispY = (CONTAINER - dH) / 2;
    }

    // ─────────────────────────────────────────────
    // 自動センタークロップ
    // ─────────────────────────────────────────────
    function autoCenter() {
        const { dispX, dispY, dispW, dispH } = state;
        // 短辺基準の正方形
        const side = Math.min(dispW, dispH);
        state.frameSize = side;
        state.frameX = dispX + (dispW - side) / 2;
        state.frameY = dispY + (dispH - side) / 2;
        renderFrame();
        renderPreview();
    }

    // ─────────────────────────────────────────────
    // 枠描画
    // ─────────────────────────────────────────────
    function renderFrame() {
        const { frameX: x, frameY: y, frameSize: s } = state;
        const HANDLE = 10;

        // 枠
        setAttr('crop-frame', { x, y, width: s, height: s });
        // マスク穴（暗幕の切り抜き）
        setAttr('crop-mask-hole', { x, y, width: s, height: s });
        // ハンドル
        setAttr('crop-handle-tl', { x: x - HANDLE / 2,     y: y - HANDLE / 2 });
        setAttr('crop-handle-tr', { x: x + s - HANDLE / 2, y: y - HANDLE / 2 });
        setAttr('crop-handle-bl', { x: x - HANDLE / 2,     y: y + s - HANDLE / 2 });
        setAttr('crop-handle-br', { x: x + s - HANDLE / 2, y: y + s - HANDLE / 2 });
    }

    function setAttr(id, attrs) {
        const el = document.getElementById(id);
        if (!el) return;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    }

    // ─────────────────────────────────────────────
    // プレビュー描画
    // ─────────────────────────────────────────────
    function renderPreview() {
        const { frameX, frameY, frameSize, dispX, dispY, dispW, dispH, imgW, imgH, image } = state;
        if (!image) return;

        // 枠座標 → 元画像座標に変換
        const scaleX = imgW / dispW;
        const scaleY = imgH / dispH;
        const srcX = (frameX - dispX) * scaleX;
        const srcY = (frameY - dispY) * scaleY;
        const srcSize = frameSize * Math.min(scaleX, scaleY); // 正方形なので最小スケール
        // より正確に: frameSize / dispW * imgW と frameSize / dispH * imgH は異なる可能性
        // 正方形枠なので src も正方形にするため短辺基準
        const srcSizeX = frameSize * scaleX;
        const srcSizeY = frameSize * scaleY;

        const canvas = document.getElementById('crop-preview-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 200, 200);
        ctx.drawImage(image,
            Math.max(0, srcX), Math.max(0, srcY),
            Math.min(srcSizeX, imgW - Math.max(0, srcX)),
            Math.min(srcSizeY, imgH - Math.max(0, srcY)),
            0, 0, 200, 200
        );
    }

    // ─────────────────────────────────────────────
    // ドラッグイベント
    // ─────────────────────────────────────────────
    function initEvents() {
        const overlay = document.getElementById('crop-overlay');
        const wrap = document.getElementById('crop-canvas-wrap');

        // 既存のリスナーをクリア（再open対策）
        const clone = overlay.cloneNode(true);
        overlay.parentNode.replaceChild(clone, overlay);
        // IDが変わらないので再取得は不要（cloneはIDを維持）

        // ポインターイベント
        document.getElementById('crop-overlay').addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);

        // ボタン
        document.getElementById('crop-reset-btn').onclick = autoCenter;
        document.getElementById('crop-save-btn').onclick = saveCrop;
        document.getElementById('crop-close-btn').onclick = closeModal;
    }

    function getWrapOffset() {
        const wrap = document.getElementById('crop-canvas-wrap');
        const rect = wrap.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
    }

    function onPointerDown(e) {
        e.preventDefault();
        const { left, top } = getWrapOffset();
        const px = e.clientX - left;
        const py = e.clientY - top;

        const { frameX: x, frameY: y, frameSize: s } = state;
        const HANDLE = 14; // タップ判定広め

        let drag = null;
        if (hit(px, py, x - HANDLE / 2, y - HANDLE / 2, HANDLE)) drag = 'tl';
        else if (hit(px, py, x + s - HANDLE / 2, y - HANDLE / 2, HANDLE)) drag = 'tr';
        else if (hit(px, py, x - HANDLE / 2, y + s - HANDLE / 2, HANDLE)) drag = 'bl';
        else if (hit(px, py, x + s - HANDLE / 2, y + s - HANDLE / 2, HANDLE)) drag = 'br';
        else if (px >= x && px <= x + s && py >= y && py <= y + s) drag = 'move';

        if (!drag) return;
        state.drag = drag;
        state.dragStartX = px;
        state.dragStartY = py;
        state.dragStartFrame = { x: state.frameX, y: state.frameY, s: state.frameSize };
        document.getElementById('crop-overlay').setPointerCapture(e.pointerId);
    }

    function hit(px, py, hx, hy, size) {
        return px >= hx && px <= hx + size && py >= hy && py <= hy + size;
    }

    function onPointerMove(e) {
        if (!state.drag) return;
        const { left, top } = getWrapOffset();
        const px = e.clientX - left;
        const py = e.clientY - top;
        const dx = px - state.dragStartX;
        const dy = py - state.dragStartY;
        const { x: ox, y: oy, s: os } = state.dragStartFrame;
        const { dispX, dispY, dispW, dispH } = state;

        const MIN_SIZE = 40;

        if (state.drag === 'move') {
            state.frameX = clamp(ox + dx, dispX, dispX + dispW - state.frameSize);
            state.frameY = clamp(oy + dy, dispY, dispY + dispH - state.frameSize);
        } else {
            // リサイズ（正方形維持: dx/dyの小さい方を採用）
            let delta = 0;
            if (state.drag === 'tl') {
                delta = Math.min(dx, dy); // 縮小方向が正
                const newS = clamp(os - delta, MIN_SIZE, Math.min(dispW, dispH));
                const diff = os - newS;
                state.frameX = clamp(ox + diff, dispX, dispX + dispW - newS);
                state.frameY = clamp(oy + diff, dispY, dispY + dispH - newS);
                state.frameSize = newS;
            } else if (state.drag === 'tr') {
                delta = Math.min(-dx, dy);
                const newS = clamp(os - delta, MIN_SIZE, Math.min(dispW, dispH));
                const diff = os - newS;
                state.frameX = clamp(ox, dispX, dispX + dispW - newS);
                state.frameY = clamp(oy + diff, dispY, dispY + dispH - newS);
                state.frameSize = newS;
            } else if (state.drag === 'bl') {
                delta = Math.min(dx, -dy);
                const newS = clamp(os - delta, MIN_SIZE, Math.min(dispW, dispH));
                const diff = os - newS;
                state.frameX = clamp(ox + diff, dispX, dispX + dispW - newS);
                state.frameY = clamp(oy, dispY, dispY + dispH - newS);
                state.frameSize = newS;
            } else if (state.drag === 'br') {
                delta = Math.max(dx, dy);
                const newS = clamp(os + delta, MIN_SIZE, Math.min(dispW, dispH));
                state.frameX = clamp(ox, dispX, dispX + dispW - newS);
                state.frameY = clamp(oy, dispY, dispY + dispH - newS);
                state.frameSize = newS;
            }
        }

        renderFrame();
        renderPreview();
    }

    function onPointerUp() {
        state.drag = null;
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // ─────────────────────────────────────────────
    // 保存処理
    // ─────────────────────────────────────────────
    async function saveCrop() {
        const btn = document.getElementById('crop-save-btn');
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> 保存中...';

        try {
            const { frameX, frameY, frameSize, dispX, dispY, dispW, dispH, imgW, imgH, image, sku, filenamePart } = state;

            // 枠座標 → 元画像座標に変換
            const scaleX = imgW / dispW;
            const scaleY = imgH / dispH;
            const srcX = Math.max(0, (frameX - dispX) * scaleX);
            const srcY = Math.max(0, (frameY - dispY) * scaleY);
            const srcW = Math.min(frameSize * scaleX, imgW - srcX);
            const srcH = Math.min(frameSize * scaleY, imgH - srcY);

            // 1000×1000 canvas に描画
            const out = document.createElement('canvas');
            out.width = 1000;
            out.height = 1000;
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 1000, 1000);
            ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, 1000, 1000);

            const dataUrl = out.toDataURL('image/png');

            // アップロード
            const res = await window.authenticatedFetch('/api/upload-processed-image/' + sku, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: dataUrl, filenamePart })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Upload failed' }));
                throw new Error(err.details || err.error || 'Upload failed');
            }

            const data = await res.json();
            window.logger.debug('✅ Crop saved:', data.processedUrl);

            // ダッシュボードの画像を即更新
            const container = document.querySelector(`[data-image-id="${state.imageId}"]`);
            if (container) {
                const img = container.querySelector('img');
                if (img) img.src = (data.processedUrl || '') + '?v=' + Date.now();
            }

            closeModal();
            alert('✅ 保存しました！');

        } catch (e) {
            window.logger.error('❌ Crop save error:', e.message);
            alert('エラー: ' + e.message);
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    }

    // ─────────────────────────────────────────────
    // モーダルを閉じる
    // ─────────────────────────────────────────────
    function closeModal() {
        const modal = document.getElementById('crop-modal');
        if (modal) modal.classList.add('hidden');
        state.drag = null;
        state.image = null;
        // イベント解除
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    }

    window.logger.debug('✅ crop-helper.js loaded');
})();

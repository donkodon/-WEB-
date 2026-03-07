/**
 * crop-tool.js  ─  1000×1000 インラインクロップ UI
 *
 * 動作:
 *   切り抜きボタン押下
 *     → 左サイドバーを crop-panel に切り替え
 *     → 右の canvas-container 上に正方形オーバーレイを表示
 *     → ドラッグで枠を移動
 *     → 左のプレビューをリアルタイム更新
 *   「確定して保存」
 *     → 1000×1000 PNG を R2 に保存
 *     → サイドバーを元に戻してページリロード
 *   「キャンセル」
 *     → オーバーレイを除去してサイドバーを元に戻す
 *
 * 依存: editor-state.js (window.EditorState)
 */
(function () {
    'use strict';

    const OUTPUT_SIZE = 1000;

    // ── 状態 ──────────────────────────────────────────────────────
    let srcCanvas  = null;   // 対象画像を描いた off-screen canvas
    let cropX      = 0;      // 枠の左上X（srcCanvas 座標系）
    let cropY      = 0;      // 枠の左上Y（srcCanvas 座標系）
    let cropSize   = 0;      // 枠のサイズ（px、正方形）

    let overlay    = null;   // canvas-container に追加するオーバーレイ canvas
    let overlayCtx = null;

    let isDragging = false;
    let dragOffX   = 0;
    let dragOffY   = 0;

    let active     = false;  // クロップモード中か

    // ── 切り抜きモードを開始 ───────────────────────────────────────
    function startCrop() {
        const S = window.EditorState;
        if (!S) return;

        const imgUrl = S.processedSrc || S.originalSrc;
        if (!imgUrl) { alert('画像URLが取得できません。'); return; }

        // サイドバーを切り替え
        showCropPanel();
        setStatus('画像を読み込み中...');

        const loader       = new Image();
        loader.crossOrigin = 'anonymous';
        loader.onload = function () {
            srcCanvas        = document.createElement('canvas');
            srcCanvas.width  = loader.naturalWidth;
            srcCanvas.height = loader.naturalHeight;
            srcCanvas.getContext('2d').drawImage(loader, 0, 0);

            window.logger && window.logger.debug(
                '✅ [crop-tool] loaded:', loader.naturalWidth, 'x', loader.naturalHeight
            );

            resetToAutoCenter();
            buildOverlay();   // オーバーレイを canvas-container に挿入
            renderAll();
            active = true;
        };
        loader.onerror = function () {
            setStatus('❌ 画像の読み込みに失敗しました');
        };
        loader.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    }

    // ── クロップモードを終了 ───────────────────────────────────────
    function stopCrop() {
        active = false;
        removeOverlay();
        hideCropPanel();
        srcCanvas = null;
    }

    // ── サイドバー切り替え ─────────────────────────────────────────
    function showCropPanel() {
        const adjustTools = document.getElementById('adjust-tools');
        const maskTools   = document.getElementById('mask-tools');
        const cropPanel   = document.getElementById('crop-panel');
        if (adjustTools) adjustTools.style.display = 'none';
        if (maskTools)   maskTools.style.display   = 'none';
        if (cropPanel)   cropPanel.style.display   = 'flex';
    }

    function hideCropPanel() {
        const adjustTools = document.getElementById('adjust-tools');
        const cropPanel   = document.getElementById('crop-panel');
        if (adjustTools) adjustTools.style.display = '';
        if (cropPanel)   cropPanel.style.display   = 'none';
        // ツールボタンのアクティブ状態もリセット
        document.querySelectorAll('.tool-btn').forEach(function(b) {
            b.classList.remove('border-orange-400', 'bg-orange-50', 'border-blue-500', 'bg-blue-50');
        });
    }

    // ── オーバーレイを canvas-container に追加 ────────────────────
    function buildOverlay() {
        removeOverlay(); // 既存があれば削除

        const container = document.getElementById('canvas-container');
        if (!container) return;

        overlay               = document.createElement('canvas');
        overlay.id            = 'crop-overlay';
        overlay.style.cssText = [
            'position:absolute',
            'top:0', 'left:0',
            'width:100%', 'height:100%',
            'cursor:move',
            'touch-action:none',
            'z-index:20',
        ].join(';');

        // canvas のピクセルサイズはコンテナの実サイズに合わせる
        const rect = container.getBoundingClientRect();
        overlay.width  = rect.width;
        overlay.height = rect.height;

        overlayCtx = overlay.getContext('2d');

        container.style.position = 'relative'; // 念のため
        container.appendChild(overlay);

        // ドラッグイベント
        overlay.addEventListener('mousedown',  onDragStart);
        overlay.addEventListener('mousemove',  onDragMove);
        overlay.addEventListener('mouseup',    onDragEnd);
        overlay.addEventListener('mouseleave', onDragEnd);
        overlay.addEventListener('touchstart', function(e){ e.preventDefault(); onDragStart(e.touches[0]); }, { passive: false });
        overlay.addEventListener('touchmove',  function(e){ e.preventDefault(); onDragMove(e.touches[0]);  }, { passive: false });
        overlay.addEventListener('touchend',   onDragEnd);
    }

    function removeOverlay() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        overlay    = null;
        overlayCtx = null;
    }

    // ── 自動センタークロップ計算 ───────────────────────────────────
    function resetToAutoCenter() {
        if (!srcCanvas) return;
        cropSize = Math.min(srcCanvas.width, srcCanvas.height);
        cropX    = Math.round((srcCanvas.width  - cropSize) / 2);
        cropY    = Math.round((srcCanvas.height - cropSize) / 2);
    }

    // ── 描画 ──────────────────────────────────────────────────────
    /**
     * オーバーレイは canvas-container 全体を覆う。
     * main-canvas は container 内で flexbox 中央配置されているので
     * getBoundingClientRect で実際の描画位置を取得してオフセットを計算する。
     */
    function getMainCanvasRect() {
        const container = document.getElementById('canvas-container');
        const mainCanvas = document.getElementById('main-canvas');
        if (!container || !mainCanvas) return null;

        const cr = container.getBoundingClientRect();
        const mr = mainCanvas.getBoundingClientRect();
        return {
            x: mr.left - cr.left,
            y: mr.top  - cr.top,
            w: mr.width,
            h: mr.height,
        };
    }

    /**
     * srcCanvas 座標 → オーバーレイ canvas 座標に変換
     * （main-canvas の表示領域内にスケール＆オフセット）
     */
    function toOverlayCoord(sx, sy) {
        const r = getMainCanvasRect();
        if (!r || !srcCanvas) return { x: sx, y: sy };
        const scaleX = r.w / srcCanvas.width;
        const scaleY = r.h / srcCanvas.height;
        return {
            x: r.x + sx * scaleX,
            y: r.y + sy * scaleY,
            scaleX, scaleY,
        };
    }

    function renderAll() {
        renderOverlay();
        renderPreview();
        updateStatus();
    }

    function renderOverlay() {
        if (!overlay || !overlayCtx || !srcCanvas) return;

        // オーバーレイのサイズをコンテナに追従
        const container = document.getElementById('canvas-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            if (overlay.width !== rect.width || overlay.height !== rect.height) {
                overlay.width  = rect.width;
                overlay.height = rect.height;
            }
        }

        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

        const r = getMainCanvasRect();
        if (!r) return;

        const scaleX = r.w / srcCanvas.width;
        const scaleY = r.h / srcCanvas.height;

        // 枠の表示座標
        const fx = r.x + cropX * scaleX;
        const fy = r.y + cropY * scaleY;
        const fw = cropSize * scaleX;
        const fh = cropSize * scaleY;

        // 枠外を半透明で覆う（main-canvas の範囲だけ）
        overlayCtx.fillStyle = 'rgba(0,0,0,0.5)';
        overlayCtx.fillRect(r.x, r.y, r.w, r.h);
        overlayCtx.clearRect(fx, fy, fw, fh);

        // 枠の線（オレンジ）
        overlayCtx.strokeStyle = '#f97316';
        overlayCtx.lineWidth   = 2;
        overlayCtx.setLineDash([]);
        overlayCtx.strokeRect(fx, fy, fw, fh);

        // 四隅ハンドル
        overlayCtx.fillStyle = '#f97316';
        [[fx, fy], [fx+fw, fy], [fx, fy+fh], [fx+fw, fy+fh]].forEach(function([cx, cy]) {
            overlayCtx.fillRect(cx-6, cy-6, 12, 12);
        });

        // グリッド（三分割）
        overlayCtx.strokeStyle = 'rgba(255,255,255,0.5)';
        overlayCtx.lineWidth   = 1;
        overlayCtx.setLineDash([4, 4]);
        const t3w = fw / 3;
        const t3h = fh / 3;
        for (let i = 1; i < 3; i++) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(fx + t3w*i, fy);
            overlayCtx.lineTo(fx + t3w*i, fy + fh);
            overlayCtx.stroke();
            overlayCtx.beginPath();
            overlayCtx.moveTo(fx, fy + t3h*i);
            overlayCtx.lineTo(fx + fw, fy + t3h*i);
            overlayCtx.stroke();
        }
        overlayCtx.setLineDash([]);
    }

    function renderPreview() {
        const prev = document.getElementById('crop-preview-canvas');
        if (!prev || !srcCanvas) return;
        const pc = prev.getContext('2d');
        pc.clearRect(0, 0, prev.width, prev.height);
        pc.fillStyle = '#ffffff';
        pc.fillRect(0, 0, prev.width, prev.height);
        pc.drawImage(srcCanvas, cropX, cropY, cropSize, cropSize, 0, 0, prev.width, prev.height);
    }

    function updateStatus() {
        if (!srcCanvas) return;
        setStatus('枠: (' + cropX + ', ' + cropY + ')  ' + cropSize + '×' + cropSize + 'px → ' + OUTPUT_SIZE + '×' + OUTPUT_SIZE + 'px');
    }

    function setStatus(msg) {
        const el = document.getElementById('crop-status-inline');
        if (el) el.textContent = msg;
    }

    // ── ドラッグ処理 ──────────────────────────────────────────────
    function overlayPos(e) {
        const rect = overlay.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    function onDragStart(e) {
        if (!srcCanvas) return;
        const { x, y } = overlayPos(e);
        const r = getMainCanvasRect();
        if (!r) return;
        const scaleX = r.w / srcCanvas.width;
        const scaleY = r.h / srcCanvas.height;

        // 枠の表示座標
        const fx = r.x + cropX * scaleX;
        const fy = r.y + cropY * scaleY;
        const fw = cropSize * scaleX;
        const fh = cropSize * scaleY;

        if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) {
            isDragging = true;
            dragOffX   = x - fx;
            dragOffY   = y - fy;
        }
    }

    function onDragMove(e) {
        if (!isDragging || !srcCanvas) return;
        const { x, y } = overlayPos(e);
        const r = getMainCanvasRect();
        if (!r) return;
        const scaleX = r.w / srcCanvas.width;
        const scaleY = r.h / srcCanvas.height;

        // 表示座標 → srcCanvas 座標
        let newX = Math.round((x - dragOffX) / scaleX);
        let newY = Math.round((y - dragOffY) / scaleY);

        // 境界クランプ
        newX = Math.max(0, Math.min(newX, srcCanvas.width  - cropSize));
        newY = Math.max(0, Math.min(newY, srcCanvas.height - cropSize));

        cropX = newX;
        cropY = newY;
        renderAll();
    }

    function onDragEnd() {
        isDragging = false;
    }

    // ── 確定処理 ──────────────────────────────────────────────────
    /**
     * クロップ確定処理（座標のみ保存、画像は保存しない）
     * 
     * 旧実装: クロップ画像を即座にR2保存 → ページリロード
     * 新実装: クロップ座標をEditorStateに保存 → プレビュー更新
     * 
     * 最終保存は「保存してダッシュボードへ」ボタンで一括実行される：
     * Step 1: マスク画像保存（optional）
     * Step 2: 調整値保存
     * Step 3: クロップ座標保存 ← ここで保存
     * Step 4: 最終画像（f画像）生成・保存 ← クロップが適用される
     */
    function confirmCrop() {
        const S = window.EditorState;
        if (!S || !srcCanvas) return;

        const btn = document.getElementById('crop-confirm');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>適用中...'; }

        // クロップ座標をEditorStateに保存
        S.cropX = cropX;
        S.cropY = cropY;
        S.cropSize = cropSize;
        S.cropEnabled = true;

        window.logger && window.logger.debug('✅ Crop coordinates saved:', { cropX, cropY, cropSize });

        // プレビュー更新（画像調整を適用してクロップ結果を表示）
        if (window.ImageAdjust && typeof window.ImageAdjust.applyAllAdjustments === 'function') {
            window.ImageAdjust.applyAllAdjustments();
        }

        setStatus('✅ クロップを適用しました');
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-check mr-2"></i>クロップ適用済み';
        }

        setTimeout(function() {
            stopCrop();
        }, 800);
    }

    // ── ボタンイベント登録（DOMContentLoaded 後） ─────────────────
    document.addEventListener('DOMContentLoaded', function() {
        const btnAutoCenter = document.getElementById('crop-auto-center');
        const btnConfirm    = document.getElementById('crop-confirm');
        const btnCancel     = document.getElementById('crop-cancel');

        if (btnAutoCenter) {
            btnAutoCenter.addEventListener('click', function() {
                resetToAutoCenter();
                renderAll();
            });
        }
        if (btnConfirm) {
            btnConfirm.addEventListener('click', confirmCrop);
        }
        if (btnCancel) {
            btnCancel.addEventListener('click', stopCrop);
        }

        // ウィンドウリサイズ時にオーバーレイを再描画
        window.addEventListener('resize', function() {
            if (active) renderAll();
        });
    });

    // ── 公開インターフェース ───────────────────────────────────────
    window.CropTool = {
        initCropOverlay: function() {
            window.logger && window.logger.debug('✅ [crop-tool] inline crop mode ready');
        },
        openSquareCropModal: startCrop,   // image-processing.js から呼ばれる
        onMouseDown: function() { return false; },
        onMouseMove: function() { return false; },
        onMouseUp:   function() { return false; },
        
        // クロップ座標を外部から取得（image-adjust.js で使用）
        get cropX()       { return cropX; },
        get cropY()       { return cropY; },
        get cropSize()    { return cropSize; },
        get cropEnabled() { 
            const S = window.EditorState;
            return S && S.cropEnabled; 
        },
    };

    window.logger && window.logger.debug('✅ [crop-tool] initialized (inline mode)');
})();

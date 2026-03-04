/**
 * crop-tool.js  ─  1000×1000 スクエアクロップ UI
 *
 * 機能:
 *   1. 切り抜きボタン押下 → モーダルを開く
 *   2. 元画像を読み込み、短辺基準で自動センタークロップ枠を配置
 *   3. ドラッグで枠を移動（正方形を保ちながら）
 *   4. リアルタイムプレビュー（200×200 縮小表示）
 *   5. 「確定して保存」→ canvas を 1000×1000 に再構成して R2 に保存
 *   6. 「自動センター」ボタンで枠をリセット
 *
 * 依存: editor-state.js (window.EditorState)
 */
(function () {
    'use strict';

    // ── 定数 ──────────────────────────────────────────────────────
    const OUTPUT_SIZE = 1000;   // 出力サイズ（px）

    // ── 状態 ──────────────────────────────────────────────────────
    let modal      = null;   // モーダル DOM
    let srcCanvas  = null;   // 元画像を描画したキャンバス
    let cropX      = 0;      // 枠の左上X（元画像座標）
    let cropY      = 0;      // 枠の左上Y（元画像座標）
    let cropSize   = 0;      // 枠のサイズ（px、正方形）

    let isDragging = false;
    let dragOffX   = 0;
    let dragOffY   = 0;

    // ── モーダルを開く ─────────────────────────────────────────────
    function openModal() {
        const S = window.EditorState;
        if (!S) return;

        // 元画像（オリジナル or 処理済）を srcCanvas にコピー
        srcCanvas        = document.createElement('canvas');
        srcCanvas.width  = S.canvas.width;
        srcCanvas.height = S.canvas.height;
        srcCanvas.getContext('2d').drawImage(S.canvas, 0, 0);

        // 自動センタークロップ計算
        resetToAutoCenter();

        // モーダル生成
        if (!modal) buildModal();
        modal.style.display = 'flex';
        renderAll();
    }

    // ── 自動センタークロップ計算 ───────────────────────────────────
    function resetToAutoCenter() {
        if (!srcCanvas) return;
        const w = srcCanvas.width;
        const h = srcCanvas.height;
        cropSize = Math.min(w, h);
        cropX    = Math.round((w - cropSize) / 2);
        cropY    = Math.round((h - cropSize) / 2);
    }

    // ── モーダル DOM を生成 ────────────────────────────────────────
    function buildModal() {
        modal = document.createElement('div');
        modal.id = 'square-crop-modal';
        modal.style.cssText = [
            'display:none',
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.7)',
            'z-index:9999',
            'align-items:center',
            'justify-content:center',
            'font-family:sans-serif',
        ].join(';');

        modal.innerHTML = `
<div style="background:#fff;border-radius:12px;padding:24px;max-width:860px;width:95vw;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h2 style="margin:0;font-size:18px;font-weight:700;color:#1f2937">
      <span style="color:#f97316">&#9632;</span> 1000×1000 クロップ
    </h2>
    <button id="crop-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280">✕</button>
  </div>

  <div style="display:flex;gap:20px;flex-wrap:wrap">
    <!-- 調整キャンバス -->
    <div style="flex:1;min-width:280px">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">ドラッグで枠を移動</div>
      <div id="crop-canvas-wrap" style="position:relative;display:inline-block;border:2px solid #e5e7eb;border-radius:8px;overflow:hidden;cursor:move;touch-action:none">
        <canvas id="crop-display-canvas"></canvas>
      </div>
    </div>

    <!-- プレビュー + ボタン -->
    <div style="width:220px;display:flex;flex-direction:column;gap:16px">
      <div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:6px">プレビュー (200×200)</div>
        <canvas id="crop-preview-canvas" width="200" height="200"
          style="border:2px solid #e5e7eb;border-radius:8px;background:#f9fafb"></canvas>
      </div>

      <button id="crop-auto-center"
        style="padding:10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#374151">
        &#x21ba; 自動センター
      </button>

      <button id="crop-confirm"
        style="padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
        &#x2713; 確定して保存
      </button>

      <button id="crop-cancel"
        style="padding:10px;background:none;border:1px solid #d1d5db;border-radius:8px;font-size:13px;cursor:pointer;color:#6b7280">
        キャンセル
      </button>
    </div>
  </div>

  <div id="crop-status" style="margin-top:12px;font-size:12px;color:#6b7280;text-align:center"></div>
</div>`;

        document.body.appendChild(modal);

        // イベント登録
        document.getElementById('crop-modal-close').addEventListener('click', closeModal);
        document.getElementById('crop-cancel').addEventListener('click', closeModal);
        document.getElementById('crop-auto-center').addEventListener('click', function () {
            resetToAutoCenter();
            renderAll();
        });
        document.getElementById('crop-confirm').addEventListener('click', confirmCrop);

        // ドラッグイベント
        const dispCanvas = document.getElementById('crop-display-canvas');
        dispCanvas.addEventListener('mousedown',  onDragStart);
        dispCanvas.addEventListener('mousemove',  onDragMove);
        dispCanvas.addEventListener('mouseup',    onDragEnd);
        dispCanvas.addEventListener('mouseleave', onDragEnd);
        // タッチ対応
        dispCanvas.addEventListener('touchstart', function(e){ e.preventDefault(); onDragStart(e.touches[0]); }, { passive: false });
        dispCanvas.addEventListener('touchmove',  function(e){ e.preventDefault(); onDragMove(e.touches[0]);  }, { passive: false });
        dispCanvas.addEventListener('touchend',   onDragEnd);
    }

    // ── モーダルを閉じる ───────────────────────────────────────────
    function closeModal() {
        if (modal) modal.style.display = 'none';
    }

    // ── 描画 ──────────────────────────────────────────────────────
    // 表示キャンバスのスケール（元画像 → 表示用）
    function getDisplayScale() {
        if (!srcCanvas) return 1;
        const maxW = Math.min(500, window.innerWidth * 0.5);
        return maxW / srcCanvas.width;
    }

    function renderAll() {
        renderDisplay();
        renderPreview();
        updateStatus();
    }

    function renderDisplay() {
        const dispCanvas = document.getElementById('crop-display-canvas');
        if (!dispCanvas || !srcCanvas) return;

        const scale = getDisplayScale();
        const dw    = Math.round(srcCanvas.width  * scale);
        const dh    = Math.round(srcCanvas.height * scale);

        dispCanvas.width  = dw;
        dispCanvas.height = dh;
        dispCanvas.style.width  = dw + 'px';
        dispCanvas.style.height = dh + 'px';

        const dc = dispCanvas.getContext('2d');

        // 元画像を描画
        dc.drawImage(srcCanvas, 0, 0, dw, dh);

        // 枠外を半透明で覆う
        const fx = Math.round(cropX * scale);
        const fy = Math.round(cropY * scale);
        const fs = Math.round(cropSize * scale);

        dc.fillStyle = 'rgba(0,0,0,0.5)';
        dc.fillRect(0, 0, dw, dh);
        dc.clearRect(fx, fy, fs, fs);

        // 元画像を枠内だけ再描画（くっきり表示）
        dc.drawImage(srcCanvas, cropX, cropY, cropSize, cropSize, fx, fy, fs, fs);

        // 枠の線
        dc.strokeStyle = '#f97316';
        dc.lineWidth   = 2.5;
        dc.setLineDash([]);
        dc.strokeRect(fx, fy, fs, fs);

        // 四隅ハンドル
        dc.fillStyle = '#f97316';
        [[fx, fy], [fx + fs, fy], [fx, fy + fs], [fx + fs, fy + fs]].forEach(([cx, cy]) => {
            dc.fillRect(cx - 5, cy - 5, 10, 10);
        });

        // グリッド（三分割）
        dc.strokeStyle = 'rgba(255,255,255,0.5)';
        dc.lineWidth   = 1;
        dc.setLineDash([3, 3]);
        const t3 = fs / 3;
        for (let i = 1; i < 3; i++) {
            dc.beginPath(); dc.moveTo(fx + t3*i, fy); dc.lineTo(fx + t3*i, fy + fs); dc.stroke();
            dc.beginPath(); dc.moveTo(fx, fy + t3*i); dc.lineTo(fx + fs, fy + t3*i); dc.stroke();
        }
        dc.setLineDash([]);
    }

    function renderPreview() {
        const prev = document.getElementById('crop-preview-canvas');
        if (!prev || !srcCanvas) return;
        const pc = prev.getContext('2d');
        pc.clearRect(0, 0, 200, 200);
        pc.fillStyle = '#ffffff';
        pc.fillRect(0, 0, 200, 200);
        pc.drawImage(srcCanvas, cropX, cropY, cropSize, cropSize, 0, 0, 200, 200);
    }

    function updateStatus() {
        const el = document.getElementById('crop-status');
        if (!el || !srcCanvas) return;
        el.textContent = `枠: (${cropX}, ${cropY})  サイズ: ${cropSize}×${cropSize}px  →  出力: ${OUTPUT_SIZE}×${OUTPUT_SIZE}px`;
    }

    // ── ドラッグ処理 ──────────────────────────────────────────────
    function canvasPos(e) {
        const dispCanvas = document.getElementById('crop-display-canvas');
        const rect       = dispCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left),
            y: (e.clientY - rect.top),
        };
    }

    function onDragStart(e) {
        const { x, y } = canvasPos(e);
        const scale     = getDisplayScale();
        const fx = cropX * scale;
        const fy = cropY * scale;
        const fs = cropSize * scale;

        // 枠内クリックのみドラッグ開始
        if (x >= fx && x <= fx + fs && y >= fy && y <= fy + fs) {
            isDragging = true;
            dragOffX   = x - fx;
            dragOffY   = y - fy;
        }
    }

    function onDragMove(e) {
        if (!isDragging || !srcCanvas) return;
        const { x, y } = canvasPos(e);
        const scale     = getDisplayScale();

        let newX = Math.round((x - dragOffX) / scale);
        let newY = Math.round((y - dragOffY) / scale);

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

    // ── 確定処理：canvas を 1000×1000 に再構成 → R2 保存 ────────
    function confirmCrop() {
        const S = window.EditorState;
        if (!S || !srcCanvas) return;

        const btn = document.getElementById('crop-confirm');
        const status = document.getElementById('crop-status');
        btn.disabled    = true;
        btn.textContent = '保存中...';

        // 1000×1000 に描画
        const out    = document.createElement('canvas');
        out.width    = OUTPUT_SIZE;
        out.height   = OUTPUT_SIZE;
        const outCtx = out.getContext('2d');
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        outCtx.drawImage(srcCanvas, cropX, cropY, cropSize, cropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        const dataUrl = out.toDataURL('image/png');

        // editor-state から SKU / filenamePart を取得
        const sku          = S.sku;
        const filenamePart = S.filenamePart;

        if (!sku || !filenamePart) {
            alert('SKU / ファイル情報が取得できません');
            btn.disabled    = false;
            btn.textContent = '✓ 確定して保存';
            return;
        }

        status.textContent = 'R2 に保存中...';

        window.authenticatedFetch('/api/upload-processed-image/' + sku, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                imageDataUrl: dataUrl,
                filenamePart: filenamePart,
            }),
        })
        .then(function (res) {
            if (!res.ok) return res.json().then(function(e){ throw new Error(e.error || 'Upload failed'); });
            return res.json();
        })
        .then(function (data) {
            status.textContent = '✅ 保存完了！';
            window.logger && window.logger.debug('✅ Crop saved:', data.processedUrl);

            // エディタの main-canvas も更新
            S.canvas.width  = OUTPUT_SIZE;
            S.canvas.height = OUTPUT_SIZE;
            S.ctx.drawImage(out, 0, 0);
            S.originalImage = S.ctx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

            setTimeout(function () {
                closeModal();
                // ページリロードで最新画像を反映
                window.location.reload();
            }, 800);
        })
        .catch(function (err) {
            status.textContent = '❌ エラー: ' + err.message;
            btn.disabled    = false;
            btn.textContent = '✓ 確定して保存';
            window.logger && window.logger.error('❌ Crop save error:', err);
        });
    }

    // ── 公開インターフェース ───────────────────────────────────────
    window.CropTool = {
        /** image-processing.js の initCropOverlay() 互換（旧API維持） */
        initCropOverlay: function () {
            window.logger && window.logger.debug('✅ [crop-tool] Square crop mode ready');
        },

        /** 切り抜きボタンから呼び出す */
        openSquareCropModal: openModal,

        // 旧マウスイベントAPI（image-processing.jsとの互換、実際は使わない）
        onMouseDown: function () { return false; },
        onMouseMove: function () { return false; },
        onMouseUp:   function () { return false; },
    };

    window.logger && window.logger.debug('✅ [crop-tool] initialized (square crop mode)');
})();

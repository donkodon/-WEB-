/**
 * image-processing.js  ─  エントリーポイント
 *
 * 読み込み順（editor.tsx 側で保証すること）:
 *   1. editor-state.js   ← window.EditorState を定義
 *   2. image-adjust.js   ← window.ImageAdjust  を定義
 *   3. mask-tools.js     ← window.MaskTools     を定義
 *   4. crop-tool.js      ← window.CropTool      を定義
 *   5. image-processing.js（このファイル）
 *
 * このファイルの責務:
 *   ・メイン画像のロード
 *   ・描画イベントの統合ディスパッチ
 *   ・ツール選択ボタンの UI
 *   ・各サブモジュールの setup() 呼び出し
 */
document.addEventListener('DOMContentLoaded', function () {
    'use strict';
    
    const S = window.EditorState;
    if (!S) {
        console.error('❌ [image-processing] EditorState not found. Check script load order.');
        return;
    }

    const { canvas, ctx, img, maskCanvas, maskCtx } = S;

    // ────────────────────────────────────────────────────────────────
    // 1. メイン画像のロード
    // ────────────────────────────────────────────────────────────────
    // 初回のみ実行される onload ハンドラ
    // ※ img.onload はこの1回限りで削除する。
    //   switchToOriginalForMask / switchToProcessedImage は
    //   img を経由せず独自の Image オブジェクトで描画するため
    //   img.onload が再発火して originalImage を上書きすることはない。
    function onInitialImageLoad() {
        // 1回限りの onload なので即削除
        img.onload  = null;
        img.onerror = null;

        // キャンバスサイズを画像に合わせる
        canvas.width      = img.naturalWidth  || img.width;
        canvas.height     = img.naturalHeight || img.height;
        maskCanvas.width  = canvas.width;
        maskCanvas.height = canvas.height;

        ctx.drawImage(img, 0, 0);

        // ★ 画像サイズバリデーション（最小サイズ: 短辺500px以上）
        const ABSOLUTE_MIN_SIZE = 500;
        if (canvas.width < ABSOLUTE_MIN_SIZE || canvas.height < ABSOLUTE_MIN_SIZE) {
            alert(`画像サイズが小さすぎます。\n両辺とも${ABSOLUTE_MIN_SIZE}px以上の画像をアップロードしてください。\n\n現在のサイズ: ${canvas.width}×${canvas.height}`);
            window.location.href = '/dashboard';
            return;
        }

        // ★ 自動リサイズ: 短辺が1000px未満の場合、アスペクト比を保ったまま拡大
        const MIN_CROP_SIZE = 1000;
        const shortSide = Math.min(canvas.width, canvas.height);
        
        if (shortSide < MIN_CROP_SIZE) {
            const scale = MIN_CROP_SIZE / shortSide;
            const newWidth = Math.round(canvas.width * scale);
            const newHeight = Math.round(canvas.height * scale);
            
            window.logger && window.logger.info(`📐 [image-processing] Auto-resizing image: ${canvas.width}×${canvas.height} → ${newWidth}×${newHeight} (scale: ${scale.toFixed(3)})`);
            
            // 一時canvasでリサイズ
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = newWidth;
            tempCanvas.height = newHeight;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            
            // 高品質リサイズ（imageSmoothingEnabled はデフォルトtrue）
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(img, 0, 0, newWidth, newHeight);
            
            // メインcanvasのサイズを変更
            canvas.width = newWidth;
            canvas.height = newHeight;
            maskCanvas.width = newWidth;
            maskCanvas.height = newHeight;
            
            // リサイズ後の画像をメインcanvasに描画
            ctx.drawImage(tempCanvas, 0, 0);
            
            window.logger && window.logger.info(`✅ [image-processing] Resize complete: ${newWidth}×${newHeight}`);
        }

        // originalImage キャッシュを保存（リサイズ後の画像）
        S.originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // ★ クロップ座標のデフォルト値設定（未設定の場合は中央配置）
        const CROP_SIZE = 1000;
        if (S.cropX === null || S.cropY === null || S.cropSize === null) {
            S.cropX = Math.floor((canvas.width - CROP_SIZE) / 2);
            S.cropY = Math.floor((canvas.height - CROP_SIZE) / 2);
            S.cropSize = CROP_SIZE;
            S.cropEnabled = true;  // デフォルトで有効
            window.logger && window.logger.debug(`✅ [image-processing] Crop initialized to center: cropX=${S.cropX}, cropY=${S.cropY}, cropSize=${S.cropSize}`);
        } else {
            window.logger && window.logger.debug(`✅ [image-processing] Crop loaded from DB: cropX=${S.cropX}, cropY=${S.cropY}, cropSize=${S.cropSize}`);
        }

        // ★ クロップ枠オーバーレイを初期化して表示
        if (window.CropOverlay) {
            window.CropOverlay.init();
            window.CropOverlay.update();
            window.logger && window.logger.debug('✅ [image-processing] Crop overlay displayed');
        }

        // マスク画像をロード、または空マスクを生成
        if (S.maskImageUrl) {
            // マスクロード（loadMaskImage内で自動的にapplyAllAdjustmentsが呼ばれる）
            window.MaskTools && window.MaskTools.loadMaskImage();
        } else {
            const blankMask = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
            for (let i = 0; i < blankMask.data.length; i += 4) {
                blankMask.data[i]     = 0;
                blankMask.data[i + 1] = 0;
                blankMask.data[i + 2] = 0;
                blankMask.data[i + 3] = 255;
            }
            maskCtx.putImageData(blankMask, 0, 0);
            S.maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            window.MaskTools && window.MaskTools.saveMaskHistory();
        }
    }

    img.onload  = onInitialImageLoad;
    img.onerror = function () {
        console.error('❌ Failed to load initial image:', S.originalSrc);
    };
    img.src = S.originalSrc;

    // ────────────────────────────────────────────────────────────────
    // 2. 描画イベント（mousedown / mousemove / mouseup / mouseout）
    // ────────────────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('mouseout',  onMouseUp);

    function onMouseDown(e) {
        if (!S.currentTool) return;
        S.isDrawing = true;

        const rect = canvas.getBoundingClientRect();
        S.lastX = (e.clientX - rect.left) * (canvas.width  / rect.width);
        S.lastY = (e.clientY - rect.top)  * (canvas.height / rect.height);

        // クロップ開始
        if (window.CropTool) window.CropTool.onMouseDown(e);
    }

    function onMouseMove(e) {
        if (!S.isDrawing || !S.currentTool) return;

        // クロップ中は枠を更新するだけ
        if (S.currentTool === 'crop') {
            window.CropTool && window.CropTool.onMouseMove(e);
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x    = (e.clientX - rect.left) * (canvas.width  / rect.width);
        const y    = (e.clientY - rect.top)  * (canvas.height / rect.height);

        if (S.currentTool === 'mask-brush' || S.currentTool === 'mask-eraser') {
            window.MaskTools && window.MaskTools.drawMask(S.lastX, S.lastY, x, y);
        } else {
            drawOnCanvas(S.lastX, S.lastY, x, y);
        }

        S.lastX = x;
        S.lastY = y;
    }

    function onMouseUp(e) {
        if (!S.isDrawing) return;
        S.isDrawing = false;

        // クロップ確定
        if (S.currentTool === 'crop') {
            window.CropTool && window.CropTool.onMouseUp(e);
            return;
        }

        // マスクツール: ストローク完了時にヒストリ保存 + maskImageData 同期
        if (S.currentTool === 'mask-brush' || S.currentTool === 'mask-eraser') {
            window.MaskTools && window.MaskTools.saveMaskHistory();
            S.maskImageData = S.maskCtx.getImageData(0, 0, S.maskCanvas.width, S.maskCanvas.height);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 3. 手動修正ツール（ブラシ / 消しゴム）の描画
    // ────────────────────────────────────────────────────────────────
    function drawOnCanvas(x1, y1, x2, y2) {
        ctx.lineCap   = 'round';
        ctx.lineJoin  = 'round';
        ctx.lineWidth = S.brushSize;

        if (S.currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#000000';
        } else if (S.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // 合成モードをリセット
        ctx.globalCompositeOperation = 'source-over';
    }

    // ────────────────────────────────────────────────────────────────
    // 4. ツール選択ボタン UI
    // ────────────────────────────────────────────────────────────────
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('border-blue-500', 'bg-blue-50'));
            btn.classList.add('border-blue-500', 'bg-blue-50');
        });
    });

    const btnCrop   = document.getElementById('btn-crop');
    const btnBrush  = document.getElementById('btn-brush');
    const btnEraser = document.getElementById('btn-eraser');

    if (btnCrop) {
        btnCrop.addEventListener('click', () => {
            // スクエアクロップモーダルを開く（1000×1000）
            if (window.CropTool && typeof window.CropTool.openSquareCropModal === 'function') {
                window.CropTool.openSquareCropModal();
            } else {
                alert('クロップ機能が読み込まれていません。ページをリロードしてください。');
            }
        });
    }
    if (btnBrush) {
        btnBrush.addEventListener('click', () => {
            S.currentTool       = 'brush';
            S.maskMode          = false;
            canvas.style.cursor = 'default';
        });
    }
    if (btnEraser) {
        btnEraser.addEventListener('click', () => {
            S.currentTool       = 'eraser';
            S.maskMode          = false;
            canvas.style.cursor = 'default';
        });
    }

    // ────────────────────────────────────────────────────────────────
    // 5. サブモジュールの setup() を呼び出す
    // ────────────────────────────────────────────────────────────────
    window.CropTool   && window.CropTool.initCropOverlay();
    window.ImageAdjust && window.ImageAdjust.setup();
    window.MaskTools   && window.MaskTools.setup();
});

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
        window.logger && window.logger.error('❌ [image-processing] EditorState not found. Check script load order.');
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
        window.logger && window.logger.info('✅ [image-processing] Image loaded (initial):', canvas.width, 'x', canvas.height);

        // originalImage キャッシュを保存（調整・切り替えのベース）
        S.originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        window.logger && window.logger.debug('✅ originalImage cached');

        // マスク画像をロード、または空マスクを生成
        window.logger && window.logger.debug('🎭 maskImageUrl:', S.maskImageUrl);
        if (S.maskImageUrl) {
            window.logger && window.logger.info('🎭 Loading mask image...');
            // マスクロード（loadMaskImage内で自動的にapplyMaskToCanvasが呼ばれる）
            window.MaskTools && window.MaskTools.loadMaskImage();
        } else {
            window.logger && window.logger.info('⚠️ No mask URL, creating blank mask');
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
            window.logger && window.logger.debug('✅ Blank mask initialized (no mask URL)');
        }
    }

    img.onload  = onInitialImageLoad;
    img.onerror = function () {
        window.logger && window.logger.error('❌ Failed to load initial image:', S.originalSrc);
    };
    // 🎨 修正: 常にオリジナル画像を読み込む（マスクとJSON調整を後で適用）
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
            window.logger && window.logger.debug('💾 Stroke done: history saved');
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

    window.logger && window.logger.debug('✅ [image-processing] initialized');
});

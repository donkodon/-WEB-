/**
 * editor-state.js
 * 画像エディタの共有状態・初期化
 * 他モジュールは window.EditorState を通じてアクセスする
 */
(function () {
    'use strict';

    // ── DOM から設定値を取得 ──────────────────────────────────────────
    const editorData = document.getElementById('editor-data');
    if (!editorData) {
        window.logger && window.logger.error('❌ [editor-state] editor-data not found');
        return;
    }

    let processedSrc    = editorData.dataset.imageSrc;   // saveMask後に更新可能
    const originalSrc   = editorData.dataset.originalSrc;
    const isProcessed   = editorData.dataset.isProcessed === 'true';
    const imageId       = editorData.dataset.imageId;
    const maskImageUrl  = editorData.dataset.maskImageUrl || '';

    // SKU / filenamePart を imageId から抽出
    const parts       = imageId.replace('r2_', '').split('_');
    const sku         = parts[0];
    const filenamePart = parts.slice(1).join('_');

    window.logger && window.logger.debug('EditorState initialized:', { sku, filenamePart });

    // ── メインキャンバス ─────────────────────────────────────────────
    const canvas = document.getElementById('main-canvas');
    const ctx    = canvas.getContext('2d', { willReadFrequently: true });

    // メイン表示用 Image オブジェクト
    const img        = new Image();
    img.crossOrigin  = 'anonymous';

    // ── マスクキャンバス ─────────────────────────────────────────────
    const maskCanvas = document.createElement('canvas');
    const maskCtx   = maskCanvas.getContext('2d', { willReadFrequently: true });

    // ── 共有状態変数 ─────────────────────────────────────────────────
    let showingOriginal = false; // 現在オリジナル画像を表示中か
    let maskVisible     = false; // マスクオーバーレイ表示中か
    let maskMode        = false; // マスク編集モード中か

    // マスクデータ
    let maskImageData = null;    // ImageData（保存・オーバーレイ用）
    let maskImage     = null;    // HTMLImageElement

    // 調整値（DBから初期値を読み込む）
    let brightness = parseInt(editorData.dataset.brightness || '0', 10);
    let wb         = parseInt(editorData.dataset.whiteBalance || '5500', 10);
    let hue        = parseInt(editorData.dataset.hue || '0', 10);

    // ブラシサイズ
    let brushSize     = 24;
    let maskBrushSize = 20;

    // 描画状態
    let isDrawing   = false;
    let currentTool = null; // 'brush' | 'eraser' | 'crop' | 'mask-brush' | 'mask-eraser'
    let lastX       = 0;
    let lastY       = 0;

    // originalImage キャッシュ（常にオリジナル画像のImageData。上書きしない）
    let originalImage = null;

    // originalForMask キャッシュ（マスクタブで使うオリジナル画像の ImageData）
    // switchToOriginalForMask でセット。drawMask / applyMaskOverlay の再描画に使用。
    let originalForMask = null;

    // adjustedImage キャッシュ（saveMask後の合成済み画像 ImageData）
    // adjustタブでの再描画ベースとして使用。saveMaskのStep3でセット。
    let adjustedImage = null;

    // 最終保存まで保留するデータ（マスク保存時にセット、保存してダッシュボードへで使用）
    let pendingMaskDataUrl      = null; // マスク画像 base64 PNG
    let pendingCompositeDataUrl = null; // p画像（背景削除合成）base64 PNG

    // ── 公開インターフェース ─────────────────────────────────────────
    window.EditorState = {
        // DOM
        get canvas()     { return canvas; },
        get ctx()        { return ctx; },
        get img()        { return img; },
        get maskCanvas() { return maskCanvas; },
        get maskCtx()    { return maskCtx; },

        // 設定値
        get processedSrc()      { return processedSrc; },
        set processedSrc(v)     { processedSrc = v; },  // saveMask後に更新可能
        get originalSrc()       { return originalSrc; },
        get isProcessed()   { return isProcessed; },
        get imageId()       { return imageId; },
        get maskImageUrl()  { return maskImageUrl; },
        get sku()           { return sku; },
        get filenamePart()  { return filenamePart; },

        // フラグ（読み書き）
        get showingOriginal()           { return showingOriginal; },
        set showingOriginal(v)          { showingOriginal = v; },
        get maskVisible()               { return maskVisible; },
        set maskVisible(v)              { maskVisible = v; },
        get maskMode()                  { return maskMode; },
        set maskMode(v)                 { maskMode = v; },

        // マスクデータ（読み書き）
        get maskImageData()             { return maskImageData; },
        set maskImageData(v)            { maskImageData = v; },
        get maskImage()                 { return maskImage; },
        set maskImage(v)                { maskImage = v; },

        // 調整値（読み書き）
        get brightness()                { return brightness; },
        set brightness(v)               { brightness = v; },
        get wb()                        { return wb; },
        set wb(v)                       { wb = v; },
        get hue()                       { return hue; },
        set hue(v)                      { hue = v; },

        // ブラシサイズ（読み書き）
        get brushSize()                 { return brushSize; },
        set brushSize(v)                { brushSize = v; },
        get maskBrushSize()             { return maskBrushSize; },
        set maskBrushSize(v)            { maskBrushSize = v; },

        // 描画状態（読み書き）
        get isDrawing()                 { return isDrawing; },
        set isDrawing(v)                { isDrawing = v; },
        get currentTool()               { return currentTool; },
        set currentTool(v)              { currentTool = v; },
        get lastX()                     { return lastX; },
        set lastX(v)                    { lastX = v; },
        get lastY()                     { return lastY; },
        set lastY(v)                    { lastY = v; },

        // originalImage キャッシュ（常にオリジナル画像・読み書き）
        get originalImage()             { return originalImage; },
        set originalImage(v)            { originalImage = v; },

        // originalForMask キャッシュ（マスクタブ用・読み書き）
        get originalForMask()           { return originalForMask; },
        set originalForMask(v)          { originalForMask = v; },

        // adjustedImage キャッシュ（saveMask後の合成済み画像・読み書き）
        get adjustedImage()             { return adjustedImage; },
        set adjustedImage(v)            { adjustedImage = v; },

        // 保留中データ（マスク保存時にセット → 最終保存時にR2へ）
        get pendingMaskDataUrl()             { return pendingMaskDataUrl; },
        set pendingMaskDataUrl(v)            { pendingMaskDataUrl = v; },
        get pendingCompositeDataUrl()        { return pendingCompositeDataUrl; },
        set pendingCompositeDataUrl(v)       { pendingCompositeDataUrl = v; },

        /**
         * processedSrc を新しい URL に差し替える
         * （saveMask 後に合成画像 URL に切り替える際に使用）
         * ※ img.src は変更しない（image-processing.js の img.onload が
         *    originalImage を上書きするのを防ぐため）
         */
        updateProcessedSrc(newUrl) {
            processedSrc    = newUrl;   // クロージャ変数を直接更新（setter経由でも可）
            showingOriginal = false;
        }
    };

    window.logger && window.logger.debug('✅ [editor-state] initialized');
})();

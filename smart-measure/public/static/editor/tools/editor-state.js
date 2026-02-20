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

    const processedSrc  = editorData.dataset.imageSrc;
    const originalSrc   = editorData.dataset.originalSrc;
    const isProcessed   = editorData.dataset.isProcessed === 'true';
    const imageId       = editorData.dataset.imageId;
    const maskImageUrl  = editorData.dataset.maskImageUrl || '';

    // SKU / filenamePart を imageId から抽出
    const parts       = imageId.replace('r2_', '').split('_');
    const sku         = parts[0];
    const filenamePart = parts.slice(1).join('_');

    window.logger && window.logger.debug('🎨 EditorState init | SKU:', sku, '| file:', filenamePart);

    // ── メインキャンバス ─────────────────────────────────────────────
    const canvas = document.getElementById('main-canvas');
    const ctx    = canvas.getContext('2d');

    // メイン表示用 Image オブジェクト
    const img        = new Image();
    img.crossOrigin  = 'anonymous';

    // ── マスクキャンバス ─────────────────────────────────────────────
    const maskCanvas = document.createElement('canvas');
    const maskCtx   = maskCanvas.getContext('2d');

    // ── 共有状態変数 ─────────────────────────────────────────────────
    let showingOriginal = false; // 現在オリジナル画像を表示中か
    let maskVisible     = false; // マスクオーバーレイ表示中か
    let maskMode        = false; // マスク編集モード中か

    // マスクデータ
    let maskImageData = null;    // ImageData（保存・オーバーレイ用）
    let maskImage     = null;    // HTMLImageElement

    // 調整値
    let brightness = 0;
    let wb         = 5500;
    let hue        = 0;

    // ブラシサイズ
    let brushSize     = 24;
    let maskBrushSize = 20;

    // 描画状態
    let isDrawing   = false;
    let currentTool = null; // 'brush' | 'eraser' | 'crop' | 'mask-brush' | 'mask-eraser'
    let lastX       = 0;
    let lastY       = 0;

    // originalImage キャッシュ（調整の基準となる ImageData）
    let originalImage = null;

    // ── 公開インターフェース ─────────────────────────────────────────
    window.EditorState = {
        // DOM
        get canvas()     { return canvas; },
        get ctx()        { return ctx; },
        get img()        { return img; },
        get maskCanvas() { return maskCanvas; },
        get maskCtx()    { return maskCtx; },

        // 設定値（読み取り専用）
        get processedSrc()  { return processedSrc; },
        get originalSrc()   { return originalSrc; },
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

        // originalImage キャッシュ（読み書き）
        get originalImage()             { return originalImage; },
        set originalImage(v)            { originalImage = v; },

        /**
         * processedSrc を新しい URL に差し替える
         * （saveMask 後に合成画像 URL に切り替える際に使用）
         */
        updateProcessedSrc(newUrl) {
            // クロージャ変数は変えられないため img.src を直接更新し
            // 参照先 URL を変えたとみなす代替手段
            img.src = newUrl;
            showingOriginal = false;
        }
    };

    window.logger && window.logger.debug('✅ [editor-state] initialized');
})();

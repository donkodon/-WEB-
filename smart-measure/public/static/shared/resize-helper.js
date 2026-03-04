/**
 * Resize and center image using Canvas API
 * Detects product bounding box from alpha channel and centers it in a square canvas
 * with product:margin ratio of 85:15 (product occupies 85% of canvas)
 *
 * @param {string} imageDataUrl - Base64 data URL of the image (transparent PNG)
 * @param {number} targetWidth  - Target canvas width  (default: 1200)
 * @param {number} targetHeight - Target canvas height (default: 1200)
 * @returns {Promise<string>}   - Centered and resized image as base64 data URL
 */
window.resizeAndCenterImage = async function(imageDataUrl, targetWidth = 1200, targetHeight = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = function() {
            try {
                const imgW = img.width;
                const imgH = img.height;

                // ── Step 1: Draw source image to a temporary canvas to read pixels ──
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width  = imgW;
                srcCanvas.height = imgH;
                const srcCtx = srcCanvas.getContext('2d');
                srcCtx.drawImage(img, 0, 0);

                let imageData;
                try {
                    imageData = srcCtx.getImageData(0, 0, imgW, imgH);
                } catch (secErr) {
                    // CORS taint: cannot read pixels → fallback to full-image centering
                    console.warn('[resize-helper] getImageData blocked (CORS taint), using full image:', secErr.message);
                    _drawFullImageCentered(srcCanvas, imgW, imgH, targetWidth, targetHeight, resolve);
                    return;
                }

                const { data } = imageData;
                const W = imgW;
                const H = imgH;

                // ── Step 2: Detect bounding box of non-transparent pixels (alpha > 10) ──
                // threshold=10 to ignore near-invisible edge pixels from antialiasing
                let minX = W, minY = H, maxX = 0, maxY = 0;
                let hasContent = false;
                const ALPHA_THRESHOLD = 10;

                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const alpha = data[(y * W + x) * 4 + 3];
                        if (alpha > ALPHA_THRESHOLD) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            hasContent = true;
                        }
                    }
                }

                console.log('[resize-helper] img size:', imgW, 'x', imgH,
                    '| hasContent:', hasContent,
                    '| bbox:', minX, minY, '-', maxX, maxY);

                // Fallback: if no transparent pixels detected (e.g. JPEG input), use full image
                if (!hasContent) {
                    console.warn('[resize-helper] ⚠️ No transparent pixels found (alpha all ≤ ' + ALPHA_THRESHOLD + '). Input may be JPEG/opaque. Falling back to full-image centering.');
                    _drawFullImageCentered(srcCanvas, imgW, imgH, targetWidth, targetHeight, resolve);
                    return;
                }

                // Check if bbox covers nearly the entire image (>95%) → likely opaque fallback needed
                const bboxCoverage = ((maxX - minX) * (maxY - minY)) / (W * H);
                if (bboxCoverage > 0.95) {
                    console.warn('[resize-helper] ⚠️ BBox covers ' + (bboxCoverage * 100).toFixed(1) + '% of image — likely opaque/no-alpha. Centering anyway.');
                }

                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;

                // ── Step 3: Calculate target size for product (85% of canvas) ──
                const PRODUCT_RATIO = 0.85;
                const productMaxSize = Math.min(targetWidth, targetHeight) * PRODUCT_RATIO;

                const scaleToFit = Math.min(productMaxSize / cropW, productMaxSize / cropH);
                const scaledW = Math.round(cropW * scaleToFit);
                const scaledH = Math.round(cropH * scaleToFit);

                const offsetX = Math.round((targetWidth  - scaledW) / 2);
                const offsetY = Math.round((targetHeight - scaledH) / 2);

                console.log('[resize-helper] crop:', cropW, 'x', cropH,
                    '| scale:', scaleToFit.toFixed(3),
                    '| scaled:', scaledW, 'x', scaledH,
                    '| offset:', offsetX, offsetY);

                // ── Step 4: Draw to output canvas ──
                const outCanvas = document.createElement('canvas');
                outCanvas.width  = targetWidth;
                outCanvas.height = targetHeight;
                const outCtx = outCanvas.getContext('2d');

                outCtx.fillStyle = 'white';
                outCtx.fillRect(0, 0, targetWidth, targetHeight);

                outCtx.drawImage(
                    srcCanvas,
                    minX, minY, cropW, cropH,
                    offsetX, offsetY, scaledW, scaledH
                );

                const resizedDataUrl = outCanvas.toDataURL('image/png');
                console.log('[resize-helper] ✅ Done:', targetWidth + 'x' + targetHeight,
                    'product at (' + offsetX + ',' + offsetY + ') size ' + scaledW + 'x' + scaledH);

                resolve(resizedDataUrl);
            } catch (error) {
                console.error('[resize-helper] ❌ Error:', error);
                window.logger && window.logger.error('❌ Error resizing image:', error);
                reject(error);
            }
        };

        img.onerror = function(error) {
            console.error('[resize-helper] ❌ Image load error:', error);
            window.logger && window.logger.error('❌ Error loading image:', error);
            reject(new Error('Failed to load image'));
        };

        img.src = imageDataUrl;
    });
};

/**
 * Fallback: scale full image to fit 85% of canvas, centered
 */
function _drawFullImageCentered(srcCanvas, imgW, imgH, targetWidth, targetHeight, resolve) {
    const PRODUCT_RATIO = 0.85;
    const productMaxSize = Math.min(targetWidth, targetHeight) * PRODUCT_RATIO;
    const scale = Math.min(productMaxSize / imgW, productMaxSize / imgH);
    const scaledW = Math.round(imgW * scale);
    const scaledH = Math.round(imgH * scale);
    const offsetX = Math.round((targetWidth  - scaledW) / 2);
    const offsetY = Math.round((targetHeight - scaledH) / 2);

    const outCanvas = document.createElement('canvas');
    outCanvas.width  = targetWidth;
    outCanvas.height = targetHeight;
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = 'white';
    outCtx.fillRect(0, 0, targetWidth, targetHeight);
    outCtx.drawImage(srcCanvas, 0, 0, imgW, imgH, offsetX, offsetY, scaledW, scaledH);

    console.log('[resize-helper] fallback full-image:', scaledW + 'x' + scaledH, 'at (' + offsetX + ',' + offsetY + ')');
    resolve(outCanvas.toDataURL('image/png'));
}

window.logger && window.logger.debug('📐 Resize helper loaded (bounding-box centering, product:margin=85:15)');
console.log('[resize-helper] loaded');

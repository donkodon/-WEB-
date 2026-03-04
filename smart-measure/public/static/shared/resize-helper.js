/**
 * Resize and center image using Canvas API
 * Detects product bounding box from alpha channel and centers it in a square canvas
 * with product:margin ratio of 85:15 (product occupies 85% of canvas)
 *
 * @param {string} imageDataUrl - Base64 data URL of the image (transparent PNG)
 * @param {number} targetWidth  - Target canvas width  (default: 1200)
 * @param {number} targetHeight - Target canvas height (default: 1200)
 * @returns {Promise<string>}   - Centered and resized image as base64 PNG data URL
 */
window.resizeAndCenterImage = async function(imageDataUrl, targetWidth = 1200, targetHeight = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = function() {
            try {
                const imgW = img.width;
                const imgH = img.height;

                // ── Step 1: Draw to temp canvas to read pixel data ──
                // For large images, cap working canvas size to avoid slow pixel scanning
                const MAX_WORK_SIZE = 1600;
                let workW = imgW, workH = imgH;
                if (imgW > MAX_WORK_SIZE || imgH > MAX_WORK_SIZE) {
                    const ratio = Math.min(MAX_WORK_SIZE / imgW, MAX_WORK_SIZE / imgH);
                    workW = Math.round(imgW * ratio);
                    workH = Math.round(imgH * ratio);
                }

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width  = workW;
                srcCanvas.height = workH;
                const srcCtx = srcCanvas.getContext('2d');
                srcCtx.drawImage(img, 0, 0, workW, workH);

                let imageData;
                try {
                    imageData = srcCtx.getImageData(0, 0, workW, workH);
                } catch (secErr) {
                    // CORS taint: fallback to full-image centering
                    _centerFull(srcCanvas, workW, workH, targetWidth, targetHeight, resolve);
                    return;
                }

                // ── Step 2: Detect bounding box from alpha channel ──
                const data = imageData.data;
                const W = workW, H = workH;
                const ALPHA_THRESHOLD = 10; // ignore near-invisible antialiasing pixels

                let minX = W, minY = H, maxX = 0, maxY = 0;
                let hasContent = false;

                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        if (data[(y * W + x) * 4 + 3] > ALPHA_THRESHOLD) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            hasContent = true;
                        }
                    }
                }

                // No transparent pixels → JPEG or opaque image → center full image
                if (!hasContent) {
                    _centerFull(srcCanvas, workW, workH, targetWidth, targetHeight, resolve);
                    return;
                }

                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;

                // ── Step 3: Scale product to 85% of canvas ──
                const PRODUCT_RATIO = 0.85;
                const productMaxPx = Math.min(targetWidth, targetHeight) * PRODUCT_RATIO;
                const scale = Math.min(productMaxPx / cropW, productMaxPx / cropH);
                const scaledW = Math.round(cropW * scale);
                const scaledH = Math.round(cropH * scale);
                const offsetX = Math.round((targetWidth  - scaledW) / 2);
                const offsetY = Math.round((targetHeight - scaledH) / 2);

                // ── Step 4: Draw to output canvas ──
                const out = document.createElement('canvas');
                out.width  = targetWidth;
                out.height = targetHeight;
                const outCtx = out.getContext('2d');
                outCtx.fillStyle = 'white';
                outCtx.fillRect(0, 0, targetWidth, targetHeight);
                outCtx.drawImage(srcCanvas,
                    minX, minY, cropW, cropH,
                    offsetX, offsetY, scaledW, scaledH
                );

                resolve(out.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => reject(new Error('Failed to load image for centering'));
        img.src = imageDataUrl;
    });
};

/** Fallback: scale full image to 85% of canvas, centered on white background */
function _centerFull(srcCanvas, imgW, imgH, targetWidth, targetHeight, resolve) {
    const scale = Math.min(
        (targetWidth  * 0.85) / imgW,
        (targetHeight * 0.85) / imgH
    );
    const sw = Math.round(imgW * scale);
    const sh = Math.round(imgH * scale);
    const ox = Math.round((targetWidth  - sw) / 2);
    const oy = Math.round((targetHeight - sh) / 2);

    const out = document.createElement('canvas');
    out.width  = targetWidth;
    out.height = targetHeight;
    const ctx = out.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(srcCanvas, 0, 0, imgW, imgH, ox, oy, sw, sh);
    resolve(out.toDataURL('image/png'));
}

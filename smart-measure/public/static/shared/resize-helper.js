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
                // ── Step 1: Draw source image to a temporary canvas to read pixels ──
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width  = img.width;
                srcCanvas.height = img.height;
                const srcCtx = srcCanvas.getContext('2d');
                srcCtx.drawImage(img, 0, 0);

                const { data, width: W, height: H } = srcCtx.getImageData(0, 0, img.width, img.height);

                // ── Step 2: Detect bounding box of non-transparent pixels (alpha > 0) ──
                let minX = W, minY = H, maxX = 0, maxY = 0;
                let hasContent = false;

                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const alpha = data[(y * W + x) * 4 + 3]; // alpha channel
                        if (alpha > 0) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            hasContent = true;
                        }
                    }
                }

                // Fallback: if no content detected, use full image
                if (!hasContent) {
                    window.logger.debug('⚠️ No transparent product detected, falling back to full image centering');
                    minX = 0; minY = 0; maxX = W - 1; maxY = H - 1;
                }

                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;

                window.logger.debug('🔍 Bounding box detected:', { minX, minY, maxX, maxY, cropW, cropH });

                // ── Step 3: Calculate target size for product (85% of canvas) ──
                // Product should occupy 85% of the shorter side to keep uniform margins
                const PRODUCT_RATIO = 0.85; // product occupies 85%, margin is 15%
                const productMaxSize = Math.min(targetWidth, targetHeight) * PRODUCT_RATIO;

                // Scale product to fit within productMaxSize × productMaxSize while keeping aspect ratio
                const scaleToFit = Math.min(productMaxSize / cropW, productMaxSize / cropH);
                const scaledW = Math.round(cropW * scaleToFit);
                const scaledH = Math.round(cropH * scaleToFit);

                // Center position on target canvas
                const offsetX = Math.round((targetWidth  - scaledW) / 2);
                const offsetY = Math.round((targetHeight - scaledH) / 2);

                window.logger.debug('📐 Centering info:', {
                    cropW, cropH,
                    productMaxSize,
                    scaleToFit: scaleToFit.toFixed(3),
                    scaledW, scaledH,
                    offsetX, offsetY
                });

                // ── Step 4: Draw to output canvas ──
                const outCanvas = document.createElement('canvas');
                outCanvas.width  = targetWidth;
                outCanvas.height = targetHeight;
                const outCtx = outCanvas.getContext('2d');

                // White background
                outCtx.fillStyle = 'white';
                outCtx.fillRect(0, 0, targetWidth, targetHeight);

                // Draw only the cropped product area, scaled and centered
                outCtx.drawImage(
                    srcCanvas,
                    minX, minY, cropW, cropH,   // source: cropped product region
                    offsetX, offsetY, scaledW, scaledH  // destination: centered on canvas
                );

                const resizedDataUrl = outCanvas.toDataURL('image/png');

                window.logger.debug('✅ Product centered and resized:', {
                    original:    { width: img.width, height: img.height },
                    bbox:        { minX, minY, cropW, cropH },
                    target:      { width: targetWidth, height: targetHeight },
                    product:     { scaledW, scaledH, offsetX, offsetY },
                    productRatio: `${Math.round(PRODUCT_RATIO * 100)}%`
                });
                window.logger.debug(`📐 Summary: ${img.width}×${img.height} → bbox(${cropW}×${cropH}) → canvas(${targetWidth}×${targetHeight}) at (${offsetX},${offsetY})`);

                resolve(resizedDataUrl);
            } catch (error) {
                window.logger.error('❌ Error resizing image:', error);
                reject(error);
            }
        };

        img.onerror = function(error) {
            window.logger.error('❌ Error loading image:', error);
            reject(new Error('Failed to load image'));
        };

        img.src = imageDataUrl;
    });
};

window.logger.debug('📐 Resize helper loaded (bounding-box centering, product:margin=85:15)');

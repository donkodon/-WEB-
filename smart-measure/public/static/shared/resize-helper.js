/**
 * Resize and center image using Canvas API
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @param {number} targetWidth - Target canvas width (default: 1200)
 * @param {number} targetHeight - Target canvas height (default: 1200)
 * @returns {Promise<string>} - Resized and centered image as base64 data URL
 */
window.resizeAndCenterImage = async function(imageDataUrl, targetWidth = 1200, targetHeight = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = function() {
            try {
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                
                // Fill with white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, targetWidth, targetHeight);
                
                // Calculate scaling to fit within target dimensions while maintaining aspect ratio
                const scaleX = targetWidth / img.width;
                const scaleY = targetHeight / img.height;
                const scale = Math.min(scaleX, scaleY);
                
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                
                // Calculate position to center the image
                const x = (targetWidth - scaledWidth) / 2;
                const y = (targetHeight - scaledHeight) / 2;
                
                // Draw the image centered
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                
                // Convert to data URL
                const resizedDataUrl = canvas.toDataURL('image/png');
                
                window.logger.debug('✅ Image resized and centered:', {
                    original: { width: img.width, height: img.height },
                    target: { width: targetWidth, height: targetHeight },
                    scaled: { width: scaledWidth, height: scaledHeight },
                    position: { x, y },
                    scale: scale.toFixed(3),
                    outputSize: `${canvas.width}x${canvas.height}`
                });
                
                window.logger.debug(`📐 Resize summary: ${img.width}×${img.height}px → ${canvas.width}×${canvas.height}px (scale: ${scale.toFixed(2)}x)`);
                
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

window.logger.debug('📐 Resize helper loaded and registered globally');

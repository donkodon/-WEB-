// Single Image Background Removal
window.removeBgSingle = async function(imageId, button) {
    window.logger.debug('🎯 removeBgSingle called with imageId:', imageId);
    
    const confirmation = confirm('この画像の背景を削除しますか？');
    if (!confirmation) return;
    
    // Show loading state
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
    
    try {
        // Step 1: Remove background → get dataURL (no R2 save yet)
        window.logger.debug('📡 Step 1: Removing background for imageId:', imageId);
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>白抜き中';

        const res = await fetch('/api/remove-bg-image-data/' + imageId, {
            method: 'POST'
        });
        
        window.logger.debug('📨 Response received:', res.status, res.statusText);
        
        if (!res.ok) {
            let errorMsg = 'Unknown error';
            try {
                const error = await res.json();
                errorMsg = error.details || error.error || 'Unknown error';
            } catch (parseErr) {
                errorMsg = await res.text();
            }
            window.logger.error('❌ Error:', errorMsg);
            alert('エラー: ' + errorMsg);
            button.innerHTML = originalContent;
            button.disabled = false;
            return;
        }

        const data = await res.json();
        window.logger.debug('✅ BG removed, has processedDataUrl?', !!data.processedDataUrl);

        if (!data.processedDataUrl) {
            throw new Error('No processedDataUrl in response');
        }

        // Step 2: Center and resize using Canvas
        window.logger.debug('📐 Step 2: Centering image 1200x1200...');
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>センタリング中';

        if (typeof window.resizeAndCenterImage !== 'function') {
            throw new Error('resizeAndCenterImage function not found');
        }
        const centeredDataUrl = await window.resizeAndCenterImage(data.processedDataUrl, 1200, 1200);
        window.logger.debug('✅ Centered, data URL length:', centeredDataUrl.length);

        // Step 3: Upload centered image
        window.logger.debug('📤 Step 3: Uploading centered image for sku:', data.sku, 'filenamePart:', data.filenamePart);
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>保存中';

        const uploadRes = await fetch('/api/upload-processed-image/' + data.sku, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageDataUrl: centeredDataUrl,
                filenamePart: data.filenamePart,
                maskDataUrl: data.maskDataUrl || null
            })
        });

        if (!uploadRes.ok) {
            const error = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.details || error.error || 'Upload failed');
        }

        const uploadData = await uploadRes.json();
        window.logger.debug('✅ Upload SUCCESS! URL:', uploadData.processedUrl);

        alert('背景削除が完了しました！');
        window.location.reload();

    } catch (e) {
        window.logger.error('💥 Network error:', e);
        alert('通信エラーが発生しました: ' + e.message);
        button.innerHTML = originalContent;
        button.disabled = false;
    }
};
window.logger.debug('✅ removeBgSingle function registered globally');

// Handle remove background - dispatch to correct function based on image type
window.handleRemoveBg = function(button) {
    try {
        const isMeasurement = button.getAttribute('data-is-measurement') === 'true';
        const imageId = button.getAttribute('data-image-id');
        const sku = button.getAttribute('data-sku');
        
        window.logger.debug('🎯 handleRemoveBg called:', { isMeasurement, imageId, sku });
        window.logger.debug('📊 Button attributes:', {
            'data-is-measurement': button.getAttribute('data-is-measurement'),
            'data-image-id': button.getAttribute('data-image-id'),
            'data-sku': button.getAttribute('data-sku')
        });
        
        if (isMeasurement) {
            window.logger.debug('🔀 Routing to removeBgMeasurement');
            if (typeof window.removeBgMeasurement !== 'function') {
                window.logger.error('❌ removeBgMeasurement is not a function!');
                alert('エラー: removeBgMeasurement関数が見つかりません');
                return;
            }
            window.removeBgMeasurement(sku, button);
        } else {
            window.logger.debug('🔀 Routing to removeBgSingle');
            if (typeof window.removeBgSingle !== 'function') {
                window.logger.error('❌ removeBgSingle is not a function!');
                alert('エラー: removeBgSingle関数が見つかりません');
                return;
            }
            window.removeBgSingle(imageId, button);
        }
    } catch (error) {
        window.logger.error('💥 Error in handleRemoveBg:', error);
        alert('エラーが発生しました: ' + error.message);
    }
};

// Measurement Background Removal
window.removeBgMeasurement = async function(sku, button) {
    window.logger.debug('🎯 removeBgMeasurement called with sku:', sku);
    
    const confirmation = confirm('この採寸画像の背景を削除しますか？');
    if (!confirmation) return;
    
    // Show loading state
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
    
    try {
        window.logger.debug('📡 Sending request to /api/measurements/' + sku + '/remove-bg');
        const res = await fetch('/api/measurements/' + sku + '/remove-bg', {
            method: 'POST'
        });
        
        window.logger.debug('📨 Response received:', res.status, res.statusText);
        
        if (res.ok) {
            const data = await res.json();
            window.logger.debug('✅ Success:', data);
            alert('背景削除が完了しました！');
            window.location.reload();
        } else {
            let errorMsg = 'Unknown error';
            try {
                const error = await res.json();
                errorMsg = error.details || error.error || 'Unknown error';
            } catch (parseErr) {
                errorMsg = await res.text();
            }
            window.logger.error('❌ Error:', errorMsg);
            alert('エラー: ' + errorMsg);
            button.innerHTML = originalContent;
            button.disabled = false;
        }
    } catch (e) {
        window.logger.error('💥 Network error:', e);
        alert('通信エラーが発生しました: ' + e.message);
        button.innerHTML = originalContent;
        button.disabled = false;
    }
};
window.logger.debug('✅ removeBgMeasurement function registered globally');

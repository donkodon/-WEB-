/**
 * Dashboard - Background Removal Scripts
 * Handles batch and single image background removal
 */

// ============================================
// Background Removal Script
// ============================================
(function() {
    window.logger.debug('🚀 Background Removal Script Loaded!');
    
    // Fixed model: withoutbg (birefnet-general)
    window.currentBgModel = 'birefnet-general';
    
    function initBatchRemoveBg() {
        window.logger.debug('📌 initBatchRemoveBg called!');
        
        const batchBtn = document.getElementById('btn-batch-remove-bg');
        
        window.logger.debug('🔘 Batch button:', batchBtn);
        
        if (!batchBtn) {
            window.logger.error('❌ Batch button not found!');
            return;
        }
        
        // 既にイベントリスナーが設定されているかチェック
        if (batchBtn.dataset.initialized === 'true') {
            window.logger.debug('✅ Already initialized, skipping');
            return;
        }
        batchBtn.dataset.initialized = 'true';
        
        window.logger.debug('✅ Adding click event listener to batch button');
        
        batchBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            window.logger.debug('🖱️ BATCH BUTTON CLICKED!');
            
            // Get all checked image checkboxes (not SKU radios)
            const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
            
            window.logger.debug('🔍 Found checked images:', checkedImages.length);
            
            if (checkedImages.length === 0) {
                alert('画像を選択してください（各画像の左上のチェックボックスを選択）');
                return;
            }
            
            const confirmation = confirm(checkedImages.length + '枚の画像の背景を削除しますか？');
            if (!confirmation) return;
            
            batchBtn.disabled = true;
            batchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>処理中...';
            
            let successCount = 0;
            let failCount = 0;
            
            for (const checkbox of checkedImages) {
                window.logger.debug('🔎 Processing checkbox:', checkbox);
                
                // Get image ID from data attribute
                const imageId = checkbox.dataset.imageId;
                window.logger.debug('✨ Image ID from data attribute:', imageId);
                
                if (!imageId) {
                    window.logger.warn('⚠️ No image ID found, skipping');
                    failCount++;
                    continue;
                }
                
                // Check if this is a measurement image
                const isMeasurement = checkbox.dataset.isMeasurement === 'true';
                const sku = checkbox.dataset.sku;
                
                try {
                    let finalProcessedUrl = null;

                    if (isMeasurement) {
                        window.logger.debug('📏 Processing measurement image for SKU:', sku);
                        
                        // Step 1: Remove background → dataURL
                        const bgRes = await window.authenticatedFetch('/api/remove-bg-measurement/' + sku, {
                            method: 'POST'
                        });
                        
                        if (!bgRes.ok) throw new Error('Background removal failed');
                        
                        const bgData = await bgRes.json();
                        window.logger.debug('✅ BG removed, has processedDataUrl?', !!bgData.processedDataUrl);
                        
                        if (!bgData.processedDataUrl) throw new Error('No processedDataUrl in response');
                        
                        // Step 2: Center and resize
                        window.logger.debug('📐 Centering measurement image to 1000x1000...');
                        if (typeof window.resizeAndCenterImage !== 'function') throw new Error('resizeAndCenterImage not found');
                        const centeredDataUrl = await window.resizeAndCenterImage(bgData.processedDataUrl, 1000, 1000);
                        
                        // Step 3: Upload
                        const uploadRes = await window.authenticatedFetch('/api/upload-processed-measurement/' + sku, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                imageDataUrl: centeredDataUrl,
                                maskDataUrl: bgData.maskDataUrl
                            })
                        });
                        
                        if (!uploadRes.ok) throw new Error('Upload failed');
                        const uploadData = await uploadRes.json();
                        finalProcessedUrl = uploadData.processedUrl;

                    } else {
                        // ── 通常画像: 2段階フロー（dataURL → センタリング → upload） ──
                        window.logger.debug('🎨 Processing regular image ID:', imageId);
                        
                        // Step 1: Remove background → dataURL
                        const bgRes = await window.authenticatedFetch('/api/remove-bg-image-data/' + imageId, {
                            method: 'POST'
                        });
                        
                        if (!bgRes.ok) throw new Error('Background removal failed');
                        
                        const bgData = await bgRes.json();
                        window.logger.debug('✅ BG removed, has processedDataUrl?', !!bgData.processedDataUrl);
                        
                        if (!bgData.processedDataUrl) throw new Error('No processedDataUrl in response');
                        
                        // Step 2: Center and resize
                        window.logger.debug('📐 Centering regular image to 1000x1000...');
                        if (typeof window.resizeAndCenterImage !== 'function') throw new Error('resizeAndCenterImage not found');
                        const centeredDataUrl = await window.resizeAndCenterImage(bgData.processedDataUrl, 1000, 1000);
                        
                        // Step 3: Upload
                        const uploadRes = await window.authenticatedFetch('/api/upload-processed-image/' + bgData.sku, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                imageDataUrl: centeredDataUrl,
                                filenamePart: bgData.filenamePart,
                                maskDataUrl: bgData.maskDataUrl || null
                            })
                        });
                        
                        if (!uploadRes.ok) throw new Error('Upload failed');
                        const uploadData = await uploadRes.json();
                        finalProcessedUrl = uploadData.processedUrl;
                    }
                    
                    successCount++;
                    window.logger.debug('✅ Success for image', imageId, 'processedUrl:', finalProcessedUrl);
                    
                    // 即座に画面に反映する
                    if (finalProcessedUrl) {
                        const imageContainer = document.querySelector('[data-image-id="' + imageId + '"]');
                        if (imageContainer) {
                            const imgElement = imageContainer.querySelector('img');
                            if (imgElement) {
                                imgElement.src = finalProcessedUrl + '?v=' + Date.now();
                                window.logger.debug('✅ Updated image src');
                            }
                            
                            // 「白抜き」ボタンを非表示
                            const bgRemoveBtn = imageContainer.querySelector('button[onclick*="removeBg"]');
                            if (bgRemoveBtn) bgRemoveBtn.style.display = 'none';
                            
                            // 完了バッジを追加
                            const existingBadge = imageContainer.querySelector('.bg-green-500');
                            if (!existingBadge) {
                                const completedBadge = document.createElement('div');
                                completedBadge.className = 'absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-[10px] font-bold shadow-lg z-10';
                                completedBadge.innerHTML = '<i class="fas fa-check mr-1"></i>完了';
                                imageContainer.appendChild(completedBadge);
                            }
                        }
                    }

                } catch (e) {
                    window.logger.error('💥 Error processing image ' + imageId, ':', e);
                    failCount++;
                }
            }
            
            batchBtn.disabled = false;
            batchBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>選択画像を白抜き';
            
            window.logger.debug('✅ Batch processing completed: Success=' + successCount + ', Failed=' + failCount);
            
            if (successCount > 0) {
                const checkboxes = document.querySelectorAll('input[name="image-select"]:checked');
                checkboxes.forEach(cb => { cb.checked = false; });
            }
        });
    }
    
    // DOMContentLoaded が既に発火済みの場合も対応
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBatchRemoveBg);
    } else {
        initBatchRemoveBg();
    }
})();

// ============================================
// Single Image Background Removal
// ============================================
window.removeBgSingle = async function(imageId, button) {
    window.logger.debug('🎯 removeBgSingle called with imageId:', imageId);
    
    const confirmation = confirm('この画像の背景を削除しますか？');
    if (!confirmation) return;
    
    const originalContent = button.innerHTML;
    button.disabled = true;

    try {
        // Step 1: Remove background → dataURL
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>白抜き中';
        window.logger.debug('📡 Step 1: remove-bg-image-data for', imageId);

        const res = await window.authenticatedFetch('/api/remove-bg-image-data/' + imageId, {
            method: 'POST'
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.details || error.error || 'Background removal failed');
        }
        
        const data = await res.json();
        window.logger.debug('✅ BG removed, processedDataUrl?', !!data.processedDataUrl);
        
        if (!data.processedDataUrl) throw new Error('No processedDataUrl in response');

        // Step 2: Center and resize
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>センタリング中';
        window.logger.debug('📐 Step 2: Centering 1000x1000...');
        
        if (typeof window.resizeAndCenterImage !== 'function') throw new Error('resizeAndCenterImage not found');
        const centeredDataUrl = await window.resizeAndCenterImage(data.processedDataUrl, 1000, 1000);
        window.logger.debug('✅ Centered');

        // Step 3: Upload
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>保存中';
        window.logger.debug('📤 Step 3: Upload sku:', data.sku, 'filenamePart:', data.filenamePart);
        
        const uploadRes = await window.authenticatedFetch('/api/upload-processed-image/' + data.sku, {
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
        window.logger.debug('✅ SUCCESS! URL:', uploadData.processedUrl);
        alert('背景削除が完了しました！');
        window.location.reload();

    } catch (e) {
        window.logger.error('💥 Error:', e.message);
        alert('エラーが発生しました: ' + e.message);
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
window.logger.debug('✅ handleRemoveBg function registered globally');

// Remove background for measurement image (auto-update UI, no reload)
window.removeBgMeasurement = async function(sku, button) {
    window.logger.debug('🎯 removeBgMeasurement called with SKU:', sku);
    
    const originalContent = button.innerHTML;
    const imageContainer = button.closest('.relative.group');
    const imgElement = imageContainer ? imageContainer.querySelector('img') : null;
    
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
    button.className = 'absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
    
    try {
        // Step 1: Remove background → dataURL
        window.logger.debug('📡 Step 1: remove-bg for SKU:', sku);
        const res = await window.authenticatedFetch('/api/remove-bg-measurement/' + sku, {
            method: 'POST'
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.details || error.error || 'Background removal failed');
        }
        
        const data = await res.json();
        window.logger.debug('✅ BG removed, maskDataUrl?', !!data.maskDataUrl);
        
        if (!data.processedDataUrl) throw new Error('No processedDataUrl in response');
        
        // Step 2: Center and resize
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>センタリング中';
        window.logger.debug('📐 Step 2: Centering 1000x1000...');
        
        if (typeof window.resizeAndCenterImage !== 'function') throw new Error('resizeAndCenterImage not found');
        const centeredDataUrl = await window.resizeAndCenterImage(data.processedDataUrl, 1000, 1000);
        window.logger.debug('✅ Centered');
        
        // Step 3: Upload
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>アップロード中';
        window.logger.debug('📤 Step 3: Upload...');
        
        const uploadRes = await window.authenticatedFetch('/api/upload-processed-measurement/' + sku, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                imageDataUrl: centeredDataUrl,
                maskDataUrl: data.maskDataUrl
            })
        });
        
        if (!uploadRes.ok) {
            const error = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.details || error.error || 'Upload failed');
        }
        
        const uploadData = await uploadRes.json();
        window.logger.debug('✅ SUCCESS! URL:', uploadData.processedUrl);
        
        // Update image in place
        if (imgElement && uploadData.processedUrl) {
            imgElement.src = uploadData.processedUrl + '?v=' + Date.now();
        }
        
        button.innerHTML = '<i class="fas fa-check mr-1"></i>完了';
        button.className = 'absolute bottom-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
        button.disabled = true;
        
        setTimeout(() => { button.style.opacity = '0'; }, 2000);
        
    } catch (e) {
        window.logger.error('❌ Error:', e.message);
        button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>失敗';
        button.className = 'absolute bottom-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.className = 'absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-lg z-10';
            button.disabled = false;
        }, 3000);
    }
};
window.logger.debug('✅ removeBgMeasurement function registered globally');

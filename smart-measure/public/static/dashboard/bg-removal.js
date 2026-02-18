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
                    let res;
                    
                    if (isMeasurement) {
                        window.logger.debug('📏 Processing measurement image for SKU:', sku);
                        
                        // Step 1: Remove background
                        window.logger.debug('🔄 Step 1: Removing background for SKU:', sku);
                        const bgRes = await window.authenticatedFetch('/api/remove-bg-measurement/' + sku, {
                            method: 'POST'
                        });
                        
                        window.logger.debug('📡 BG removal response:', bgRes.status, bgRes.statusText);
                        
                        if (!bgRes.ok) {
                            throw new Error('Background removal failed');
                        }
                        
                        const bgData = await bgRes.json();
                        window.logger.debug('✅ BG removed, has processedDataUrl?', !!bgData.processedDataUrl);
                        window.logger.debug('🔍 resizeAndCenterImage available?', typeof window.resizeAndCenterImage === 'function');
                        
                        // Step 2: Resize and center
                        if (bgData.processedDataUrl && typeof window.resizeAndCenterImage === 'function') {
                            window.logger.debug('📐 Step 2: Resizing measurement image to 1200x1200...');
                            const resizedDataUrl = await window.resizeAndCenterImage(bgData.processedDataUrl, 1200, 1200);
                            window.logger.debug('✅ Resized, data URL length:', resizedDataUrl.length);
                            
                            // Step 3: Upload resized image (including mask if available)
                            window.logger.debug('📤 Step 3: Uploading resized measurement image...');
                            window.logger.debug('🎭 Mask data available:', !!bgData.maskDataUrl);
                            res = await window.authenticatedFetch('/api/upload-processed-measurement/' + sku, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    imageDataUrl: resizedDataUrl,
                                    maskDataUrl: bgData.maskDataUrl  // マスクデータを追加
                                })
                            });
                            window.logger.debug('📡 Upload response:', res.status, res.statusText);
                        } else {
                            window.logger.warn('⚠️ Skipping resize: processedDataUrl=' + !!bgData.processedDataUrl + ', resizeFunc=' + (typeof window.resizeAndCenterImage === 'function'));
                            // Fallback: use bg removal result directly
                            res = bgRes;
                        }
                    } else {
                        window.logger.debug('🎨 Starting background removal for image ID:', imageId);
                        res = await window.authenticatedFetch('/api/remove-bg-image/' + imageId, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                model: 'birefnet-general'
                            })
                        });
                    }
                    
                    window.logger.debug('📡 Response status:', res.status, res.statusText);
                    
                    if (res.ok) {
                        const data = await res.json();
                        window.logger.debug('✅ Success for image', imageId, ':', data);
                        successCount++;
                        
                        // 即座に画面に反映する (リロード前に)
                        if (data.processedUrl) {
                            window.logger.debug('🔍 Attempting to update image:', imageId);
                            window.logger.debug('🔍 New image URL:', data.processedUrl);
                            
                            // Find image container by data-image-id
                            const imageContainer = document.querySelector('[data-image-id="' + imageId + '"]');
                            window.logger.debug('🔍 Found image container:', !!imageContainer);
                            
                            if (imageContainer) {
                                const imgElement = imageContainer.querySelector('img');
                                window.logger.debug('🔍 Found img element:', !!imgElement);
                                window.logger.debug('🔍 Current src:', imgElement ? imgElement.src : 'N/A');
                                
                                if (imgElement) {
                                    // Add cache busting to force reload
                                    imgElement.src = data.processedUrl + '?v=' + Date.now();
                                    window.logger.debug('✅ Updated image src to:', imgElement.src);
                                }
                                
                                // 「白抜き」ボタンを非表示にし、「完了」バッジを表示
                                const bgRemoveBtn = imageContainer.querySelector('button[onclick*="removeBg"]');
                                window.logger.debug('🔍 Found remove bg button:', !!bgRemoveBtn);
                                if (bgRemoveBtn) {
                                    bgRemoveBtn.style.display = 'none';
                                    window.logger.debug('✅ Hidden remove bg button');
                                }
                                
                                // 完了バッジを追加
                                const existingBadge = imageContainer.querySelector('.bg-green-500');
                                if (!existingBadge) {
                                    const completedBadge = document.createElement('div');
                                    completedBadge.className = 'absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-[10px] font-bold shadow-lg z-10';
                                    completedBadge.innerHTML = '<i class="fas fa-check mr-1"></i>完了';
                                    imageContainer.appendChild(completedBadge);
                                    window.logger.debug('✅ Added completion badge');
                                }
                            } else {
                                window.logger.error('❌ Image container not found for:', imageId);
                            }
                        } else {
                            window.logger.warn('⚠️ No processedUrl in response');
                        }
                    } else {
                        const errorText = await res.text();
                        window.logger.error('❌ Failed for image', imageId, ':', errorText);
                        failCount++;
                    }
                } catch (e) {
                    window.logger.error('💥 Error processing image ' + imageId, ':', e);
                    failCount++;
                }
            }
            
            batchBtn.disabled = false;
            batchBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>選択画像を白抜き';
            
            window.logger.debug('✅ Batch processing completed: Success=' + successCount + ', Failed=' + failCount);
            
            // Auto-refresh images without reload
            if (successCount > 0) {
                window.logger.debug('🔄 Auto-refreshing processed images...');
                // Images are already updated in place by individual processing
                // Just update the UI to reflect completion
                const checkboxes = document.querySelectorAll('input[name="image-select"]:checked');
                checkboxes.forEach(cb => {
                    cb.checked = false; // Uncheck processed images
                });
            }
        });
    }
    
    // DOMContentLoaded が既に発火済みの場合も対応
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBatchRemoveBg);
    } else {
        // DOMContentLoaded は既に発火済み
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
    
    // Show loading state
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
    
    try {
        window.logger.debug('📡 Sending request to /api/remove-bg-image/' + imageId);
        const res = await window.authenticatedFetch('/api/remove-bg-image/' + imageId, {
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
window.logger.debug('✅ handleRemoveBg function registered globally');

// Remove background for measurement image (auto-update UI, no reload)
window.removeBgMeasurement = async function(sku, button) {
    window.logger.debug('🎯 removeBgMeasurement called with SKU:', sku);
    
    // No confirmation - start immediately
    const originalContent = button.innerHTML;
    const imageContainer = button.closest('.relative.group');
    const imgElement = imageContainer ? imageContainer.querySelector('img') : null;
    
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
    button.className = 'absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
    
    try {
        // Step 1: Remove background
        window.logger.debug('📡 Removing background for SKU:', sku);
        const res = await window.authenticatedFetch('/api/remove-bg-measurement/' + sku, {
            method: 'POST'
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.details || error.error || 'Background removal failed');
        }
        
        const data = await res.json();
        window.logger.debug('✅ Background removed');
        window.logger.debug('Mask data available: ' + !!data.maskDataUrl);
        
        if (!data.processedDataUrl) {
            throw new Error('No processedDataUrl in response');
        }
        
        // Step 2: Resize and center
        window.logger.debug('📐 Resizing to 1200x1200...');
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>リサイズ中';
        
        if (typeof window.resizeAndCenterImage !== 'function') {
            throw new Error('resizeAndCenterImage function not found');
        }
        
        const resizedDataUrl = await window.resizeAndCenterImage(data.processedDataUrl, 1200, 1200);
        window.logger.debug('✅ Resized');
        
        // Step 3: Upload (including mask if available)
        window.logger.debug('📤 Uploading...');
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>アップロード中';
        
        const uploadRes = await window.authenticatedFetch('/api/upload-processed-measurement/' + sku, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                imageDataUrl: resizedDataUrl,
                maskDataUrl: data.maskDataUrl  // Include mask data
            })
        });
        
        if (!uploadRes.ok) {
            const error = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.details || error.error || 'Upload failed');
        }
        
        const uploadData = await uploadRes.json();
        window.logger.debug('✅ SUCCESS! New URL:', uploadData.processedUrl);
        
        // Update image in place (no reload!)
        if (imgElement && uploadData.processedUrl) {
            imgElement.src = uploadData.processedUrl + '?v=' + Date.now();
            window.logger.debug('🖼️ Image updated in UI');
        }
        
        // Show success state
        button.innerHTML = '<i class="fas fa-check mr-1"></i>完了';
        button.className = 'absolute bottom-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
        button.disabled = true; // Keep disabled to prevent re-processing
        
        // Hide button after 2 seconds
        setTimeout(() => {
            button.style.opacity = '0';
        }, 2000);
        
    } catch (e) {
        window.logger.error('❌ Error:', e.message);
        button.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>失敗';
        button.className = 'absolute bottom-2 right-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold transition-opacity flex items-center shadow-lg z-10 opacity-100';
        
        // Reset button after 3 seconds
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.className = 'absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-lg z-10';
            button.disabled = false;
        }, 3000);
    }
};
window.logger.debug('✅ removeBgMeasurement function registered globally');

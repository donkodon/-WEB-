/**
 * Dashboard Page Scripts
 * Handles image selection, CSV export, batch operations, etc.
 */

// ============================================
// SKU Checkbox Functions
// ============================================

// Toggle all images when SKU checkbox is clicked
window.toggleProductImages = function(productId, checked) {
    window.logger.debug('🔄 toggleProductImages called:', { productId, checked });
    const imageCheckboxes = document.querySelectorAll('input[name="image-select"][data-product-id="' + productId + '"]');
    window.logger.debug('📸 Found', imageCheckboxes.length, 'image checkboxes for product', productId);
    imageCheckboxes.forEach(cb => {
        window.logger.debug('  ✓ Setting checkbox:', cb.dataset.imageId, 'to', checked);
        cb.checked = checked;
    });
    window.logger.debug('✅ All image checkboxes updated');
};

// Update SKU checkbox state based on image checkboxes
window.updateSkuCheckbox = function(productId) {
    const skuCheckbox = document.querySelector('input[name="sku-checkbox"][data-product-id="' + productId + '"]');
    const imageCheckboxes = document.querySelectorAll('input[name="image-select"][data-product-id="' + productId + '"]');
    
    if (!skuCheckbox || imageCheckboxes.length === 0) return;
    
    const checkedCount = Array.from(imageCheckboxes).filter(cb => cb.checked).length;
    
    if (checkedCount === 0) {
        skuCheckbox.checked = false;
        skuCheckbox.indeterminate = false;
    } else if (checkedCount === imageCheckboxes.length) {
        skuCheckbox.checked = true;
        skuCheckbox.indeterminate = false;
    } else {
        skuCheckbox.checked = false;
        skuCheckbox.indeterminate = true;
    }
};

// ============================================
// CSV Export Function
// ============================================
(function() {
    const btnExportCSV = document.getElementById('btn-export-csv');
    if (!btnExportCSV) return;
    
    btnExportCSV.addEventListener('click', async function() {
        // Get all checked image checkboxes
        const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
        
        if (checkedImages.length === 0) {
            alert('画像を選択してください（各画像の左上のチェックボックスを選択）');
            return;
        }
        
        // Collect image IDs
        const imageIds = Array.from(checkedImages).map(cb => cb.dataset.imageId).filter(Boolean);
        
        if (imageIds.length === 0) {
            alert('有効な画像が選択されていません');
            return;
        }
        
        try {
            btnExportCSV.disabled = true;
            btnExportCSV.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>CSV生成中...';
            
            // Request CSV data from API
            const response = await fetch('/api/export-selected-csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageIds })
            });
            
            if (!response.ok) {
                throw new Error('CSV生成に失敗しました');
            }
            
            // Get CSV content as binary blob (preserves UTF-8 BOM)
            const blob = await response.blob();
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const filename = 'smart_measure_export_' + new Date().toISOString().slice(0,10) + '.csv';
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            alert('CSVファイルをダウンロードしました（' + imageIds.length + '件）');
        } catch (e) {
            window.logger.error('CSV export error:', e);
            alert('CSVエクスポートに失敗しました: ' + e.message);
        } finally {
            btnExportCSV.disabled = false;
            btnExportCSV.innerHTML = '<i class="fas fa-download mr-2"></i>CSV出力';
        }
    });
})();

// ============================================
// Image Download Function
// ============================================
(function() {
    const btnDownloadImages = document.getElementById('btn-download-images');
    if (!btnDownloadImages) return;
    
    btnDownloadImages.addEventListener('click', async function() {
        // Get all checked image checkboxes
        const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
        
        if (checkedImages.length === 0) {
            alert('画像を選択してください（各画像の左上のチェックボックスを選択）');
            return;
        }
        
        // Collect image IDs
        const imageIds = Array.from(checkedImages).map(cb => cb.dataset.imageId).filter(Boolean);
        
        if (imageIds.length === 0) {
            alert('有効な画像が選択されていません');
            return;
        }
        
        const confirmation = confirm(imageIds.length + '枚の画像（オリジナル）をZIPでダウンロードしますか？');
        if (!confirmation) return;
        
        try {
            btnDownloadImages.disabled = true;
            btnDownloadImages.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>ZIP作成中...';
            
            // Create ZIP file
            const zip = new JSZip();
            const folder = zip.folder('original_images');
            let successCount = 0;
            
            for (const imageId of imageIds) {
                try {
                    const response = await window.authenticatedFetch('/api/download-image/' + imageId);
                    if (!response.ok) {
                        window.logger.error('Failed to download image:', imageId);
                        continue;
                    }
                    
                    const data = await response.json();
                    if (!data.imageUrl || !data.filename) {
                        window.logger.error('Invalid response for image:', imageId);
                        continue;
                    }
                    
                    // Convert data URL or fetch image
                    let blob;
                    if (data.imageUrl.startsWith('data:')) {
                        const base64Data = data.imageUrl.split(',')[1];
                        const binaryStr = atob(base64Data);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) {
                            bytes[i] = binaryStr.charCodeAt(i);
                        }
                        blob = new Blob([bytes], { type: 'image/png' });
                    } else {
                        const imgResponse = await fetch(data.imageUrl, {
                            cache: 'no-cache'  // Always fetch fresh data, bypass browser cache
                        });
                        blob = await imgResponse.blob();
                    }
                    
                    folder.file(data.filename, blob);
                    successCount++;
                } catch (e) {
                    window.logger.error('Error adding image ' + imageId + ' to ZIP:', e);
                }
            }
            
            // Generate and download ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const timestamp = new Date().toISOString().slice(0, 10);
            saveAs(zipBlob, 'original_images_' + timestamp + '.zip');
            
            alert('ダウンロード完了\\n成功: ' + successCount + '枚 / ' + imageIds.length + '枚');
        } catch (e) {
            window.logger.error('Image download error:', e);
            alert('画像ダウンロードに失敗しました: ' + e.message);
        } finally {
            btnDownloadImages.disabled = false;
            btnDownloadImages.innerHTML = '<i class="fas fa-images mr-2"></i>画像ダウンロード';
        }
    });
})();

// ============================================
// Product Data Download Function
// ============================================
(function() {
    const btnDownloadProcessed = document.getElementById('btn-download-processed');
    if (!btnDownloadProcessed) return;
    
    btnDownloadProcessed.addEventListener('click', async function() {
        // Get all checked image checkboxes
        const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
        
        if (checkedImages.length === 0) {
            alert('画像を選択してください（各画像の左上のチェックボックスを選択）');
            return;
        }
        
        // Collect image IDs
        const imageIds = Array.from(checkedImages).map(cb => cb.dataset.imageId).filter(Boolean);
        
        if (imageIds.length === 0) {
            alert('有効な画像が選択されていません');
            return;
        }
        
        // Collect unique SKUs from selected images
        const skus = new Set();
        checkedImages.forEach(cb => {
            const sku = cb.dataset.sku || cb.closest('[data-sku]')?.dataset.sku;
            if (sku) skus.add(sku);
        });
        const skuArray = Array.from(skus);
        
        window.logger.debug('📊 Selected images:', imageIds.length, 'Unique SKUs:', skuArray.length);
        
        const confirmation = confirm(
            imageIds.length + '枚の商品データ（画像+CSV）をZIPでダウンロードしますか？\n' +
            'SKU数: ' + skuArray.length + '件\n\n' +
            '※ 初回ダウンロードのSKUのみ課金対象です'
        );
        if (!confirmation) return;
        
        try {
            btnDownloadProcessed.disabled = true;
            
            // DISABLED: Billing API temporarily disabled due to auth issues
            // TODO: Re-enable after fixing billing API authentication
            /*
            btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>課金処理中...';
            
            // Track billing BEFORE starting download
            let billingResult = null;
            try {
                const billingResponse = await window.authenticatedFetch('/api/billing/track-download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skus: skuArray, imageIds })
                });
                
                if (billingResponse.ok) {
                    const billingData = await billingResponse.json();
                    billingResult = billingData.billing;
                    window.logger.debug('✅ Billing tracked:', billingResult);
                    
                    // Show billing summary
                    if (billingResult && billingResult.chargedCount > 0) {
                        alert(
                            '課金処理完了\n\n' +
                            '課金対象: ' + billingResult.chargedCount + 'SKU\n' +
                            '無料（重複）: ' + billingResult.freeCount + 'SKU\n\n' +
                            'ダウンロードを開始します...'
                        );
                    }
                } else {
                    window.logger.warn('⚠️ Billing tracking failed (continuing download):', billingResponse.status);
                }
            } catch (billingError) {
                window.logger.error('❌ Billing error (continuing download):', billingError);
            }
            */
            
            btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>商品データ作成中...';
            
            // Create ZIP file
            const zip = new JSZip();
            const imagesFolder = zip.folder('images');
            let imageSuccessCount = 0;
            let imageSkipCount = 0;
            const filenameSet = new Set(); // Track filenames to prevent duplicates
            
            window.logger.debug('📊 Total images to process:', imageIds.length);
            window.logger.debug('📋 Image IDs:', imageIds);
            
            // Step 1: Download images
            for (const imageId of imageIds) {
                try {
                    window.logger.debug('🔄 Processing imageId:', imageId);
                    const response = await window.authenticatedFetch('/api/download-product-data/' + imageId);
                    if (!response.ok) {
                        window.logger.error('Failed to download product image:', imageId);
                        imageSkipCount++;
                        continue;
                    }
                    
                    const data = await response.json();
                    window.logger.debug('📦 Response data:', data);
                    
                    if (!data.imageUrl) {
                        window.logger.warn('No image available for:', imageId);
                        imageSkipCount++;
                        continue;
                    }
                    
                    if (!data.filename) {
                        window.logger.error('Invalid response for image:', imageId);
                        imageSkipCount++;
                        continue;
                    }
                    
                    window.logger.debug('📝 Generated filename:', data.filename);
                    
                    // Ensure unique filename (prevent duplicates)
                    let uniqueFilename = data.filename;
                    let counter = 1;
                    while (filenameSet.has(uniqueFilename)) {
                        const ext = uniqueFilename.substring(uniqueFilename.lastIndexOf('.'));
                        const basename = uniqueFilename.substring(0, uniqueFilename.lastIndexOf('.'));
                        uniqueFilename = basename + '_' + counter + ext;
                        counter++;
                    }
                    filenameSet.add(uniqueFilename);
                    window.logger.debug('✅ Final unique filename:', uniqueFilename);
                    window.logger.debug('📁 Current filenameSet size:', filenameSet.size);
                    window.logger.debug('📁 Filenames in set:', Array.from(filenameSet));
                    
                    // For data URLs (PNG with transparency), composite with white background
                    if (data.imageUrl.startsWith('data:')) {
                        // Create canvas to composite with white background
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = data.imageUrl;
                        });
                        
                        // Create canvas with white background
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        
                        // Fill with white background
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Draw image on top
                        ctx.drawImage(img, 0, 0);
                        
                        // Convert to blob and add to ZIP (await the Promise)
                        const blob = await new Promise((resolve) => {
                            canvas.toBlob((b) => resolve(b), 'image/png');
                        });
                        if (blob) {
                            window.logger.debug('✅ Adding to ZIP (data URL):', uniqueFilename, 'Size:', blob.size);
                            imagesFolder.file(uniqueFilename, blob);
                            imageSuccessCount++;
                            window.logger.debug('✅ Successfully added. Total success count:', imageSuccessCount);
                        } else {
                            window.logger.error('Failed to create blob for:', imageId);
                            imageSkipCount++;
                        }
                    } else {
                        // For regular URLs, fetch and add to ZIP
                        window.logger.debug('Fetching image from URL:', data.imageUrl);
                        const imgResponse = await fetch(data.imageUrl, {
                            cache: 'no-cache'  // Always fetch fresh data, bypass browser cache
                        });
                        if (!imgResponse.ok) {
                            window.logger.error('Failed to fetch image:', imgResponse.status);
                            imageSkipCount++;
                            continue;
                        }
                        const blob = await imgResponse.blob();
                        window.logger.debug('Got blob, size:', blob.size);
                        if (blob.size > 0) {
                            window.logger.debug('✅ Adding to ZIP (URL):', uniqueFilename, 'Size:', blob.size);
                            imagesFolder.file(uniqueFilename, blob);
                            imageSuccessCount++;
                            window.logger.debug('✅ Successfully added. Total success count:', imageSuccessCount);
                        } else {
                            window.logger.error('Empty blob for:', imageId);
                            imageSkipCount++;
                        }
                    }
                } catch (e) {
                    window.logger.error('❌ Error downloading product image ' + imageId + ':', e);
                    window.logger.error('❌ Error stack:', e.stack);
                    imageSkipCount++;
                }
                
                window.logger.debug('🔄 Loop iteration complete. Success:', imageSuccessCount, 'Skip:', imageSkipCount);
            }
            
            window.logger.debug('🏁 Image processing finished. Final counts - Success:', imageSuccessCount, 'Skip:', imageSkipCount);
            
            // Step 2: Generate CSV
            window.logger.debug('📄 Generating CSV...');
            btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>CSV生成中...';
            
            try {
                const csvResponse = await window.authenticatedFetch('/api/export-product-items', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ imageIds })
                });
                
                if (csvResponse.ok) {
                    const csvBlob = await csvResponse.blob();
                    window.logger.debug('✅ CSV generated, size:', csvBlob.size);
                    zip.file('商品情報.csv', csvBlob);
                } else {
                    window.logger.error('CSV generation failed:', csvResponse.status);
                }
            } catch (csvError) {
                window.logger.error('❌ CSV generation error:', csvError);
            }
            
            // Step 3: Generate and download ZIP
            window.logger.debug('📦 Generating ZIP file...');
            btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>ZIP作成中...';
            
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const timestamp = new Date().toISOString().slice(0, 10);
            window.logger.debug('✅ ZIP generated, size:', zipBlob.size);
            saveAs(zipBlob, '商品データ_' + timestamp + '.zip');
            
            let message = '商品データダウンロード完了\\n画像: ' + imageSuccessCount + '枚';
            if (imageSkipCount > 0) {
                message += '\\nスキップ: ' + imageSkipCount + '枚';
            }
            message += '\\nCSV: 1ファイル';
            alert(message);
        } catch (e) {
            window.logger.error('Product data download error:', e);
            alert('商品データダウンロードに失敗しました: ' + e.message);
        } finally {
            btnDownloadProcessed.disabled = false;
            btnDownloadProcessed.innerHTML = '<i class="fas fa-magic mr-2"></i>商品データDL';
        }
    });
})();

// File will continue in next part due to length...

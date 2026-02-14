/**
 * Dashboard - Auto-Measurement Scripts
 * Handles automatic measurement functionality
 */

// ============================================
// Auto-Measurement Script
// ============================================
(function() {
    window.logger.debug('📌 Auto-measurement script loaded');
    
    function initAutoMeasure() {
        const autoMeasureBtn = document.getElementById('btn-auto-measure');
        
        if (!autoMeasureBtn) {
            window.logger.error('❌ Auto-measure button not found!');
            return;
        }
        
        if (autoMeasureBtn.dataset.initialized === 'true') {
            window.logger.debug('✅ Auto-measure already initialized, skipping');
            return;
        }
        autoMeasureBtn.dataset.initialized = 'true';
        
        window.logger.debug('✅ Adding click event listener to auto-measure button');
        
        autoMeasureBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            window.logger.debug('🖱️ AUTO-MEASURE BUTTON CLICKED!');
            
            const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
            
            window.logger.debug('🔍 Found checked images:', checkedImages.length);
            
            if (checkedImages.length === 0) {
                alert('採寸する画像を選択してください（各画像の左上のチェックボックスを選択）');
                return;
            }
            
            const confirmation = confirm(
                checkedImages.length + '枚の画像を自動採寸しますか？\\n\\n' +
                '※ Replicate API の料金が発生します。\\n' +
                '※ 1枚あたり約8秒かかります（合計: 約' + Math.ceil(checkedImages.length * 8) + '秒）'
            );
            if (!confirmation) return;
            
            autoMeasureBtn.disabled = true;
            autoMeasureBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>採寸中...';
            
            let successCount = 0;
            let failCount = 0;
            
            for (const checkbox of checkedImages) {
                window.logger.debug('🔎 Checkbox element:', checkbox);
                window.logger.debug('🔎 Dataset:', checkbox.dataset);
                
                const imageId = checkbox.dataset.imageId;
                const imageUrl = checkbox.dataset.imageUrl;
                const sku = checkbox.dataset.sku;
                
                window.logger.debug('📊 Extracted data:', { imageId, imageUrl, sku });
                
                if (!imageId || !imageUrl || !sku) {
                    window.logger.warn('⚠️ Missing data, skipping');
                    window.logger.warn('  - imageId:', imageId);
                    window.logger.warn('  - imageUrl:', imageUrl);
                    window.logger.warn('  - sku:', sku);
                    failCount++;
                    continue;
                }
                
                try {
                    window.logger.debug('📏 Starting auto-measurement for:', sku);
                    const res = await fetch('/api/auto-measure', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            imageId: imageId,
                            imageUrl: imageUrl,
                            sku: sku
                        })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        window.logger.debug('✅ Measurement success:', data);
                        successCount++;
                        
                        // 成功バッジを追加
                        const imageContainer = checkbox.closest('[data-image-id]') || checkbox.closest('.relative.group');
                        if (imageContainer) {
                            const badgeContainer = imageContainer.querySelector('.w-full.h-full.bg-white');
                            if (badgeContainer) {
                                const measureBadge = document.createElement('div');
                                measureBadge.className = 'absolute top-2 right-2 bg-purple-500 text-white px-2 py-1 rounded-full text-[10px] font-bold opacity-100 shadow-lg z-10';
                                measureBadge.innerHTML = '<i class="fas fa-ruler-combined mr-1"></i>採寸完了';
                                badgeContainer.appendChild(measureBadge);
                            }
                        }
                    } else {
                        const error = await res.json();
                        window.logger.error('❌ Measurement failed:', error);
                        failCount++;
                    }
                } catch (error) {
                    window.logger.error('❌ Error:', error);
                    failCount++;
                }
            }
            
            autoMeasureBtn.disabled = false;
            autoMeasureBtn.innerHTML = '<i class="fas fa-ruler-combined mr-2"></i>選択画像を自動採寸';
            
            if (successCount > 0) {
                const message = 
                    '自動採寸完了\\n\\n' +
                    '✅ 成功: ' + successCount + '枚\\n' +
                    '❌ 失敗: ' + failCount + '枚\\n\\n' +
                    'ページをリロードします。\\n' +
                    'SKU名の横にある「採寸データ」ボタンから\\n' +
                    'ランドマークを編集できます。';
                
                alert(message);
                window.location.reload();
            } else {
                alert(
                    '自動採寸完了\\n\\n' +
                    '✅ 成功: ' + successCount + '枚\\n' +
                    '❌ 失敗: ' + failCount + '枚'
                );
            }
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoMeasure);
    } else {
        initAutoMeasure();
    }
})();

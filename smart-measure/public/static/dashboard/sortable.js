// Initialize Sortable for each image grid
document.addEventListener('DOMContentLoaded', () => {
  window.logger.debug('🎯 Initializing Sortable for image grids...');
  
  // Find all image grids
  const imageGrids = document.querySelectorAll('.image-grid');
  window.logger.debug('📦 Found', imageGrids.length, 'image grids');
  
  imageGrids.forEach((gridEl, index) => {
    const sku = gridEl.dataset.sku;
    
    if (!sku) {
      window.logger.warn('⚠️ No SKU found for grid', index);
      return;
    }
    
    window.logger.debug('✅ Setting up Sortable for SKU:', sku);
    
    new Sortable(gridEl, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.sortable-item',
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: async (evt) => {
        window.logger.debug('🔄 Drag ended for SKU:', sku);
        window.logger.debug('   Old index:', evt.oldIndex, '→ New index:', evt.newIndex);
        
        // 新しい順序を取得
        const imageIds = Array.from(gridEl.querySelectorAll('.sortable-item[data-image-id]'))
          .map(el => el.dataset.imageId)
          .filter(id => id); // undefined を除外
        
        window.logger.debug('📋 New order:', imageIds);
        
        if (imageIds.length === 0) {
          window.logger.warn('⚠️ No image IDs found');
          return;
        }
        
        try {
          // サーバーに送信
          const response = await fetch('/api/reorder-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, imageIds })
          });
          
          const result = await response.json();
          
          if (response.ok) {
            window.logger.debug('✅ Order saved:', result);
          } else {
            window.logger.error('❌ Failed to save order:', result);
            alert('順序の保存に失敗しました');
            location.reload(); // 元の順序に戻す
          }
        } catch (error) {
          window.logger.error('💥 Error saving order:', error);
          alert('順序の保存中にエラーが発生しました');
          location.reload(); // 元の順序に戻す
        }
      }
    });
  });
});

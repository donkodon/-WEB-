// Dashboard Filter Bar Initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize date pickers
    flatpickr(".date-picker", {
        locale: "ja",
        dateFormat: "Y/m/d",
        allowInput: true
    });
    
    // Setup SKU checkbox event listeners
    window.logger.debug('🔘 Setting up SKU checkbox listeners...');
    const skuCheckboxes = document.querySelectorAll('input[name="sku-checkbox"]');
    window.logger.debug('📦 Found', skuCheckboxes.length, 'SKU checkboxes');
    
    skuCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const productId = this.dataset.productId;
            const checked = this.checked;
            window.logger.debug('🔄 SKU checkbox changed:', { productId, checked });
            window.toggleProductImages(productId, checked);
        });
    });
    
    // Setup image checkbox event listeners for updating SKU checkbox state
    const imageCheckboxes = document.querySelectorAll('input[name="image-select"]');
    window.logger.debug('📸 Found', imageCheckboxes.length, 'image checkboxes');
    
    imageCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const productId = this.dataset.productId;
            window.logger.debug('📷 Image checkbox changed for product:', productId);
            window.updateSkuCheckbox(productId);
        });
    });
    
    window.logger.debug('✅ SKU and image checkbox listeners set up');
});

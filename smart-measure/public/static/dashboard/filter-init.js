// Dashboard Filter Bar Initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize date pickers with change event
    const datePickers = document.querySelectorAll(".date-picker");
    const startDatePicker = datePickers[0];
    const endDatePicker = datePickers[1];
    
    flatpickr(startDatePicker, {
        locale: "ja",
        dateFormat: "Y/m/d",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            window.logger.debug('📅 Start date changed:', dateStr);
            applyDateFilter();
        }
    });
    
    flatpickr(endDatePicker, {
        locale: "ja",
        dateFormat: "Y/m/d",
        allowInput: true,
        onChange: function(selectedDates, dateStr, instance) {
            window.logger.debug('📅 End date changed:', dateStr);
            applyDateFilter();
        }
    });
    
    // Apply date filter function
    function applyDateFilter() {
        const startDate = startDatePicker.value;
        const endDate = endDatePicker.value;
        
        if (!startDate && !endDate) {
            window.logger.debug('⏭️ No date filter, skipping');
            return;
        }
        
        window.logger.debug('🔍 Applying date filter:', { startDate, endDate });
        
        // Convert YYYY/MM/DD to YYYY-MM-DD for API
        const formatDateForApi = (dateStr) => {
            if (!dateStr) return null;
            return dateStr.replace(/\//g, '-');
        };
        
        const params = new URLSearchParams(window.location.search);
        params.set('page', '1'); // Reset to first page
        
        // If only start date is selected, filter for that single day
        if (startDate && !endDate) {
            window.logger.debug('📅 Single date filter: showing only', startDate);
            params.set('startDate', formatDateForApi(startDate));
            params.delete('endDate');
        } 
        // If both dates are selected, use date range
        else if (startDate && endDate) {
            window.logger.debug('📅 Date range filter:', startDate, '~', endDate);
            params.set('startDate', formatDateForApi(startDate));
            params.set('endDate', formatDateForApi(endDate));
        }
        // If only end date is selected
        else if (!startDate && endDate) {
            window.logger.debug('📅 End date only filter: up to', endDate);
            params.delete('startDate');
            params.set('endDate', formatDateForApi(endDate));
        }
        
        // Reload page with new filters
        window.location.href = '/dashboard?' + params.toString();
    }
    
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
    
    // Restore date filters from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlStartDate = urlParams.get('startDate');
    const urlEndDate = urlParams.get('endDate');
    
    if (urlStartDate) {
        startDatePicker.value = urlStartDate.replace(/-/g, '/');
        window.logger.debug('📅 Restored start date from URL:', startDatePicker.value);
    }
    
    if (urlEndDate) {
        endDatePicker.value = urlEndDate.replace(/-/g, '/');
        window.logger.debug('📅 Restored end date from URL:', endDatePicker.value);
    }
});

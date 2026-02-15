/**
 * Dashboard Pagination Script
 * Handles client-side pagination and dynamic product loading
 * 
 * PERFORMANCE: All product data is loaded via API (CSR).
 * SSR only renders the shell/skeleton, reducing initial HTML from ~100KB+ to ~5KB.
 */

// Global state
let currentPage = 1;
let totalPages = 1;
let totalProducts = 0;
let isLoading = false;
const PER_PAGE = 12;

/**
 * Initialize: Load first page via API on DOMContentLoaded
 * Wait for authentication to complete before loading data
 */
document.addEventListener('DOMContentLoaded', () => {
    // Wait for authentication to complete (check every 100ms)
    const waitForAuth = setInterval(() => {
        const token = localStorage.getItem('firebase_token');
        if (token) {
            clearInterval(waitForAuth);
            console.log('✅ Auth ready, loading dashboard data...');
            loadPage(1, true);
        }
    }, 100);
    
    // Timeout after 10 seconds
    setTimeout(() => {
        clearInterval(waitForAuth);
        if (!localStorage.getItem('firebase_token')) {
            console.error('❌ Auth timeout - redirecting to login');
            window.location.href = '/firebase-login';
        }
    }, 10000);
});

/**
 * Load a specific page via AJAX
 * @param {number} page - Page number to load
 * @param {boolean} isInitial - Whether this is the initial load (skips duplicate check)
 */
async function loadPage(page, isInitial) {
    if (isLoading) return;
    if (!isInitial && (page < 1 || page > totalPages || page === currentPage)) return;
    
    isLoading = true;
    
    // Show loading indicator (skeleton on initial, overlay on subsequent)
    if (!isInitial) {
        showLoadingIndicator();
    }
    
    try {
        // Use authenticatedFetch (includes Authorization header with Firebase token)
        const response = await window.authenticatedFetch(`/api/dashboard/products?page=${page}&perPage=${PER_PAGE}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('📦 API Response:', {
            success: data.success,
            total: data.pagination?.total,
            totalPages: data.pagination?.totalPages,
            productsCount: data.products?.length,
            products: data.products
        });
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load products');
        }
        
        // Update state
        currentPage = data.pagination.page;
        totalPages = data.pagination.totalPages;
        totalProducts = data.pagination.total;
        
        // Render products
        console.log('🎨 Rendering', data.products.length, 'products');
        renderProducts(data.products);
        
        // Update pagination UI
        updatePaginationUI(data.pagination);
        
        // Scroll to top (only on page change, not initial load)
        if (!isInitial) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        // Initialize lazy loading for new images
        initializeLazyLoading();
        
    } catch (error) {
        console.error('Failed to load page:', error);
        const container = document.getElementById('products-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-5xl mb-4"></i>
                    <p class="text-lg mb-2">データの読み込みに失敗しました</p>
                    <button onclick="loadPage(${page}, true)" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mt-2">
                        <i class="fas fa-redo mr-1"></i>再読み込み
                    </button>
                </div>
            `;
        }
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

/**
 * Render products to the container
 */
function renderProducts(products) {
    const container = document.getElementById('products-container');
    
    if (!container) {
        console.error('Products container not found');
        return;
    }
    
    // Clear existing products
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-inbox text-5xl mb-4"></i>
                <p class="text-lg">商品が見つかりませんでした</p>
            </div>
        `;
        return;
    }
    
    // Build all HTML at once (single DOM write for performance)
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = products.map(product => createProductHTML(product)).join('');
    
    while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
    }
    
    container.appendChild(fragment);
    
    // Re-initialize Sortable for new image grids
    if (typeof initializeSortable === 'function') {
        initializeSortable();
    }
}

/**
 * Create HTML for a single product
 */
function createProductHTML(product) {
    const imagesHTML = product.images.map(img => createImageHTML(img, product)).join('');
    
    return `
        <div class="bg-white border border-gray-200 rounded-xl p-4 transition hover:shadow-md">
            <div class="mb-4">
                <div class="flex items-start justify-between">
                    <div class="flex items-start">
                        <input 
                            type="checkbox" 
                            name="sku-checkbox" 
                            data-product-id="${product.id}"
                            class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3 mt-1 cursor-pointer sku-checkbox" 
                        />
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="font-bold text-gray-800 text-lg">${escapeHtml(product.sku)}</h3>
                                ${product.rank ? `<span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded border border-gray-200">ランク: ${escapeHtml(product.rank)}</span>` : ''}
                                ${product.has_measurement ? `
                                    <a href="/landmarks/${encodeURIComponent(product.sku)}" class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 transition-colors flex items-center" title="ランドマークを編集">
                                        <i class="fas fa-map-marker-alt mr-1"></i>
                                        採寸データ
                                    </a>
                                ` : ''}
                            </div>
                            <p class="text-sm text-gray-600 font-medium mb-1 line-clamp-2">${escapeHtml(product.name)}</p>
                            <div class="flex items-center gap-3 text-xs text-gray-500">
                                ${product.price_sale ? `<span class="text-blue-600 font-bold text-sm">¥${Number(product.price_sale).toLocaleString()}</span>` : ''}
                                ${product.barcode ? `<span class="font-mono bg-gray-50 px-1 rounded"><i class="fas fa-barcode mr-1"></i>${escapeHtml(product.barcode)}</span>` : ''}
                                ${product.brand ? `<span>${escapeHtml(product.brand)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 image-grid" data-sku="${escapeHtml(product.sku)}">
                ${imagesHTML}
                
                <!-- Upload Button Tile -->
                <div class="relative group aspect-square bg-gray-50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all" onclick="document.getElementById('upload-input-${product.id}').click()">
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm mb-2 group-hover:scale-110 transition-transform">
                        <i class="fas fa-camera text-blue-500"></i>
                    </div>
                    <span class="text-xs font-bold text-gray-500 group-hover:text-blue-600">画像を追加</span>
                    <input 
                        type="file" 
                        id="upload-input-${product.id}" 
                        hidden 
                        accept="image/*" 
                        onchange="uploadImage('${product.id}', this)" 
                    />
                </div>
            </div>
        </div>
    `;
}

/**
 * Create HTML for a single image with lazy loading
 */
function createImageHTML(img, product) {
    const isMeasurement = img.is_measurement || false;
    const displayUrl = img.processed_url || img.original_url;
    
    return `
        <div class="${isMeasurement ? 'cursor-pointer' : 'cursor-move sortable-item'} relative group aspect-square" data-image-id="${img.id}">
            <div class="w-full h-full bg-white rounded-lg overflow-hidden border border-gray-100 relative">
                <img 
                    data-src="${displayUrl}" 
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Ctext fill='%239ca3af' font-family='sans-serif' font-size='18' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3E読込中...%3C/text%3E%3C/svg%3E"
                    class="lazy-image w-full h-full object-cover p-2" 
                    style="background-color: white;" 
                    alt="${escapeHtml(product.name)}"
                />
                
                ${!isMeasurement ? `
                    <div class="drag-handle absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded px-1.5 py-1 shadow-sm cursor-grab active:cursor-grabbing">
                        <i class="fas fa-grip-vertical text-gray-500 text-sm"></i>
                    </div>
                ` : ''}
                
                <div class="absolute top-2 left-2 z-10">
                    <input 
                        type="checkbox" 
                        name="image-select" 
                        data-image-id="${img.id}"
                        data-product-id="${product.id}"
                        data-sku="${escapeHtml(product.sku)}"
                        data-image-url="${img.original_url}"
                        data-is-measurement="${isMeasurement ? 'true' : 'false'}"
                        class="w-4 h-4 bg-white border-gray-300 rounded cursor-pointer image-checkbox ${isMeasurement ? 'measurement-checkbox' : ''}"
                        onclick="event.stopPropagation();"
                    />
                </div>
                
                ${isMeasurement ? `
                    <div class="absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded-full text-[10px] font-bold shadow-lg z-10">
                        <i class="fas fa-ruler mr-1"></i>採寸データ
                    </div>
                ` : ''}
                
                ${(isMeasurement || !img.processed_url) && img.status !== 'processing' && img.status !== 'completed' ? `
                    <button 
                        data-image-id="${img.id}"
                        data-sku="${escapeHtml(product.sku)}"
                        data-is-measurement="${isMeasurement ? 'true' : 'false'}"
                        onclick="event.stopPropagation(); handleRemoveBg(this)"
                        class="absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-lg z-10"
                    >
                        <i class="fas fa-magic mr-1"></i>白抜き
                    </button>
                ` : ''}
                
                ${img.status === 'processing' ? `
                    <div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-20">
                        <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <span class="text-white text-xs font-bold px-2 py-1 bg-white/20 rounded-full backdrop-blur">処理中...</span>
                    </div>
                ` : ''}
                
                ${img.processed_url ? `
                    <div class="absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                        <i class="fas fa-check mr-1"></i>完了
                    </div>
                ` : ''}
                
                ${isMeasurement && img.mask_url ? `
                    <button 
                        onclick="event.stopPropagation(); window.location.href='/mask-editor/${encodeURIComponent(product.sku)}'"
                        class="absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-purple-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-lg z-10"
                    >
                        <i class="fas fa-edit mr-1"></i>マスク編集
                    </button>
                ` : ''}
            </div>
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-pointer z-0" onclick="${isMeasurement ? `window.location.href='/landmarks/${encodeURIComponent(product.sku)}'` : `window.location.href='/edit/${img.id}'`}" data-image-id="${img.id}"></div>
        </div>
    `;
}

/**
 * HTML escape utility to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Initialize lazy loading for images using Intersection Observer
 */
function initializeLazyLoading() {
    const images = document.querySelectorAll('img.lazy-image');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    
                    if (src) {
                        img.src = src;
                        img.classList.remove('lazy-image');
                        observer.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px' // Start loading when image is 50px from viewport
        });
        
        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers without IntersectionObserver
        images.forEach(img => {
            const src = img.getAttribute('data-src');
            if (src) {
                img.src = src;
                img.classList.remove('lazy-image');
            }
        });
    }
}

/**
 * Update pagination UI
 */
function updatePaginationUI(pagination) {
    // Update info text
    const infoElement = document.getElementById('pagination-info');
    if (infoElement) {
        const start = (pagination.page - 1) * pagination.perPage + 1;
        const end = Math.min(pagination.page * pagination.perPage, pagination.total);
        infoElement.textContent = `全 ${pagination.total} 件中 ${start}-${end} 件を表示`;
    }
    
    // Update pagination controls
    const controlsElement = document.getElementById('pagination-controls');
    if (controlsElement) {
        controlsElement.innerHTML = `
            ${pagination.hasPrev ? `
                <button 
                    onclick="loadPage(1)" 
                    class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                    <i class="fas fa-angle-double-left"></i>
                </button>
                <button 
                    onclick="loadPage(${pagination.page - 1})"
                    class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                    <i class="fas fa-angle-left mr-1"></i>前
                </button>
            ` : ''}
            
            <span class="px-4 py-1 text-sm font-medium">
                ${pagination.page} / ${pagination.totalPages}
            </span>
            
            ${pagination.hasNext ? `
                <button 
                    onclick="loadPage(${pagination.page + 1})"
                    class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                    次<i class="fas fa-angle-right ml-1"></i>
                </button>
                <button 
                    onclick="loadPage(${pagination.totalPages})"
                    class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                    <i class="fas fa-angle-double-right"></i>
                </button>
            ` : ''}
        `;
    }
}

/**
 * Show loading indicator
 */
function showLoadingIndicator() {
    const container = document.getElementById('products-container');
    if (container) {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
    }
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
    const container = document.getElementById('products-container');
    if (container) {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    }
}

// Expose loadPage to global scope for onclick handlers
window.loadPage = loadPage;

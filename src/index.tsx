import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import { Layout } from './components'
import { Buffer } from 'node:buffer'

type Bindings = {
  DB: D1Database
  FAL_API_KEY?: string
  BRIA_API_KEY?: string
  BG_REMOVAL_API_URL?: string
  WITHOUTBG_API_URL?: string
  MOBILE_API_URL?: string
  IMAGE_UPLOAD_API_URL?: string
  PRODUCT_IMAGES?: R2Bucket
  AI: any // Cloudflare AI Workers binding
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes
app.use('/*', cors())

app.use(renderer)

// --- Helper: Init DB for Local Dev (Fix for separate SQLite instances) ---
app.get('/init', async (c) => {
  const sql = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products table (SKU)
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Images table
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      original_url TEXT NOT NULL,
      processed_url TEXT,
      status TEXT DEFAULT 'pending', 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    
    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_images_product_id ON images(product_id);

    -- Seed
    INSERT OR IGNORE INTO users (email, name) VALUES ('user@example.com', 'Kenji');

    INSERT OR IGNORE INTO products (sku, name, category) VALUES 
    ('TSHIRT-001-WHT', 'ベーシックコットンTシャツ（ホワイト）', 'Tops'),
    ('DNM-JCKT-NAVY', 'ヴィンテージデニムジャケット（ネイビー）', 'Outerwear'),
    ('SHIRT-LINEN-BEG', 'リネンシャツ（ベージュ）', 'Tops');

    INSERT OR IGNORE INTO images (product_id, original_url, processed_url, status) VALUES 
    (1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Front', 'https://placehold.co/400x400/transparent/white?text=T-Shirt+Front+Processed', 'completed'),
    (1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Back', NULL, 'pending'),
    (1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Detail', NULL, 'pending'),
    (2, 'https://placehold.co/400x400/brown/white?text=Jacket+Front', NULL, 'processing');
  `;

  // Split by semicolon and run each
  const statements = sql.split(';').filter(s => s.trim().length > 0);
  for (const stmt of statements) {
    await c.env.DB.prepare(stmt).run();
  }
  
  return c.text('Database initialized and seeded!');
})

// --- Helper: Fix Schema (Apply migration 0002 manually if needed) ---
app.get('/fix-schema', async (c) => {
    const alterations = [
        "ALTER TABLE products ADD COLUMN brand TEXT",
        "ALTER TABLE products ADD COLUMN brand_kana TEXT",
        "ALTER TABLE products ADD COLUMN size TEXT",
        "ALTER TABLE products ADD COLUMN color TEXT",
        "ALTER TABLE products ADD COLUMN category_sub TEXT",
        "ALTER TABLE products ADD COLUMN price_cost INTEGER",
        "ALTER TABLE products ADD COLUMN season TEXT",
        "ALTER TABLE products ADD COLUMN rank TEXT",
        "ALTER TABLE products ADD COLUMN release_date TEXT",
        "ALTER TABLE products ADD COLUMN buyer TEXT",
        "ALTER TABLE products ADD COLUMN store_name TEXT",
        "ALTER TABLE products ADD COLUMN price_ref INTEGER",
        "ALTER TABLE products ADD COLUMN price_sale INTEGER",
        "ALTER TABLE products ADD COLUMN price_list INTEGER",
        "ALTER TABLE products ADD COLUMN location TEXT",
        "ALTER TABLE products ADD COLUMN stock_quantity INTEGER",
        "ALTER TABLE products ADD COLUMN barcode TEXT",
        "ALTER TABLE products ADD COLUMN status TEXT"
    ];

    const results = [];
    for (const sql of alterations) {
        try {
            await c.env.DB.prepare(sql).run();
            results.push(`Success: ${sql}`);
        } catch (e: any) {
            results.push(`Skipped (or error): ${sql} -> ${e.message}`);
        }
    }
    return c.json(results);
})

// --- Login Page (Screenshot 1) ---
app.get('/', (c) => {
  return c.render(
    <Layout active="login">
      <div class="flex min-h-screen">
        {/* Left Side: Login Form */}
        <div class="w-full lg:w-1/2 p-12 flex flex-col justify-center bg-white">
          <div class="max-w-md mx-auto w-full">
            <div class="flex items-center mb-8">
              <div class="bg-blue-600 text-white p-1.5 rounded-md mr-2">
                <i class="fas fa-chart-simple"></i>
              </div>
              <span class="font-bold text-xl text-gray-900">SmartMeasure</span>
            </div>
            
            <h2 class="text-3xl font-bold mb-2 text-gray-900">ログイン</h2>
            <p class="text-gray-500 mb-8">採寸データにアクセスするには情報を入力してください。</p>
            
            <form action="/login" method="post" class="space-y-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input type="email" name="email" value="user@example.com" class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              
              <div>
                <div class="flex justify-between mb-1">
                  <label class="block text-sm font-medium text-gray-700">パスワード</label>
                  <a href="#" class="text-sm text-blue-600 hover:underline">お忘れですか？</a>
                </div>
                <div class="relative">
                  <input type="password" name="password" value="password" class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  <i class="fas fa-eye text-gray-400 absolute right-4 top-3.5 cursor-pointer"></i>
                </div>
              </div>
              
              <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-200">
                ログイン
              </button>
            </form>
            
            <div class="relative my-8">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-200"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-2 bg-white text-gray-500">または</span>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <button class="flex items-center justify-center py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <i class="fab fa-google text-red-500 mr-2"></i>
                <span class="text-sm font-medium text-gray-700">Google</span>
              </button>
              <button class="flex items-center justify-center py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <i class="fab fa-microsoft text-blue-500 mr-2"></i>
                <span class="text-sm font-medium text-gray-700">Microsoft</span>
              </button>
            </div>
            
            <div class="mt-8 text-center text-sm">
              <span class="text-gray-500">アカウントをお持ちでないですか？</span>
              <a href="#" class="text-blue-600 font-bold ml-1 hover:underline">新規登録</a>
            </div>
            
            <div class="mt-8 flex justify-center space-x-6 text-xs text-gray-400">
              <a href="#">プライバシーポリシー</a>
              <a href="#">利用規約</a>
            </div>
          </div>
        </div>
        
        {/* Right Side: Hero Image */}
        <div class="hidden lg:block w-1/2 bg-gray-900 relative overflow-hidden">
          <img src="https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?q=80&w=2070&auto=format&fit=crop" alt="Background" class="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div class="absolute bottom-0 left-0 p-12 text-white bg-gradient-to-t from-black/80 to-transparent w-full">
            <span class="inline-block px-3 py-1 bg-gray-700/50 rounded-full text-xs mb-4 backdrop-blur-sm">● システム稼働中</span>
            <h1 class="text-4xl font-bold mb-4 leading-tight">高精度な採寸。<br/>シームレスな連携。</h1>
            <p class="text-gray-300">採寸画像の自動処理、背景白抜き、ECサイトへのCSVデータ連携をスムーズに行います。</p>
            <div class="flex space-x-4 mt-8">
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-camera mr-2"></i> スマート撮影
              </div>
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-magic mr-2"></i> AI背景白抜き
              </div>
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-table mr-2"></i> CSV出力
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
})

app.post('/login', async (c) => {
  // Auto-sync images from Bubble on login
  try {
    const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
    
    if (c.env.PRODUCT_IMAGES) {
      console.log('🔄 Auto-syncing from R2 on login...');
      
      const list = await c.env.PRODUCT_IMAGES.list();
      let syncedCount = 0;
      
      for (const obj of list.objects) {
        const filename = obj.key;
        const parts = filename.replace('.jpg', '').split('_');
        
        if (parts.length < 3) continue;
        
        const sku = parts[0];
        const imageUrl = `${R2_PUBLIC_URL}/${filename}`;
        
        // Check if product exists, create if not
        const product = await c.env.DB.prepare(`
          SELECT id FROM products WHERE sku = ?
        `).bind(sku).first();
        
        if (!product) {
          await c.env.DB.prepare(`
            INSERT OR IGNORE INTO products (sku, name, category)
            VALUES (?, ?, ?)
          `).bind(sku, `商品 ${sku}`, 'Imported').run();
        }
        
        // Check if image already exists
        const existingImage = await c.env.DB.prepare(`
          SELECT id FROM images WHERE original_url = ?
        `).bind(imageUrl).first();
        
        if (!existingImage) {
          const timestamp = parts[2];
          await c.env.DB.prepare(`
            INSERT INTO images (product_id, original_url, status, created_at)
            SELECT id, ?, 'pending', datetime(?, 'unixepoch', 'subsec')
            FROM products WHERE sku = ?
          `).bind(imageUrl, parseInt(timestamp) / 1000, sku).run();
          
          syncedCount++;
        }
      }
      
      console.log(`✅ Auto-sync complete: ${syncedCount} new images`);
    }
  } catch (error) {
    console.error('⚠️ Auto-sync error (non-critical):', error);
    // Continue to dashboard even if sync fails
  }
  
  return c.redirect('/dashboard')
})

// --- Dashboard / Product List (Screenshot 2) ---
app.get('/dashboard', async (c) => {
  // 1. Get all SKUs from local DB (just for reference)
  const localProductsResult = await c.env.DB.prepare(`
    SELECT DISTINCT sku FROM products ORDER BY id DESC
  `).all();

  // 2. Fetch all images from local database
  const imagesResult = await c.env.DB.prepare(`
    SELECT * FROM images
  `).all();

  // 3. Fetch complete product data (master + items) from mobile app API
  const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
  const productsData = []; // Array of products with complete data
  
  console.log('🔄 Fetching complete product data from mobile app API...');
  
  for (const localProduct of localProductsResult.results) {
    const sku = (localProduct as any).sku;
    
    try {
      const response = await fetch(`${MOBILE_API_URL}/api/products/search?sku=${sku}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.product) {
          // Use mobile app data as the source of truth
          productsData.push({
            ...data.product,
            capturedItems: data.product.capturedItems || [],
            capturedCount: data.product.capturedCount || 0,
            latestItem: data.product.latestItem || null
          });
          
          console.log(`✅ Loaded product SKU ${sku}: ${data.product.name}, ${data.product.capturedCount} captured items`);
        }
      }
    } catch (e) {
      console.error(`❌ Failed to fetch product data for SKU ${sku}:`, e);
    }
  }

  // 4. Get local product master data (CSV origin)
  const localProductsMap = new Map();
  for (const lp of localProductsResult.results) {
    const sku = (lp as any).sku;
    const fullProduct = await c.env.DB.prepare(`
      SELECT * FROM products WHERE sku = ?
    `).bind(sku).first();
    
    if (fullProduct) {
      localProductsMap.set(sku, fullProduct);
    }
  }
  
  // 5. Merge local master data with mobile app data
  const products = [];
  
  for (const mobileData of productsData) {
    const sku = mobileData.sku;
    const localProduct = localProductsMap.get(sku);
    
    // Extract images from mobile app capturedItems
    const mobileImages = [];
    if (mobileData && mobileData.capturedItems && mobileData.capturedItems.length > 0) {
      for (const item of mobileData.capturedItems) {
        try {
          const imageUrls = JSON.parse(item.image_urls || '[]');
          for (const imageUrl of imageUrls) {
            mobileImages.push({
              id: `mobile_${item.item_code}`,
              original_url: imageUrl,
              processed_url: null,
              status: 'mobile',
              created_at: item.photographed_at || new Date().toISOString(),
              filename: item.item_code,
              // Store additional mobile data
              item_code: item.item_code,
              actual_measurements: item.actual_measurements,
              condition: item.condition,
              material: item.material,
              inspection_notes: item.inspection_notes
            });
          }
        } catch (e) {
          console.error('Failed to parse image_urls:', e);
        }
      }
    } else {
      // Fallback: Check R2 bucket for images if no captured items
      console.log(`⚠️ No capturedItems for SKU ${sku}, checking R2 bucket...`);
      const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
      
      // First, get DB images for this SKU (may already have processed R2 images)
      const dbImagesForSku = await c.env.DB.prepare(`
        SELECT i.* FROM images i
        JOIN products p ON i.product_id = p.id
        WHERE p.sku = ?
      `).bind(sku).all();
      
      // Create a map of original_url -> DB image for quick lookup
      const dbImagesByUrl = new Map();
      for (const dbImg of dbImagesForSku.results) {
        dbImagesByUrl.set((dbImg as any).original_url, dbImg);
      }
      
      for (let i = 1; i <= 10; i++) {
        const imageUrl = `${R2_PUBLIC_URL}/${sku}_${i}.jpg`;
        
        // Check if this R2 image is already in DB (with possible processed_url)
        const existingDbImage = dbImagesByUrl.get(imageUrl);
        
        if (existingDbImage) {
          // Use DB image data (may have processed_url)
          mobileImages.push({
            id: (existingDbImage as any).id,  // Use DB ID instead of r2_ prefix
            original_url: imageUrl,
            processed_url: (existingDbImage as any).processed_url || null,  // Keep processed URL!
            status: (existingDbImage as any).status || 'mobile',
            created_at: (existingDbImage as any).created_at || new Date().toISOString(),
            filename: `${sku}_${i}.jpg`,
            item_code: `${sku}_${i}`,
            actual_measurements: null,
            condition: 'Unknown',
            material: null,
            inspection_notes: null
          });
          
          console.log(`✅ Found R2 image in DB: ${sku}_${i}.jpg (processed: ${!!(existingDbImage as any).processed_url})`);
          continue;
        }
        
        try {
          const headResponse = await fetch(imageUrl, { method: 'HEAD' });
          
          if (headResponse.ok) {
            const lastModified = headResponse.headers.get('Last-Modified') || new Date().toUTCString();
            
            mobileImages.push({
              id: `r2_${sku}_${i}`,
              original_url: imageUrl,
              processed_url: null,
              status: 'mobile',
              created_at: lastModified,
              filename: `${sku}_${i}.jpg`,
              // Store placeholder mobile data
              item_code: `${sku}_${i}`,
              actual_measurements: null,
              condition: 'Unknown',
              material: null,
              inspection_notes: null
            });
            
            console.log(`✅ Found R2 image: ${sku}_${i}.jpg`);
          } else {
            // Stop checking further images
            console.log(`⏹️ No more R2 images found after ${sku}_${i-1}.jpg`);
            break;
          }
        } catch (e) {
          console.error(`❌ Failed to check R2 image ${sku}_${i}.jpg:`, e);
          break;
        }
      }
    }
    
    // Get DB images (only non-R2 images, as R2 images are now included in mobileImages with DB data)
    const dbImages = imagesResult.results.filter((i: any) => {
      // Match by SKU since product_id might be different
      if (localProduct) {
        // Filter: only include if it's a DB-uploaded image (not from R2)
        const originalUrl = (i as any).original_url || '';
        const isR2Image = originalUrl.includes('pub-300562464768499b8fcaee903d0f9861.r2.dev');
        return i.product_id === (localProduct as any).id && !isR2Image;
      }
      return false;
    });
    
    console.log(`📦 Product ${sku}: ${dbImages.length} DB images + ${mobileImages.length} mobile/R2 images`);
    
    // Merge images: mobileImages already contains R2 images with DB processed_url data
    // dbImages contains only non-R2 uploaded images
    // No duplication should occur now
    
    // Merge: Use mobile app data as primary source, fallback to local CSV data
    const mergedProduct = {
      // Base: Local CSV master data (fallback)
      ...(localProduct || {}),
      // Override with mobile app master data (primary source)
      // スマホアプリ側のデータを優先（CSVは初期データのみ）
      barcode: mobileData.barcode || (localProduct as any)?.barcode || null,
      name: mobileData.name || (localProduct as any)?.name || 'Unknown Product',
      brand: mobileData.brand || (localProduct as any)?.brand || null,
      size: mobileData.size || (localProduct as any)?.size || null,
      color: mobileData.color || (localProduct as any)?.color || null,
      price: mobileData.price || (localProduct as any)?.price || 0,
      price_sale: mobileData.price || (localProduct as any)?.price_sale || (localProduct as any)?.price || 0,
      category: mobileData.category || (localProduct as any)?.category || null,
      // Add mobile app captured data
      capturedItems: mobileData.capturedItems || [],
      capturedCount: mobileData.capturedCount || 0,
      latestItem: mobileData.latestItem || null,
      hasCapturedData: (mobileData.capturedCount || 0) > 0,
      images: [...dbImages, ...mobileImages],  // No duplicates: dbImages has non-R2, mobileImages has R2 with DB data
      // Timestamps
      created_at: mobileData.created_at || (localProduct as any)?.created_at,
      updated_at: mobileData.updated_at || (localProduct as any)?.updated_at
    };
    
    console.log(`✅ Merged product ${sku}: ${mergedProduct.name} (Brand: ${mergedProduct.brand}, Barcode: ${mergedProduct.barcode}, Price: ${mergedProduct.price})`);
    
    products.push(mergedProduct);
  }

  return c.render(
    <Layout active="dashboard" title="商品画像一覧（SKU別）">
      <div class="mb-6 flex justify-between items-end">
        <p class="text-gray-500 text-sm">撮影済み画像の管理・編集・ダウンロードが可能です。<span class="ml-2 text-blue-600 font-medium"><i class="fas fa-sync-alt mr-1"></i>Bubble画像は自動同期済み</span></p>
        <div class="flex space-x-3">
            <div class="relative inline-block text-left group">
                <div class="inline-flex shadow-sm rounded-lg" role="group">
                    <button id="btn-batch-remove-bg" class="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-l-lg hover:bg-blue-50 focus:z-10 focus:ring-2 focus:ring-blue-500 focus:text-blue-700 flex items-center">
                        <i class="fas fa-magic mr-2"></i>
                        選択画像を白抜き
                    </button>
                    <button type="button" class="px-2 py-2 text-sm font-medium text-blue-600 bg-white border-t border-b border-r border-blue-200 rounded-r-lg hover:bg-blue-50 focus:z-10 focus:ring-2 focus:ring-blue-500 focus:text-blue-700" id="btn-bg-dropdown-toggle">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                {/* Dropdown menu */}
                <div id="bg-model-dropdown" class="absolute right-0 z-50 hidden mt-2 w-64 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" role="menu">
                    <div class="py-1" role="none">
                        <div class="px-4 py-2 text-xs text-gray-500 font-bold uppercase border-b border-gray-100">モデル選択</div>
                        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 bg-blue-50 model-option" data-model="cloudflare-ai" role="menuitem">
                            <span class="flex items-center justify-between">
                                <span>rembg (推奨・無料)</span>
                                <i class="fas fa-check text-blue-600 check-icon"></i>
                            </span>
                        </button>
                        <button class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 model-option" data-model="birefnet-general" role="menuitem">
                            <span class="flex items-center justify-between">
                                <span>withoutbg (高品質)</span>
                                <i class="fas fa-check text-blue-600 check-icon hidden"></i>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
            <button id="btn-export-csv" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                <i class="fas fa-download mr-2"></i>
                CSV出力
            </button>
            <button id="btn-download-images" class="bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-lg flex items-center hover:bg-blue-50 transition-colors text-sm font-medium">
                <i class="fas fa-images mr-2"></i>
                元画像DL
            </button>
            <button id="btn-download-processed" class="bg-white border border-green-200 text-green-600 px-4 py-2 rounded-lg flex items-center hover:bg-green-50 transition-colors text-sm font-medium">
                <i class="fas fa-magic mr-2"></i>
                編集画像DL
            </button>
            <button id="btn-sync-mobile" class="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors text-sm font-medium">
                <i class="fas fa-sync-alt mr-2"></i>
                スマホから同期
            </button>
        </div>
      </div>
      
      {/* SKU Checkbox Toggle Functions */}
      <script dangerouslySetInnerHTML={{__html: `
        // Toggle all images when SKU checkbox is clicked
        window.toggleProductImages = function(productId, checked) {
            const imageCheckboxes = document.querySelectorAll('input[name="image-select"][data-product-id="' + productId + '"]');
            imageCheckboxes.forEach(cb => {
                cb.checked = checked;
            });
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
      `}} />
      
      {/* CSV Export and Image Download Scripts */}
      <script dangerouslySetInnerHTML={{__html: `
        // CSV Export Function
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
                    console.error('CSV export error:', e);
                    alert('CSVエクスポートに失敗しました: ' + e.message);
                } finally {
                    btnExportCSV.disabled = false;
                    btnExportCSV.innerHTML = '<i class="fas fa-download mr-2"></i>CSV出力';
                }
            });
        })();
        
        // Image Download Function
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
                            const response = await fetch('/api/download-image/' + imageId);
                            if (!response.ok) {
                                console.error('Failed to download image:', imageId);
                                continue;
                            }
                            
                            const data = await response.json();
                            if (!data.imageUrl || !data.filename) {
                                console.error('Invalid response for image:', imageId);
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
                                const imgResponse = await fetch(data.imageUrl);
                                blob = await imgResponse.blob();
                            }
                            
                            folder.file(data.filename, blob);
                            successCount++;
                        } catch (e) {
                            console.error('Error adding image ' + imageId + ' to ZIP:', e);
                        }
                    }
                    
                    // Generate and download ZIP
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    const timestamp = new Date().toISOString().slice(0, 10);
                    saveAs(zipBlob, 'original_images_' + timestamp + '.zip');
                    
                    alert('ダウンロード完了\\n成功: ' + successCount + '枚 / ' + imageIds.length + '枚');
                } catch (e) {
                    console.error('Image download error:', e);
                    alert('画像ダウンロードに失敗しました: ' + e.message);
                } finally {
                    btnDownloadImages.disabled = false;
                    btnDownloadImages.innerHTML = '<i class="fas fa-images mr-2"></i>画像ダウンロード';
                }
            });
        })();
        
        // Processed Image Download Function
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
                
                const confirmation = confirm(imageIds.length + '枚の編集済み画像（白抜き済み）をZIPでダウンロードしますか？');
                if (!confirmation) return;
                
                try {
                    btnDownloadProcessed.disabled = true;
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>ZIP作成中...';
                    
                    // Create ZIP file
                    const zip = new JSZip();
                    const folder = zip.folder('processed_images');
                    let successCount = 0;
                    let skipCount = 0;
                    
                    for (const imageId of imageIds) {
                        try {
                            const response = await fetch('/api/download-processed-image/' + imageId);
                            if (!response.ok) {
                                console.error('Failed to download processed image:', imageId);
                                skipCount++;
                                continue;
                            }
                            
                            const data = await response.json();
                            if (!data.imageUrl) {
                                console.warn('No processed image available for:', imageId);
                                skipCount++;
                                continue;
                            }
                            
                            if (!data.filename) {
                                console.error('Invalid response for image:', imageId);
                                skipCount++;
                                continue;
                            }
                            
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
                                
                                // Convert to blob and add to ZIP
                                canvas.toBlob((blob) => {
                                    folder.file(data.filename, blob);
                                }, 'image/png');
                                
                                successCount++;
                            } else {
                                // For regular URLs, fetch and add to ZIP
                                const imgResponse = await fetch(data.imageUrl);
                                const blob = await imgResponse.blob();
                                folder.file(data.filename, blob);
                                successCount++;
                            }
                        } catch (e) {
                            console.error('Error downloading processed image ' + imageId + ':', e);
                            skipCount++;
                        }
                    }
                    
                    // Generate and download ZIP
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    const timestamp = new Date().toISOString().slice(0, 10);
                    saveAs(zipBlob, 'processed_images_' + timestamp + '.zip');
                    
                    let message = 'ダウンロード完了\\n成功: ' + successCount + '枚';
                    if (skipCount > 0) {
                        message += '\\nスキップ（未処理）: ' + skipCount + '枚';
                    }
                    message += '\\n合計: ' + imageIds.length + '枚';
                    alert(message);
                } catch (e) {
                    console.error('Processed image download error:', e);
                    alert('編集画像ダウンロードに失敗しました: ' + e.message);
                } finally {
                    btnDownloadProcessed.disabled = false;
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-magic mr-2"></i>編集画像DL';
                }
            });
        })();
      `}} />
      
      {/* Background Removal Script */}
      <script dangerouslySetInnerHTML={{__html: `
        (function() {
            console.log('🚀 Background Removal Script Loaded!');
            
            // Global state for selected model
            window.currentBgModel = 'cloudflare-ai'; // Default - Cloudflare AI (free, built-in)
            
            function initBatchRemoveBg() {
                console.log('📌 initBatchRemoveBg called!');
                
                const batchBtn = document.getElementById('btn-batch-remove-bg');
                const dropdownToggle = document.getElementById('btn-bg-dropdown-toggle');
                const dropdown = document.getElementById('bg-model-dropdown');
                const modelOptions = document.querySelectorAll('.model-option');
                
                console.log('🔘 Batch button:', batchBtn);
                
                if (!batchBtn) {
                    console.error('❌ Batch button not found!');
                    return;
                }
                
                // 既にイベントリスナーが設定されているかチェック
                if (batchBtn.dataset.initialized === 'true') {
                    console.log('✅ Already initialized, skipping');
                    return;
                }
                batchBtn.dataset.initialized = 'true';
                
                // Dropdown Toggle
                if (dropdownToggle && dropdown) {
                    dropdownToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        dropdown.classList.toggle('hidden');
                    });
                    
                    // Close dropdown when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!dropdown.contains(e.target) && !dropdownToggle.contains(e.target)) {
                            dropdown.classList.add('hidden');
                        }
                    });
                    
                    // Model Selection
                    modelOptions.forEach(opt => {
                        opt.addEventListener('click', (e) => {
                            e.preventDefault();
                            const model = opt.dataset.model;
                            window.currentBgModel = model;
                            
                            // Update UI
                            modelOptions.forEach(o => {
                                o.classList.remove('bg-blue-50');
                                const check = o.querySelector('.check-icon');
                                if (check) check.classList.add('hidden');
                            });
                            
                            opt.classList.add('bg-blue-50');
                            const check = opt.querySelector('.check-icon');
                            if (check) check.classList.remove('hidden');
                            
                            // Close dropdown
                            dropdown.classList.add('hidden');
                            console.log('✅ Selected model:', window.currentBgModel);
                        });
                    });
                }
                
                console.log('✅ Adding click event listener to batch button');
                
                batchBtn.addEventListener('click', async function(e) {
                    e.preventDefault();
                    console.log('🖱️ BATCH BUTTON CLICKED!');
                    
                    // Get all checked image checkboxes (not SKU radios)
                    const checkedImages = document.querySelectorAll('input[name="image-select"]:checked');
                    
                    console.log('🔍 Found checked images:', checkedImages.length);
                    
                    if (checkedImages.length === 0) {
                        alert('画像を選択してください（各画像の左上のチェックボックスを選択）');
                        return;
                    }
                    
                    const modelName = window.currentBgModel === 'cloudflare-ai' ? 'rembg' : (window.currentBgModel === 'birefnet-general' ? 'withoutbg' : 'その他');
                    const confirmation = confirm(checkedImages.length + '枚の画像の背景を削除しますか？\\n使用モデル: ' + modelName);
                    if (!confirmation) return;
                    
                    batchBtn.disabled = true;
                    batchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>処理中...';
                    
                    let successCount = 0;
                    let failCount = 0;
                    
                    for (const checkbox of checkedImages) {
                        console.log('🔎 Processing checkbox:', checkbox);
                        
                        // Get image ID from data attribute
                        const imageId = checkbox.dataset.imageId;
                        console.log('✨ Image ID from data attribute:', imageId);
                        
                        if (!imageId) {
                            console.warn('⚠️ No image ID found, skipping');
                            failCount++;
                            continue;
                        }
                        
                        try {
                            console.log('🎨 Starting background removal for image ID:', imageId, 'with model:', window.currentBgModel);
                            const res = await fetch('/api/remove-bg-image/' + imageId, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: window.currentBgModel
                                })
                            });
                            
                            console.log('📡 Response status:', res.status, res.statusText);
                            
                            if (res.ok) {
                                const data = await res.json();
                                console.log('✅ Success for image', imageId, ':', data);
                                successCount++;
                                
                                // 即座に画面に反映する (リロード前に)
                                if (data.processedUrl) {
                                    const imageContainer = checkbox.closest('[data-image-id]') || checkbox.closest('.relative.group');
                                    if (imageContainer) {
                                        const imgElement = imageContainer.querySelector('img');
                                        if (imgElement) {
                                            imgElement.src = data.processedUrl;
                                            console.log('🖼️ Updated image display for:', imageId);
                                        }
                                        
                                        // 「白抜き」ボタンを非表示にし、「完了」バッジを表示
                                        const bgRemoveBtn = imageContainer.querySelector('button[onclick*="removeBgSingle"]');
                                        if (bgRemoveBtn) {
                                            bgRemoveBtn.remove();
                                        }
                                        
                                        // 完了バッジを追加
                                        const badgeContainer = imageContainer.querySelector('.w-full.h-full.bg-white');
                                        if (badgeContainer) {
                                            const completedBadge = document.createElement('div');
                                            completedBadge.className = 'absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-[10px] font-bold opacity-100 shadow-lg z-10';
                                            completedBadge.innerHTML = '<i class="fas fa-check mr-1"></i>完了';
                                            badgeContainer.appendChild(completedBadge);
                                        }
                                    }
                                }
                            } else {
                                const errorText = await res.text();
                                console.error('❌ Failed for image', imageId, ':', errorText);
                                failCount++;
                            }
                        } catch (e) {
                            console.error('💥 Error processing image ' + imageId, ':', e);
                            failCount++;
                        }
                    }
                    
                    batchBtn.disabled = false;
                    batchBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>選択画像を白抜き';
                    
                    alert('処理完了\\n成功: ' + successCount + '枚\\n失敗: ' + failCount + '枚');
                    if (successCount > 0) {
                        window.location.reload();
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
      `}} />
      
      {/* Mobile App Sync Script */}
      <script dangerouslySetInnerHTML={{__html: `
        (function() {
            const btnSyncMobile = document.getElementById('btn-sync-mobile');
            
            if (!btnSyncMobile) {
                console.error('❌ Sync mobile button not found!');
                return;
            }
            
            btnSyncMobile.addEventListener('click', async function() {
                const confirmation = confirm('スマホアプリから商品データを同期しますか？\\n既存のデータは上書きされます。');
                
                if (!confirmation) return;
                
                // Show loading state
                btnSyncMobile.disabled = true;
                btnSyncMobile.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>同期中...';
                
                try {
                    const response = await fetch('/api/sync-from-mobile', {
                        method: 'POST'
                    });
                    
                    if (!response.ok) {
                        throw new Error('Sync failed with status: ' + response.status);
                    }
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert('✅ 同期完了\\n\\n同期: ' + data.synced + '件\\nスキップ: ' + data.skipped + '件\\n合計: ' + data.total + '件');
                        window.location.reload();
                    } else {
                        throw new Error(data.error || 'Unknown error');
                    }
                } catch (e) {
                    console.error('Sync error:', e);
                    alert('❌ 同期に失敗しました: ' + e.message);
                } finally {
                    btnSyncMobile.disabled = false;
                    btnSyncMobile.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>スマホから同期';
                }
            });
            
            console.log('✅ Mobile sync button initialized');
        })();
      `}} />

      {/* Filter Bar */}
      <div class="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex space-x-4 flex-1">
          <div class="relative flex-1 max-w-md">
            <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
            <input type="text" placeholder="SKUコードまたは商品名で検索..." class="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div class="relative w-72 flex items-center">
            <div class="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden w-full focus-within:ring-2 focus-within:ring-blue-500">
                <div class="px-3 py-2.5 text-gray-400 bg-gray-50 border-r border-gray-200">
                    <i class="fas fa-calendar"></i>
                </div>
                <input type="text" class="date-picker w-full p-2 text-sm text-center focus:outline-none" placeholder="開始日" />
                <span class="text-gray-400 px-1">~</span>
                <input type="text" class="date-picker w-full p-2 text-sm text-center focus:outline-none" placeholder="終了日" />
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{__html: `
            document.addEventListener('DOMContentLoaded', function() {
                flatpickr(".date-picker", {
                    locale: "ja",
                    dateFormat: "Y/m/d",
                    allowInput: true
                });
            });
        `}} />
        <div class="flex items-center space-x-2">
            <span class="text-gray-500 text-sm">表示切替:</span>
            <button class="p-2 bg-gray-100 rounded text-gray-700"><i class="fas fa-th-large"></i></button>
            <button class="p-2 text-gray-400 hover:bg-gray-50 rounded"><i class="fas fa-list"></i></button>
        </div>
      </div>

      {/* Product List */}
      <div class="space-y-6">
        {products.map((product: any) => (
          <div class="bg-white border border-gray-200 rounded-xl p-4 transition hover:shadow-md">
            <div class="mb-4">
                <div class="flex items-start justify-between">
                    <div class="flex items-start">
                        <input 
                            type="checkbox" 
                            name="sku-checkbox" 
                            data-product-id={product.id}
                            class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3 mt-1 cursor-pointer sku-checkbox" 
                            onchange={`toggleProductImages(${product.id}, this.checked)`}
                        />
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="font-bold text-gray-800 text-lg">{product.sku}</h3>
                                {product.rank && <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded border border-gray-200">ランク: {product.rank}</span>}
                            </div>
                            <p class="text-sm text-gray-600 font-medium mb-1 line-clamp-2">{product.name}</p>
                            <div class="flex items-center gap-3 text-xs text-gray-500">
                                {product.price_sale && <span class="text-blue-600 font-bold text-sm">¥{product.price_sale.toLocaleString()}</span>}
                                {product.barcode && <span class="font-mono bg-gray-50 px-1 rounded"><i class="fas fa-barcode mr-1"></i>{product.barcode}</span>}
                                {product.brand && <span>{product.brand}</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* Debug Info */}
                {product.images.length === 0 && (
                  <div class="col-span-full text-center py-8 text-gray-400">
                    <i class="fas fa-image text-3xl mb-2"></i>
                    <p class="text-sm">画像がありません（SKU: {product.sku}）</p>
                  </div>
                )}
                
                {/* Existing Images */}
                {product.images.map((img: any) => (
                   <div class="relative group aspect-square" data-image-id={img.id}>
                       <div class="w-full h-full bg-white rounded-lg overflow-hidden border border-gray-100 relative">
                           <img src={img.processed_url || img.original_url} class="w-full h-full object-cover p-2" style="background-color: white;" />
                           <div class="absolute top-2 left-2 z-10">
                               <input 
                                   type="checkbox" 
                                   name="image-select" 
                                   data-image-id={img.id}
                                   data-product-id={product.id}
                                   class="w-4 h-4 bg-white border-gray-300 rounded cursor-pointer image-checkbox" 
                                   onclick="event.stopPropagation();"
                                   onchange={`updateSkuCheckbox(${product.id})`}
                               />
                           </div>
                           
                           {/* Quick Remove BG Button */}
                           {!img.processed_url && img.status !== 'processing' && (
                               <button 
                                   onclick={`event.stopPropagation(); removeBgSingle(${img.id}, this)`}
                                   class="absolute bottom-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center shadow-lg z-10"
                               >
                                   <i class="fas fa-magic mr-1"></i>白抜き
                               </button>
                           )}
                           
                           {img.status === 'processing' && (
                               <div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-20">
                                   <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                   <span class="text-white text-xs font-bold px-2 py-1 bg-white/20 rounded-full backdrop-blur">処理中...</span>
                               </div>
                           )}
                           
                           {img.processed_url && (
                               <div class="absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                                   <i class="fas fa-check mr-1"></i>完了
                               </div>
                           )}
                       </div>
                       <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-pointer z-0" onclick={`window.location.href='/edit/${img.id}'`} data-image-id={img.id}></div>
                   </div> 
                ))}

                {/* Upload Button Tile */}
                <div class="relative group aspect-square bg-gray-50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all" onclick={`document.getElementById('upload-input-${product.id}').click()`}>
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm mb-2 group-hover:scale-110 transition-transform">
                        <i class="fas fa-camera text-blue-500"></i>
                    </div>
                    <span class="text-xs font-bold text-gray-500 group-hover:text-blue-600">画像を追加</span>
                    <input 
                        type="file" 
                        id={`upload-input-${product.id}`} 
                        hidden 
                        accept="image/*" 
                        onchange={`uploadImage(${product.id}, this)`} 
                    />
                </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Single Image Background Removal */}
      <script dangerouslySetInnerHTML={{__html: `
        window.removeBgSingle = async function(imageId, button) {
            console.log('🎯 removeBgSingle called with imageId:', imageId);
            
            const confirmation = confirm('この画像の背景を削除しますか？');
            if (!confirmation) return;
            
            // Show loading state
            const originalContent = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>処理中';
            
            try {
                console.log('📡 Sending request to /api/remove-bg-image/' + imageId);
                const res = await fetch('/api/remove-bg-image/' + imageId, {
                    method: 'POST'
                });
                
                console.log('📨 Response received:', res.status, res.statusText);
                
                if (res.ok) {
                    const data = await res.json();
                    console.log('✅ Success:', data);
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
                    console.error('❌ Error:', errorMsg);
                    alert('エラー: ' + errorMsg);
                    button.innerHTML = originalContent;
                    button.disabled = false;
                }
            } catch (e) {
                console.error('💥 Network error:', e);
                alert('通信エラーが発生しました: ' + e.message);
                button.innerHTML = originalContent;
                button.disabled = false;
            }
        };
        console.log('✅ removeBgSingle function registered globally');
      `}} />
      
      {/* Upload Script */}
      <script dangerouslySetInnerHTML={{__html: `
        async function uploadImage(productId, input) {
            if (!input.files || !input.files[0]) return;
            
            const file = input.files[0];
            const formData = new FormData();
            formData.append('image', file);
            formData.append('productId', productId);

            // Show loading state (simple UI feedback)
            const parent = input.parentElement;
            const originalContent = parent.innerHTML;
            parent.innerHTML = '<div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>';
            parent.classList.remove('cursor-pointer', 'hover:border-blue-500');

            try {
                const res = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    // Reload to show new image
                    window.location.reload();
                } else {
                    alert('アップロードに失敗しました');
                    parent.innerHTML = originalContent; // Revert on error
                }
            } catch (e) {
                console.error(e);
                alert('通信エラーが発生しました');
                parent.innerHTML = originalContent;
            }
        }
      `}} />
      
      <div class="mt-8 flex justify-between items-center text-sm text-gray-500">
          <span>全 {products.length} 件を表示中</span>
      </div>
    </Layout>
  )
})

// --- API: Image Upload Endpoint ---
app.post('/api/upload-image', async (c) => {
    const body = await c.req.parseBody();
    const file = body['image'];
    const productId = body['productId'];

    if (!file || !(file instanceof File) || !productId) {
        return c.text('Invalid upload', 400);
    }

    // In a real app, upload to R2/S3 here.
    // For Sandbox, convert to Base64 to store in D1 (Prototype mode)
    const buffer = await file.arrayBuffer();
    // Safe Base64 conversion using Buffer
    const base64String = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64String}`;

    await c.env.DB.prepare(`
        INSERT INTO images (product_id, original_url, status)
        VALUES (?, ?, 'pending')
    `).bind(productId, dataUrl).run();

    return c.json({ success: true });
});

// --- Editor (Screenshot 3) ---
app.get('/edit/:id', async (c) => {
  const id = c.req.param('id')
  
  // Get image from database
  const imageResult = await c.env.DB.prepare(`
    SELECT i.*, p.sku, p.name as product_name 
    FROM images i 
    LEFT JOIN products p ON i.product_id = p.id 
    WHERE i.id = ?
  `).bind(id).first();
  
  if (!imageResult) {
    return c.redirect('/dashboard');
  }
  
  // Use processed image if available, otherwise original
  const imageSrc = (imageResult.processed_url || imageResult.original_url) as string;
  const originalSrc = imageResult.original_url as string;
  const isProcessed = !!imageResult.processed_url;
  const productSku = imageResult.sku || 'Unknown';
  const productName = imageResult.product_name || '';

  return c.render(
    <Layout active="dashboard" title="画像処理プレビュー">
        <div class="flex justify-between items-center -mt-6 mb-6">
            <div class="text-sm breadcrumbs text-gray-500">
                <a href="/dashboard" class="hover:text-blue-600">ダッシュボード</a> <span class="mx-2">›</span>
                <a href="#" class="hover:text-blue-600">商品登録</a> <span class="mx-2">›</span>
                <span class="text-gray-800 font-medium">画像処理プレビュー</span>
            </div>
            <div class="flex space-x-3">
                 <button id="btn-toggle-original" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                    <i class="fas fa-image mr-2"></i> 元画像を確認
                 </button>
                 <button onclick="window.location.reload()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                    <i class="fas fa-history mr-2"></i> リセット
                 </button>
            </div>
        </div>

        <div class="flex gap-4 h-[calc(100vh-140px)]">
            {/* Left Sidebar: Tools */}
            <div class="w-72 bg-white border border-gray-200 rounded-xl p-4 flex flex-col overflow-y-auto">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-sliders-h mr-2"></i> 編集ツール</h3>
                    <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">v2.0</span>
                </div>

                {/* Sliders */}
                <div class="space-y-3 mb-4">
                    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">画像調整</div>
                    
                    <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>明るさ</span>
                            <span id="val-brightness" class="text-blue-600">0</span>
                        </div>
                        <input type="range" id="range-brightness" min="-100" max="100" value="0" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>WB</span>
                            <span id="val-wb" class="text-blue-600">5500K</span>
                        </div>
                        <input type="range" id="range-wb" min="2000" max="9000" step="100" value="5500" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                     <div>
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span>色味</span>
                            <span id="val-hue" class="text-blue-600">0°</span>
                        </div>
                        <input type="range" id="range-hue" min="-180" max="180" value="0" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                </div>

                {/* Background Selection (Static for now) */}
                <div class="mb-4">
                    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">背景色</div>
                    <div class="flex space-x-2">
                         <div class="w-9 h-9 rounded-lg bg-gray-100 border-2 border-transparent hover:border-blue-400 cursor-pointer overflow-hidden relative" onclick="alert('透明背景モード')">
                            <div class="absolute inset-0 opacity-50" style="background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 4px 4px;"></div>
                            <div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-ban text-gray-400 text-xs"></i></div>
                         </div>
                         <div class="w-9 h-9 rounded-lg bg-white border-2 border-blue-600 cursor-pointer relative shadow-sm">
                             <div class="absolute -bottom-1.5 -right-1.5 bg-blue-600 text-white text-[8px] px-1 py-0 rounded-full font-bold">ON</div>
                         </div>
                         <div class="w-9 h-9 rounded-lg bg-gray-100 border-2 border-transparent hover:border-blue-400 cursor-pointer"></div>
                         <div class="w-9 h-9 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer flex items-center justify-center">
                             <i class="fas fa-palette text-gray-400 text-xs"></i>
                         </div>
                    </div>
                </div>

                {/* Manual Tools */}
                <div class="mb-4">
                     <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">手動修正</div>
                     <div class="grid grid-cols-3 gap-2">
                         <button id="btn-crop" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-crop-alt mb-1 text-sm"></i>
                             <span class="text-[10px]">切り抜き</span>
                         </button>
                         <button id="btn-brush" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-paint-brush mb-1 text-sm"></i>
                             <span class="text-[10px]">ブラシ</span>
                         </button>
                         <button id="btn-eraser" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                             <i class="fas fa-eraser mb-1 text-sm"></i>
                             <span class="text-[10px]">消しゴム</span>
                         </button>
                     </div>
                </div>

                {/* Brush Size */}
                <div class="mb-4">
                    <div class="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                        <span><i class="fas fa-ruler-horizontal mr-1"></i> ブラシサイズ</span>
                        <span id="val-size" class="text-blue-600">24px</span>
                    </div>
                    <input type="range" id="range-size" min="1" max="100" value="24" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>

                {/* Options & Actions */}
                 <div class="mt-auto pt-4 border-t border-gray-100">
                    <label class="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 mb-3">
                        <input type="checkbox" checked class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                        <span class="text-xs font-medium text-gray-700">影を保持する</span>
                    </label>

                     <div class="space-y-2">
                         <button id="btn-save" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
                             <i class="fas fa-save mr-2"></i> 保存して次へ
                         </button>
                         <button class="w-full bg-white hover:bg-gray-50 text-gray-500 font-medium py-2 rounded-lg transition-colors text-sm border border-transparent hover:border-gray-200">
                             キャンセル
                         </button>
                     </div>
                 </div>
            </div>

            {/* Main Preview Area */}
            <div class="flex-1 bg-white border border-gray-200 rounded-xl p-4 flex flex-col">
                <div class="flex items-center justify-between mb-4 px-2">
                     <div class="flex space-x-2">
                         <button class="p-2 text-gray-500 hover:text-blue-600"><i class="fas fa-search-plus"></i></button>
                         <button class="p-2 text-gray-500 hover:text-blue-600"><i class="fas fa-search-minus"></i></button>
                     </div>
                     <span class="text-xs font-mono text-gray-400">{productSku}_image_{id}.png</span>
                </div>
                
                <div id="canvas-container" class="flex-1 bg-gray-50 border border-gray-100 rounded-lg relative overflow-hidden flex items-center justify-center" style="background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;">
                    <div class="relative shadow-2xl">
                         <canvas id="main-canvas" class="max-h-[600px] max-w-full object-contain cursor-crosshair"></canvas>
                         {isProcessed ? (
                             <div class="absolute top-4 left-4 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm pointer-events-none">
                                 <i class="fas fa-check text-[8px] mr-1"></i> 白抜き済み
                             </div>
                         ) : (
                             <div class="absolute top-4 left-4 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm pointer-events-none">
                                 <i class="fas fa-circle text-[8px] mr-1"></i> 元画像
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>

        {/* --- IMAGE PROCESSING LOGIC --- */}
        <script dangerouslySetInnerHTML={{__html: `
            document.addEventListener('DOMContentLoaded', () => {
                const canvas = document.getElementById('main-canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.crossOrigin = "Anonymous";
                
                // Image sources from database
                const processedSrc = "${imageSrc}";
                const originalSrc = "${originalSrc}";
                const isProcessed = ${isProcessed};
                let showingOriginal = false;
                
                img.src = processedSrc;
                
                // --- STATE ---
                let state = {
                    brightness: 0,
                    wb: 5500,
                    hue: 0,
                    tool: 'none', // 'brush', 'eraser', 'crop'
                    brushSize: 24,
                    isDrawing: false,
                    isDragging: false,
                    cropStart: {x: 0, y: 0},
                    cropRect: {x: 0, y: 0, w: 0, h: 0}
                };

                // --- MASK CANVAS (Stores manual strokes) ---
                const maskCanvas = document.createElement('canvas');
                const maskCtx = maskCanvas.getContext('2d');

                // --- UI ELEMENTS ---
                const els = {
                    brightness: document.getElementById('range-brightness'),
                    wb: document.getElementById('range-wb'),
                    hue: document.getElementById('range-hue'),
                    size: document.getElementById('range-size'),
                    
                    valBrightness: document.getElementById('val-brightness'),
                    valWb: document.getElementById('val-wb'),
                    valHue: document.getElementById('val-hue'),
                    valSize: document.getElementById('val-size'),
                    
                    btnBrush: document.getElementById('btn-brush'),
                    btnEraser: document.getElementById('btn-eraser'),
                    btnCrop: document.getElementById('btn-crop'),
                    btnSave: document.getElementById('btn-save'),
                    btnToggleOriginal: document.getElementById('btn-toggle-original')
                };
                
                // --- Toggle Original/Processed Image ---
                if (els.btnToggleOriginal && isProcessed) {
                    els.btnToggleOriginal.addEventListener('click', () => {
                        showingOriginal = !showingOriginal;
                        img.src = showingOriginal ? originalSrc : processedSrc;
                        els.btnToggleOriginal.innerHTML = showingOriginal 
                            ? '<i class="fas fa-magic mr-2"></i> 処理後を表示'
                            : '<i class="fas fa-image mr-2"></i> 元画像を確認';
                    });
                } else if (els.btnToggleOriginal) {
                    els.btnToggleOriginal.style.display = 'none';
                }

                // --- INIT ---
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    maskCanvas.width = img.width;
                    maskCanvas.height = img.height;
                    render();
                };

                // --- RENDER LOOP ---
                function render() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // 1. Filters
                    const bVal = 100 + parseInt(state.brightness);
                    const hVal = parseInt(state.hue);
                    ctx.filter = 'brightness(' + bVal + '%) hue-rotate(' + hVal + 'deg)';
                    
                    // 2. Draw Image
                    ctx.drawImage(img, 0, 0);
                    ctx.filter = 'none';

                    // 3. WB Overlay
                    if (state.wb != 5500) {
                         ctx.save();
                         ctx.globalCompositeOperation = 'overlay';
                         if (state.wb > 5500) {
                             const intensity = (state.wb - 5500) / 3500 * 0.4;
                             ctx.fillStyle = 'rgba(255, 140, 0, ' + intensity + ')';
                         } else {
                             const intensity = (5500 - state.wb) / 3500 * 0.4;
                             ctx.fillStyle = 'rgba(0, 100, 255, ' + intensity + ')';
                         }
                         ctx.fillRect(0, 0, canvas.width, canvas.height);
                         ctx.restore();
                    }

                    // 4. Mask
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.drawImage(maskCanvas, 0, 0);
                    ctx.restore();

                    // 5. Crop Selection (Overlay)
                    if (state.tool === 'crop' && state.cropRect.w !== 0) {
                        ctx.save();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.strokeRect(state.cropRect.x, state.cropRect.y, state.cropRect.w, state.cropRect.h);
                        
                        // Darken outside
                        ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        // Top
                        ctx.fillRect(0, 0, canvas.width, state.cropRect.y);
                        // Bottom
                        ctx.fillRect(0, state.cropRect.y + state.cropRect.h, canvas.width, canvas.height - (state.cropRect.y + state.cropRect.h));
                        // Left
                        ctx.fillRect(0, state.cropRect.y, state.cropRect.x, state.cropRect.h);
                        // Right
                        ctx.fillRect(state.cropRect.x + state.cropRect.w, state.cropRect.y, canvas.width - (state.cropRect.x + state.cropRect.w), state.cropRect.h);
                        ctx.restore();
                    }
                }

                // --- TOOL SELECTION ---
                const setTool = (tool) => {
                    state.tool = (state.tool === tool) ? 'none' : tool;
                    
                    ['btnBrush', 'btnEraser', 'btnCrop'].forEach(k => {
                        els[k].classList.remove('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    });
                    
                    if (state.tool === 'brush') els.btnBrush.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    if (state.tool === 'eraser') els.btnEraser.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    if (state.tool === 'crop') els.btnCrop.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    
                    // Reset crop if changing tool
                    if (state.tool !== 'crop') state.cropRect = {x:0, y:0, w:0, h:0};
                    render();
                };

                // --- CROP LOGIC ---
                const applyCrop = () => {
                    if (state.cropRect.w < 10 || state.cropRect.h < 10) return;
                    
                    const confirmCrop = confirm('選択範囲で切り抜きますか？');
                    if (!confirmCrop) {
                        state.cropRect = {x:0, y:0, w:0, h:0};
                        render();
                        return;
                    }

                    // Create temp canvas to extract
                    const tCanvas = document.createElement('canvas');
                    tCanvas.width = state.cropRect.w;
                    tCanvas.height = state.cropRect.h;
                    const tCtx = tCanvas.getContext('2d');

                    // Draw only the selected part
                    // Note: We need to draw the CURRENT state (filters etc) or just the raw image?
                    // Usually crop happens on raw image for quality, but here we are just simulating.
                    // Let's crop the raw image to keep quality high.
                    tCtx.drawImage(img, state.cropRect.x, state.cropRect.y, state.cropRect.w, state.cropRect.h, 0, 0, state.cropRect.w, state.cropRect.h);

                    // Update main image
                    img.src = tCanvas.toDataURL();
                    // On img.onload, canvas will resize automatically
                    state.cropRect = {x:0, y:0, w:0, h:0};
                    state.tool = 'none'; // Exit crop mode
                    setTool('none');
                };

                // --- SAVE LOGIC ---
                els.btnSave.addEventListener('click', async () => {
                    // Get canvas data as base64
                    const imageData = canvas.toDataURL('image/png');
                    
                    // Show saving state
                    els.btnSave.disabled = true;
                    els.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 保存中...';
                    
                    try {
                        // Save to database via API
                        const response = await fetch('/api/save-edited-image/${id}', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                imageData: imageData
                            })
                        });
                        
                        if (response.ok) {
                            alert('編集内容を保存しました！');
                            window.location.href = '/dashboard';
                        } else {
                            const error = await response.json();
                            alert('保存に失敗しました: ' + (error.details || error.error));
                            els.btnSave.disabled = false;
                            els.btnSave.innerHTML = '<i class="fas fa-save mr-2"></i> 保存して次へ';
                        }
                    } catch (e) {
                        console.error('Save error:', e);
                        alert('保存中にエラーが発生しました');
                        els.btnSave.disabled = false;
                        els.btnSave.innerHTML = '<i class="fas fa-save mr-2"></i> 保存して次へ';
                    }
                });

                // --- MOUSE EVENTS ---
                const getPos = (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    return {
                        x: (e.clientX - rect.left) * scaleX,
                        y: (e.clientY - rect.top) * scaleY
                    };
                };

                canvas.addEventListener('mousedown', (e) => {
                    state.isDrawing = true;
                    const pos = getPos(e);
                    
                    if (state.tool === 'crop') {
                        state.cropStart = pos;
                        state.cropRect = {x: pos.x, y: pos.y, w: 0, h: 0};
                    } else {
                        // Brush/Eraser logic
                        if (state.tool !== 'none') {
                            maskCtx.beginPath();
                            maskCtx.moveTo(pos.x, pos.y);
                        }
                    }
                });

                canvas.addEventListener('mousemove', (e) => {
                    if (!state.isDrawing) return;
                    const pos = getPos(e);

                    if (state.tool === 'crop') {
                        let w = pos.x - state.cropStart.x;
                        let h = pos.y - state.cropStart.y;
                        
                        // Handle negative selection
                        let startX = state.cropStart.x;
                        let startY = state.cropStart.y;
                        if (w < 0) { startX = pos.x; w = Math.abs(w); }
                        if (h < 0) { startY = pos.y; h = Math.abs(h); }
                        
                        state.cropRect = {x: startX, y: startY, w: w, h: h};
                        render();
                    } else if (state.tool !== 'none') {
                        maskCtx.lineWidth = state.brushSize * 2;
                        maskCtx.lineCap = 'round';
                        maskCtx.lineJoin = 'round';
                        
                        if (state.tool === 'eraser') {
                            maskCtx.globalCompositeOperation = 'source-over';
                            maskCtx.strokeStyle = 'rgba(0,0,0,1)';
                        } else {
                            maskCtx.globalCompositeOperation = 'destination-out';
                            maskCtx.strokeStyle = 'rgba(0,0,0,1)';
                        }
                        maskCtx.lineTo(pos.x, pos.y);
                        maskCtx.stroke();
                        maskCtx.beginPath();
                        maskCtx.moveTo(pos.x, pos.y);
                        requestAnimationFrame(render);
                    }
                });

                const endAction = () => {
                    if (!state.isDrawing) return;
                    state.isDrawing = false;
                    
                    if (state.tool === 'crop') {
                        applyCrop();
                    } else {
                        maskCtx.beginPath();
                    }
                };

                canvas.addEventListener('mouseup', endAction);
                canvas.addEventListener('mouseout', () => state.isDrawing = false);

                // --- SLIDER EVENTS ---
                const updateState = (key, val, displayEl, suffix = '') => {
                    state[key] = val;
                    if(displayEl) displayEl.innerText = val + suffix;
                    requestAnimationFrame(render);
                };
                els.brightness.addEventListener('input', (e) => updateState('brightness', e.target.value, els.valBrightness));
                els.wb.addEventListener('input', (e) => updateState('wb', e.target.value, els.valWb, 'K'));
                els.hue.addEventListener('input', (e) => updateState('hue', e.target.value, els.valHue, '°'));
                els.size.addEventListener('input', (e) => updateState('brushSize', e.target.value, els.valSize, 'px'));
                
                els.btnBrush.addEventListener('click', () => setTool('brush'));
                els.btnEraser.addEventListener('click', () => setTool('eraser'));
                els.btnCrop.addEventListener('click', () => setTool('crop'));
            });
        `}} />
    </Layout>
  )
})

// --- Settings / Import-Export (Screenshot 4) ---
app.get('/settings', (c) => {
  return c.render(
    <Layout active="settings" title="データ入力・設定">
        <div class="mb-8">
            <p class="text-gray-500">在庫CSVのインポートや、撮影画像の白抜き処理・一括エクスポート、ファイル命名規則の設定を行います。</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* CSV Import */}
            <div class="bg-white border border-gray-200 rounded-xl p-6">
                 <h3 class="font-bold text-lg text-gray-800 mb-4 flex items-center">
                     <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                         <i class="fas fa-file-csv"></i>
                     </div>
                     CSVインポート (在庫更新)
                 </h3>
                 
                 <div class="border-2 border-dashed border-blue-100 bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-colors h-64 relative">
                     <input type="file" id="csv-input" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".csv" />
                     <div class="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mb-4 text-blue-500 text-2xl">
                         <i class="fas fa-cloud-upload-alt"></i>
                     </div>
                     <p id="file-name" class="font-bold text-blue-600 mb-1">クリックして選択 <span class="text-gray-500 font-normal">またはドラッグ＆ドロップ</span></p>
                     <p class="text-xs text-gray-400">CSV, TSV (最大 10MB)</p>
                 </div>
                 
                 <div class="flex items-center justify-between mt-4">
                     <div class="text-xs text-green-600 flex items-center font-medium">
                         <i class="fas fa-check-circle mr-1"></i> 最新のインポート: 2023/10/24 14:30
                     </div>
                     <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">完了</span>
                 </div>
                 
                 <div class="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
                     <a href="#" class="text-sm text-blue-600 hover:underline flex items-center">
                         <i class="fas fa-download mr-1"></i> テンプレートCSVをダウンロード
                     </a>
                     <button id="btn-import" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                         インポート実行
                     </button>
                 </div>
                 <script dangerouslySetInnerHTML={{__html: `
                    const fileInput = document.getElementById('csv-input');
                    const fileNameDisplay = document.getElementById('file-name');
                    const importBtn = document.getElementById('btn-import');

                    fileInput.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            fileNameDisplay.innerText = e.target.files[0].name;
                            fileNameDisplay.classList.add('text-green-600');
                        }
                    });

                    importBtn.addEventListener('click', async () => {
                        if (!fileInput.files.length) {
                            alert('CSVファイルを選択してください。');
                            return;
                        }

                        const formData = new FormData();
                        formData.append('csv', fileInput.files[0]);

                        importBtn.disabled = true;
                        importBtn.innerText = 'インポート中...';
                        importBtn.classList.add('opacity-50', 'cursor-not-allowed');

                        try {
                            const res = await fetch('/api/import-csv', {
                                method: 'POST',
                                body: formData
                            });
                            
                            if (res.ok) {
                                const msg = await res.text();
                                alert('成功: ' + msg);
                                window.location.reload();
                            } else {
                                const err = await res.text();
                                alert('エラー: ' + err);
                            }
                        } catch (e) {
                            alert('通信エラーが発生しました: ' + e);
                        } finally {
                            importBtn.disabled = false;
                            importBtn.innerText = 'インポート実行';
                            importBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                        }
                    });
                 `}} />
            </div>

            {/* Data Export */}
             <div class="bg-white border border-gray-200 rounded-xl p-6">
                 <h3 class="font-bold text-lg text-gray-800 mb-4 flex items-center">
                     <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                         <i class="fas fa-download"></i>
                     </div>
                     データ出力・ダウンロード
                 </h3>

                 {/* Stock CSV Section */}
                 <div class="bg-gray-50 rounded-lg p-4 mb-6 flex items-center justify-between">
                     <div>
                         <h4 class="font-bold text-gray-800 text-sm">在庫データCSV</h4>
                         <p class="text-xs text-gray-500 mt-1">現在登録されている全商品の採寸データを含むCSVを出力します。</p>
                     </div>
                     <button class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm whitespace-nowrap">
                         <i class="fas fa-download mr-1"></i> CSV出力
                     </button>
                 </div>

                 {/* Image Export Section */}
                 <div class="mb-4">
                     <div class="flex justify-between items-center mb-3">
                         <h4 class="font-bold text-gray-800 text-sm">画像一括エクスポート</h4>
                         <span class="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded font-bold">ZIP形式</span>
                     </div>
                     <p class="text-xs text-gray-500 mb-4">選択したオプションで画像を処理し、ZIPファイルとしてダウンロードします。</p>
                     
                     <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">白抜き処理を適用 (Background Removal)</span>
                         </label>
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">リサイズ (長辺 1200px)</span>
                         </label>
                         <label class="flex items-center space-x-3 cursor-pointer">
                             <input type="checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                             <span class="text-sm text-gray-700">ファイル名にSKUを含める</span>
                         </label>
                     </div>
                 </div>
                 
                 <button class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center justify-center mt-auto">
                     <i class="fas fa-file-archive mr-2"></i> 画像データを一括ダウンロード
                 </button>
            </div>
        </div>

        {/* General Settings */}
        <div class="bg-white border border-gray-200 rounded-xl p-6">
            <h3 class="font-bold text-lg text-gray-800 mb-6 flex items-center">
                 <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded flex items-center justify-center mr-3 text-sm">
                     <i class="fas fa-sliders-h"></i>
                 </div>
                 一般設定
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">出力ファイル名フォーマット</label>
                    <p class="text-xs text-blue-500 mb-2">使用可能な変数: {'{SKU}'}, {'{DATE}'}, {'{TIME}'}, {'{SEQ}'}</p>
                    <div class="flex space-x-2">
                        <input type="text" value="{SKU}_{DATE}_v1" class="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50" />
                        <select class="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                            <option>.jpg</option>
                            <option>.png</option>
                            <option>.webp</option>
                        </select>
                    </div>
                    
                    <div class="mt-6">
                         <div class="flex justify-between mb-2">
                             <label class="block text-sm font-bold text-gray-700">画像圧縮率 (JPEG/WebP)</label>
                             <span class="text-sm font-bold text-gray-900">85%</span>
                         </div>
                         <input type="range" value="85" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                </div>

                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">撮影時の自動アップロード</h4>
                            <p class="text-xs text-blue-600 mt-1">スマホで撮影完了時に自動でクラウドへ送信します</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">AI白抜き処理の自動適用</h4>
                            <p class="text-xs text-blue-600 mt-1">インポートされた画像に対して自動で背景削除を行います</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>

                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">エラー時の通知メール</h4>
                            <p class="text-xs text-blue-600 mt-1">処理に失敗した際に管理者にメールを送信します</p>
                        </div>
                         <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer" />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                    </div>
                </div>
            </div>
            
            <div class="mt-8 pt-6 border-t border-gray-100 flex justify-end space-x-4">
                 <p class="text-gray-400 text-sm self-center mr-auto">変更内容は保存されていません</p>
                 <button class="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-bold hover:bg-gray-50">
                     キャンセル
                 </button>
                 <button class="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                     設定を保存
                 </button>
            </div>
        </div>
    </Layout>
  )
})

// --- API: Import CSV ---
app.post('/api/import-csv', async (c) => {
    const body = await c.req.parseBody();
    const file = body['csv'];
    if (!file || !(file instanceof File)) return c.text('No file uploaded', 400);

    const buffer = await file.arrayBuffer();
    // Try decoding as Shift-JIS first (common for Japanese CSVs)
    let text = new TextDecoder('shift-jis').decode(buffer);
    
    // Simple heuristic: check for known headers
    if (!text.includes('ID') && !text.includes('商品名') && !text.includes('sku')) {
        // Fallback to UTF-8
        text = new TextDecoder('utf-8').decode(buffer);
    }

    const lines = text.split(/\r\n|\n|\r/);
    const headers = lines[0].split(',');
    
    // Simple CSV parser logic needed for data lines to handle quotes
    const parseCSVLine = (line: string) => {
        const result = [];
        let start = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') inQuotes = !inQuotes;
            else if (line[i] === ',' && !inQuotes) {
                let val = line.substring(start, i);
                // Remove quotes
                if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
                val = val.replace(/""/g, '"');
                result.push(val);
                start = i + 1;
            }
        }
        let val = line.substring(start);
        if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
        val = val.replace(/""/g, '"');
        result.push(val);
        return result;
    };

    // Mapping indexes based on header row (fuzzy matching)
    // User requested specific column mapping:
    // A:バーコード, B:ID, C:ブランド, E:品名, F:サイズ, G:カラー, L:商品ランク, Y:現状売価
    const getIndex = (names: string[]) => {
        for (const name of names) {
            const i = headers.findIndex(h => h && h.includes(name));
            if (i > -1) return i;
        }
        return -1;
    };
    
    // Explicit priority mapping based on user request
    const idx = {
        barcode: getIndex(['バーコード', 'Barcode']),      // Col A
        sku: getIndex(['ID', 'sku', 'SKU']),               // Col B
        brand: getIndex(['ブランド', 'Brand']),            // Col C
        // Col D (BrandKana) skipped
        name: getIndex(['品名', '商品名', 'Name']),        // Col E
        size: getIndex(['サイズ', 'Size']),                // Col F
        color: getIndex(['カラー', 'Color']),              // Col G
        // Cols H-K skipped
        rank: getIndex(['商品ランク', 'ランク', 'Rank']),  // Col L
        // Cols M-X skipped
        price_sale: getIndex(['現状売価', '販売価格', 'Price']), // Col Y
        
        // Keep these for supplementary info if available, but lower priority
        stock: getIndex(['在数', 'Stock']),
        status: getIndex(['ステータス', 'Status']),
        price_cost: getIndex(['仕入単価', 'Cost']),
        category: getIndex(['カテゴリ大', 'Category']),
        category_sub: getIndex(['カテゴリ小', 'SubCategory']),
        season: getIndex(['シーズン', 'Season']),
        buyer: getIndex(['バイヤー', 'Buyer']),
        store: getIndex(['店舗名', 'Store']),
        ref_price: getIndex(['参考上代', 'RefPrice']),
        list_price: getIndex(['出品価格', 'ListPrice']),
        location: getIndex(['保管場所', 'Location'])
    };

    let count = 0;
    
    // Prepared statement for insertion
    const stmt = c.env.DB.prepare(`
        INSERT OR REPLACE INTO products (
            sku, name, brand, brand_kana, size, color, price_cost, price_sale, 
            stock_quantity, barcode, status, category, category_sub, season, 
            rank, buyer, store_name, price_ref, price_list, location, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = parseCSVLine(line);
        // Basic validation: must have SKU or Name
        if (!row[idx.sku] && !row[idx.name]) continue;

        const sku = row[idx.sku] || `UNKNOWN-${Date.now()}-${i}`;
        const name = row[idx.name] || 'Unknown Product';
        
        const cleanInt = (val: string) => {
            if (!val) return 0;
            return parseInt(val.replace(/,/g, '').replace(/[¥￥]/g, '')) || 0;
        };

        batch.push(stmt.bind(
            sku,
            name,
            row[idx.brand] || null,
            row[idx.brand_kana] || null,
            row[idx.size] || null,
            row[idx.color] || null,
            cleanInt(row[idx.price_cost]),
            cleanInt(row[idx.price_sale]),
            cleanInt(row[idx.stock]),
            row[idx.barcode] || null,
            row[idx.status] || 'Active',
            row[idx.category] || null,
            row[idx.category_sub] || null,
            row[idx.season] || null,
            row[idx.rank] || null,
            row[idx.buyer] || null,
            row[idx.store] || null,
            cleanInt(row[idx.ref_price]),
            cleanInt(row[idx.list_price]),
            row[idx.location] || null,
            new Date().toISOString()
        ));
        
        count++;
        
        // Execute batch every 50 rows
        if (batch.length >= 50) {
            await c.env.DB.batch(batch);
            batch.length = 0;
        }
    }
    
    if (batch.length > 0) await c.env.DB.batch(batch);

    return c.text(`${count} 件の商品データをインポートしました。`);
});

// --- API: Bulk Import for Mobile App (JSON Format) ---
app.post('/api/products/bulk-import', async (c) => {
    try {
        const { products } = await c.req.json();
        
        if (!products || !Array.isArray(products)) {
            return c.json({ success: false, error: 'Invalid request: products array required' }, 400);
        }

        let inserted = 0;
        let updated = 0;
        const batch = [];

        const stmt = c.env.DB.prepare(`
            INSERT OR REPLACE INTO products (
                sku, barcode, name, brand, category, size, color, 
                price_sale, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
                (SELECT created_at FROM products WHERE sku = ?), 
                ?
            ))
        `);

        for (const product of products) {
            if (!product.sku) continue;

            // Check if product exists
            const existing = await c.env.DB.prepare(
                'SELECT sku FROM products WHERE sku = ?'
            ).bind(product.sku).first();

            if (existing) {
                updated++;
            } else {
                inserted++;
            }

            const now = new Date().toISOString();
            batch.push(stmt.bind(
                product.sku,
                product.barcode || null,
                product.name || 'Unknown Product',
                product.brand || null,
                product.category || null,
                product.size || null,
                product.color || null,
                product.price || 0,
                'Active',
                product.sku,  // For COALESCE check
                now           // Default created_at for new records
            ));

            // Execute batch every 50 rows
            if (batch.length >= 50) {
                await c.env.DB.batch(batch);
                batch.length = 0;
            }
        }

        // Execute remaining batch
        if (batch.length > 0) {
            await c.env.DB.batch(batch);
        }
        
        // Also sync to mobile app API
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        let mobileSynced = 0;
        
        try {
            const mobileResponse = await fetch(`${MOBILE_API_URL}/api/products/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products })
            });
            
            if (mobileResponse.ok) {
                const mobileData = await mobileResponse.json();
                mobileSynced = mobileData.inserted + mobileData.updated;
                console.log(`✅ Synced ${mobileSynced} products to mobile app API`);
            } else {
                console.warn('⚠️ Failed to sync to mobile app API:', await mobileResponse.text());
            }
        } catch (e) {
            console.error('❌ Mobile API sync error:', e);
        }

        return c.json({
            success: true,
            message: 'マスタデータを更新しました',
            inserted,
            updated,
            total: products.length,
            mobileSynced
        });

    } catch (error: any) {
        console.error('Bulk import error:', error);
        return c.json({ 
            success: false, 
            error: error.message || 'Bulk import failed' 
        }, 500);
    }
});

// --- API: Export Data (For External Apps) ---
// 他のアプリからデータを引っ張るための「窓口」です
app.get('/api/products/list', async (c) => {
    // データベースから全商品を取得
    const result = await c.env.DB.prepare(`
        SELECT 
            id, sku, name, brand, size, color, 
            price_sale, stock_quantity, status, 
            barcode, rank, 
            created_at 
        FROM products 
        ORDER BY id DESC
    `).all();

    // JSON形式（プログラムが読みやすい形式）で返す
    return c.json({
        source: "SmartMeasure API",
        timestamp: new Date().toISOString(),
        count: result.results.length,
        products: result.results
    });
});

// --- API: Search Product by SKU (for Mobile App) ---
app.get('/api/products/search', async (c) => {
    try {
        const sku = c.req.query('sku');
        
        if (!sku) {
            return c.json({ success: false, error: 'SKU parameter required' }, 400);
        }

        const product = await c.env.DB.prepare(`
            SELECT 
                sku, barcode, name, brand, category, size, color, 
                price_sale as price, status, created_at, created_at as updated_at
            FROM products 
            WHERE sku = ?
        `).bind(sku).first();

        if (!product) {
            return c.json({ 
                success: false, 
                error: 'Product not found' 
            }, 404);
        }

        // Get related images from images table (if any)
        const images = await c.env.DB.prepare(`
            SELECT id, original_url, processed_url, status, created_at as photographed_at
            FROM images
            WHERE product_id = (SELECT id FROM products WHERE sku = ?)
            ORDER BY id DESC
        `).bind(sku).all();

        // Also check R2 bucket for mobile app images
        const mobileAppImages = [];
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        
        // Try R2 bucket binding first (production)
        if (c.env.PRODUCT_IMAGES) {
            try {
                const list = await c.env.PRODUCT_IMAGES.list({ prefix: sku });
                for (const obj of list.objects) {
                    const filename = obj.key;
                    if (filename.startsWith(sku)) {
                        mobileAppImages.push({
                            url: `${R2_PUBLIC_URL}/${filename}`,
                            filename: filename,
                            uploaded: obj.uploaded
                        });
                    }
                }
            } catch (e) {
                console.error('Failed to fetch R2 images via binding:', e);
            }
        }
        
        // Fallback: Try R2 Public URL directly (local development)
        if (mobileAppImages.length === 0) {
            console.log('🔄 Trying R2 Public URL for mobile app images...');
            
            // Try common pattern: {SKU}_{1-10}.jpg
            for (let i = 1; i <= 10; i++) {
                try {
                    const imageUrl = `${R2_PUBLIC_URL}/${sku}_${i}.jpg`;
                    const headResponse = await fetch(imageUrl, { method: 'HEAD' });
                    
                    if (headResponse.ok) {
                        // Image exists!
                        const contentLength = headResponse.headers.get('content-length');
                        const lastModified = headResponse.headers.get('last-modified');
                        
                        mobileAppImages.push({
                            url: imageUrl,
                            filename: `${sku}_${i}.jpg`,
                            uploaded: lastModified || new Date().toISOString(),
                            size: contentLength ? parseInt(contentLength) : 0
                        });
                        
                        console.log(`✅ Found mobile app image: ${imageUrl}`);
                    } else {
                        // Image doesn't exist, stop checking
                        console.log(`⏹️ No more images found after index ${i-1}`);
                        break;
                    }
                } catch (e) {
                    // Error or no more images, stop
                    console.log(`⚠️ Error checking image ${i}:`, e);
                    break;
                }
            }
            
            console.log(`📱 Found ${mobileAppImages.length} mobile app images for SKU: ${sku}`);
        }

        // Combine WEB app images and mobile app images
        const allImages = [
            ...images.results.map((img: any) => ({
                id: img.id,
                sku: sku,
                item_code: `${sku}_${img.id}`,
                image_urls: JSON.stringify([img.original_url]),
                source: 'webapp',
                condition: 'Unknown',
                photographed_at: img.photographed_at
            })),
            ...mobileAppImages.map((img, index) => ({
                id: `mobile_${index}`,
                sku: sku,
                item_code: img.filename.replace('.jpg', ''),
                image_urls: JSON.stringify([img.url]),
                source: 'mobile',
                condition: 'Unknown',
                photographed_at: img.uploaded
            }))
        ];

        return c.json({
            success: true,
            product: {
                ...product,
                hasCapturedData: allImages.length > 0,
                capturedItems: allImages,
                latestItem: allImages.length > 0 ? allImages[0] : null,
                capturedCount: allImages.length,
                webAppImageCount: images.results.length,
                mobileAppImageCount: mobileAppImages.length
            }
        });

    } catch (error: any) {
        console.error('Search error:', error);
        return c.json({ 
            success: false, 
            error: error.message || 'Search failed' 
        }, 500);
    }
});

// --- API: Sync from Mobile App API ---
app.post('/api/sync-from-mobile', async (c) => {
    try {
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        
        console.log('🔄 Syncing product data from mobile app API...');
        
        // Get all products from local database
        const localProducts = await c.env.DB.prepare(`
            SELECT sku FROM products
        `).all();
        
        const localSkus = new Set(localProducts.results.map((p: any) => p.sku));
        let syncedCount = 0;
        let skippedCount = 0;
        
        // For each local product, try to fetch updated data from mobile API
        for (const localProduct of localProducts.results) {
            const sku = (localProduct as any).sku;
            
            try {
                const response = await fetch(`${MOBILE_API_URL}/api/products/search?sku=${sku}`);
                
                if (!response.ok) {
                    console.log(`⚠️ Product ${sku} not found in mobile API`);
                    skippedCount++;
                    continue;
                }
                
                const data = await response.json();
                
                if (data.success && data.product) {
                    const product = data.product;
                    
                    // Update product data in local database
                    await c.env.DB.prepare(`
                        UPDATE products SET
                            name = ?,
                            brand = ?,
                            size = ?,
                            color = ?,
                            price_sale = ?,
                            barcode = ?,
                            category = ?
                        WHERE sku = ?
                    `).bind(
                        product.name || '',
                        product.brand || null,
                        product.size || null,
                        product.color || null,
                        product.price || 0,
                        product.barcode || null,
                        product.category || null,
                        sku
                    ).run();
                    
                    syncedCount++;
                    console.log(`✅ Synced product: ${sku}`);
                }
            } catch (e) {
                console.error(`❌ Failed to sync product ${sku}:`, e);
                skippedCount++;
            }
        }
        
        return c.json({
            success: true,
            synced: syncedCount,
            skipped: skippedCount,
            total: localProducts.results.length,
            message: `Successfully synced ${syncedCount} products from mobile app API`
        });
        
    } catch (error: any) {
        console.error('Sync from mobile API error:', error);
        return c.json({ 
            success: false, 
            error: error.message || 'Sync failed' 
        }, 500);
    }
});

// --- API: Background Removal ---
app.post('/api/remove-bg', async (c) => {
    try {
        const body = await c.req.parseBody();
        const imageUrl = body['imageUrl'] as string;
        const model = (body['model'] as string) || 'cloudflare-ai';  // Default to Cloudflare AI (free, built-in)
        
        if (!imageUrl) {
            return c.json({ error: 'imageUrl is required' }, 400);
        }

        // Check if using Cloudflare AI (birefnet-general) - Free built-in model
        if (model === 'birefnet-general' || model === 'cloudflare-ai') {
            console.log('🚀 Using Cloudflare AI for background removal');
            
            try {
                const result = await removeBackgroundWithCloudflareAI(c.env.AI, imageUrl);
                
                if (!result.success || !result.imageBuffer) {
                    throw new Error(result.error || 'Cloudflare AI processing failed');
                }

                // Convert to base64 data URL with white background
                const base64 = btoa(new Uint8Array(result.imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                const processedDataUrl = `data:image/png;base64,${base64}`;

                return c.json({
                    success: true,
                    processedUrl: processedDataUrl,
                    message: 'Background removed using Cloudflare AI (Free)'
                });
            } catch (apiError: any) {
                console.error('❌ Cloudflare AI failed:', apiError.message);
                throw new Error(`Cloudflare AI processing failed: ${apiError.message}`);
            }
        }

        // Fallback: Self-hosted rembg API server (Python) - only if Cloudflare AI is not used
        const BG_REMOVAL_API = c.env.BG_REMOVAL_API_URL || 'http://127.0.0.1:8000';
        
        const response = await fetch(`${BG_REMOVAL_API}/api/remove-bg-from-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl,
                bgcolor: [255, 255, 255, 255],  // White background (RGBA)
                model: model
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Background removal failed: ${response.statusText} - ${errorText}`);
        }

        // Get the processed image as binary data
        const imageBuffer = await response.arrayBuffer();
        
        // Convert to base64 data URL
        const base64 = btoa(
            new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        // Check content type - if bgcolor was applied, it's JPEG, otherwise PNG
        const contentType = response.headers.get('content-type') || 'image/png';
        const mimeType = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        return c.json({ 
            success: true, 
            processedUrl: dataUrl,
            message: 'Background removed successfully with BRIA RMBG 2.0 (birefnet-general)'
        });

    } catch (error: any) {
        console.error('Background removal error:', error);
        return c.json({ 
            error: 'Background removal failed', 
            details: error.message 
        }, 500);
    }
});

// --- Helper: withoutBG API Background Removal (Free, Hugging Face Spaces) ---
async function removeBackgroundWithWithoutBG(imageUrl: string): Promise<{ success: boolean; imageDataUrl?: string; error?: string }> {
    try {
        console.log('🎨 Using withoutBG Focus model (Hugging Face Spaces)...');
        
        // Call Hugging Face Space API (Flask/Docker API)
        const response = await fetch('https://jinkedon-withoutbg-api.hf.space/api/remove-bg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl  // Flask API format
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`withoutBG API failed: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // Flask returns: { success: true, image_data: "data:image/png;base64,..." }
        if (!result.success || !result.image_data) {
            throw new Error(result.error || 'Invalid response from withoutBG API');
        }
        
        console.log('✅ withoutBG Focus background removal completed');
        
        return {
            success: true,
            imageDataUrl: result.image_data  // Already a data URL
        };
    } catch (error: any) {
        console.error('❌ withoutBG API failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// --- Helper: Call Fal.ai BRIA RMBG API (Cloud-based, no local memory issues) ---
async function callBriaApi(imageUrl: string, apiKey: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
        console.log('🌐 Calling Fal.ai BRIA RMBG API...');
        
        // Step 1: Submit the job to Fal.ai
        const submitResponse = await fetch('https://queue.fal.run/fal-ai/birefnet', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl,
            })
        });

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`Fal.ai submit failed: ${submitResponse.status} - ${errorText}`);
        }

        const submitResult = await submitResponse.json() as { request_id?: string; status?: string; response_url?: string };
        console.log('📤 Fal.ai job submitted:', submitResult);

        // Step 2: Poll for result (Fal.ai queue system)
        const requestId = submitResult.request_id;
        if (!requestId) {
            throw new Error('No request_id returned from Fal.ai');
        }

        // Poll for completion (max 60 seconds)
        let result: any = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            const statusResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}/status`, {
                headers: {
                    'Authorization': `Key ${apiKey}`,
                }
            });

            if (!statusResponse.ok) {
                continue;
            }

            const statusResult = await statusResponse.json() as { status: string };
            console.log(`📊 Fal.ai status: ${statusResult.status}`);

            if (statusResult.status === 'COMPLETED') {
                // Get the result
                const resultResponse = await fetch(`https://queue.fal.run/fal-ai/birefnet/requests/${requestId}`, {
                    headers: {
                        'Authorization': `Key ${apiKey}`,
                    }
                });

                if (resultResponse.ok) {
                    result = await resultResponse.json();
                    break;
                }
            } else if (statusResult.status === 'FAILED') {
                throw new Error('Fal.ai processing failed');
            }
        }

        if (!result) {
            throw new Error('Fal.ai processing timeout');
        }

        // Get the output image URL
        const outputUrl = result.image?.url;
        if (!outputUrl) {
            throw new Error('No output image URL from Fal.ai');
        }

        console.log('✅ Fal.ai BRIA processing complete:', outputUrl);
        return { success: true, imageUrl: outputUrl };

    } catch (error: any) {
        console.error('❌ Fal.ai BRIA API error:', error.message);
        return { success: false, error: error.message };
    }
}

// --- Helper: Add white background to transparent PNG ---
async function addWhiteBackground(imageUrl: string): Promise<string> {
    // Fetch the transparent PNG
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();
    
    // Return as data URL (PNG with transparency)
    // Note: Client-side can add white background, or we can process it here
    const base64 = btoa(
        new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    return `data:image/png;base64,${base64}`;
}

// --- API: Batch Background Removal for Image ID ---
app.post('/api/remove-bg-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        let model = 'cloudflare-ai';  // Default to Cloudflare AI (free, built-in)
        let useBriaApi = false;  // Whether to use Fal.ai BRIA API
        
        try {
             // Try to parse body if exists for model selection
             const body = await c.req.json();
             if (body && body.model) {
                 model = body.model;
             }
             if (body && body.useBriaApi) {
                 useBriaApi = body.useBriaApi;
             }
        } catch (e) {
            // No JSON body or parse error, ignore and use default
        }
        
        // Check if this is an R2 image (starts with r2_)
        let originalUrl: string;
        let isR2Image = false;
        let dbImageId: number | null = null; // DB image ID for R2 images
        let productId: number | null = null; // Product ID for R2 images
        
        if (imageId.startsWith('r2_')) {
            // R2 image - construct URL from ID
            isR2Image = true;
            const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
            
            // Extract filename from ID: r2_123_1 -> 123_1.jpg
            const filename = imageId.replace('r2_', '') + '.jpg';
            originalUrl = `${R2_PUBLIC_URL}/${filename}`;
            
            console.log(`📸 Processing R2 image: ${imageId} -> ${originalUrl}`);
            
            // For R2 images, try to find or create image record in DB
            // Extract SKU from filename: 123_1 -> 123 (SKU is before last underscore)
            const parts = filename.replace('.jpg', '').split('_');
            const sku = parts.slice(0, -1).join('_'); // All parts except the last one (image number)
            
            console.log(`📦 Looking for product with SKU: ${sku}`);
            
            // Get product ID
            const productResult = await c.env.DB.prepare(`
                SELECT id FROM products WHERE sku = ?
            `).bind(sku).first();
            
            if (productResult) {
                productId = productResult.id as number;
                
                // Check if image already exists in DB
                const existingImage = await c.env.DB.prepare(`
                    SELECT id FROM images WHERE original_url = ?
                `).bind(originalUrl).first();
                
                if (existingImage) {
                    dbImageId = existingImage.id as number;
                    console.log(`✅ Found existing image record: ${dbImageId}`);
                } else {
                    // Create image record
                    const insertResult = await c.env.DB.prepare(`
                        INSERT INTO images (product_id, original_url, status, created_at)
                        VALUES (?, ?, 'processing', datetime('now'))
                    `).bind(productId, originalUrl).run();
                    
                    dbImageId = insertResult.meta.last_row_id as number;
                    console.log(`✨ Created new image record: ${dbImageId}`);
                }
            } else {
                console.warn(`⚠️ Product not found for SKU: ${sku}`);
            }
        } else {
            // Database image
            const imageResult = await c.env.DB.prepare(`
                SELECT * FROM images WHERE id = ?
            `).bind(imageId).first();

            if (!imageResult) {
                return c.json({ error: 'Image not found' }, 404);
            }

            originalUrl = imageResult.original_url as string;

            // Update status to processing
            await c.env.DB.prepare(`
                UPDATE images SET status = 'processing' WHERE id = ?
            `).bind(imageId).run();
        }

        // ==========================================
        // Priority 1: Use Fal.ai BRIA API if configured (Cloud-based, no OOM issues)
        // ==========================================
        const briaApiKey = c.env.BRIA_API_KEY || c.env.FAL_API_KEY;
        const isBriaKeyValid = briaApiKey && briaApiKey !== 'demo' && briaApiKey !== 'your-fal-api-key-here';
        
        if (isBriaKeyValid && (useBriaApi || model === 'bria')) {
            console.log('🌐 Using Fal.ai BRIA RMBG 2.0 API (cloud-based)');
            
            // For data URLs, we need to upload first or use local processing
            if (originalUrl.startsWith('data:')) {
                console.log('⚠️ Data URL detected, falling back to local rembg for BRIA');
            } else {
                const briaResult = await callBriaApi(originalUrl, briaApiKey);
                
                if (briaResult.success && briaResult.imageUrl) {
                    // Fetch the processed image and convert to data URL with white background
                    const processedDataUrl = await addWhiteBackground(briaResult.imageUrl);
                    
                    // Update DB (only for non-R2 images)
                    if (!isR2Image) {
                        await c.env.DB.prepare(`
                            UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
                        `).bind(processedDataUrl, imageId).run();
                    }

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl: processedDataUrl,
                        message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)'
                    });
                } else {
                    console.error('❌ BRIA API failed, falling back to local rembg:', briaResult.error);
                }
            }
        }

        // ==========================================
        // Priority 2: withoutBG Focus (birefnet-general) - Free Hugging Face Spaces
        // ==========================================
        if (model === 'birefnet-general' || model === 'cloudflare-ai') {
            console.log('🚀 Using withoutBG Focus model for background removal');
            
            try {
                const result = await removeBackgroundWithWithoutBG(originalUrl);
                
                if (!result.success || !result.imageDataUrl) {
                    throw new Error(result.error || 'withoutBG processing failed');
                }

                // Update DB - now also for R2 images if we have a DB record
                if (!isR2Image) {
                    await c.env.DB.prepare(`
                        UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
                    `).bind(result.imageDataUrl, imageId).run();
                } else if (dbImageId) {
                    // R2 image with DB record - save processed URL
                    await c.env.DB.prepare(`
                        UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
                    `).bind(result.imageDataUrl, dbImageId).run();
                    console.log(`✅ Saved processed image to DB for R2 image: ${dbImageId}`);
                }

                return c.json({ 
                    success: true,
                    imageId,
                    dbImageId: dbImageId,
                    processedUrl: result.imageDataUrl,
                    message: 'Background removed using withoutBG Focus (Free)'
                });
            } catch (apiError: any) {
                console.error('❌ withoutBG API failed:', apiError.message);
                // Mark as failed
                if (!isR2Image) {
                    await c.env.DB.prepare(`
                        UPDATE images SET status = 'failed' WHERE id = ?
                    `).bind(imageId).run();
                } else if (dbImageId) {
                    await c.env.DB.prepare(`
                        UPDATE images SET status = 'failed' WHERE id = ?
                    `).bind(dbImageId).run();
                }
                
                return c.json({ 
                    success: false,
                    error: `withoutBG processing failed: ${apiError.message}`
                }, 500);
            }
        }

        // ==========================================
        // Priority 3: Self-hosted rembg server (Python) - WARNING: Memory intensive!
        // ==========================================
        console.log('⚠️ Using local rembg server (memory-intensive, may cause OOM in sandbox)');
        const BG_REMOVAL_API = c.env.BG_REMOVAL_API_URL || 'http://127.0.0.1:8000';
        let response: Response;
        
        // Check if it's a base64 data URL or regular URL
        if (originalUrl.startsWith('data:')) {
            // Extract base64 data from data URL
            const matches = originalUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }
            const base64Data = matches[2];
            
            // Send base64 data directly to API with white background
            response = await fetch(`${BG_REMOVAL_API}/api/remove-bg-base64`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_base64: base64Data,
                    bgcolor: [255, 255, 255, 255],  // White background (RGBA)
                    model: model
                })
            });
        } else {
            // Regular URL - use existing endpoint with white background
            response = await fetch(`${BG_REMOVAL_API}/api/remove-bg-from-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_url: originalUrl,
                    bgcolor: [255, 255, 255, 255],  // White background (RGBA)
                    model: model
                })
            });
        }

        if (!response.ok) {
            // Mark as failed
            if (!isR2Image) {
                await c.env.DB.prepare(`
                    UPDATE images SET status = 'failed' WHERE id = ?
                `).bind(imageId).run();
            } else if (dbImageId) {
                await c.env.DB.prepare(`
                    UPDATE images SET status = 'failed' WHERE id = ?
                `).bind(dbImageId).run();
            }
            const errorText = await response.text();
            throw new Error(`Background removal failed: ${response.statusText} - ${errorText}`);
        }

        // Get the processed image as binary data
        const imageBuffer = await response.arrayBuffer();
        
        // Convert to base64 data URL
        const base64 = btoa(
            new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        // Check content type - if bgcolor was applied, it's JPEG, otherwise PNG
        const contentType = response.headers.get('content-type') || 'image/png';
        const mimeType = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Update database with processed image
        if (!isR2Image) {
            await c.env.DB.prepare(`
                UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
            `).bind(dataUrl, imageId).run();
        } else if (dbImageId) {
            await c.env.DB.prepare(`
                UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
            `).bind(dataUrl, dbImageId).run();
            console.log(`✅ Saved processed image to DB for R2 image: ${dbImageId}`);
        }

        return c.json({ 
            success: true,
            imageId,
            dbImageId: dbImageId,
            processedUrl: dataUrl,
            message: 'Background removed and saved'
        });

    } catch (error: any) {
        console.error('Background removal error:', error);
        return c.json({ 
            error: 'Background removal failed', 
            details: error.message 
        }, 500);
    }
});

// --- API: Sync Images from Bubble App (R2) ---
app.post('/api/sync-from-bubble', async (c) => {
    try {
        // R2 Public URL from Bubble app
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        
        // Option 1: If R2Bucket binding is available (same Cloudflare account)
        if (c.env.PRODUCT_IMAGES) {
            console.log('🔄 Syncing from R2 bucket directly...');
            
            const list = await c.env.PRODUCT_IMAGES.list();
            let syncedCount = 0;
            let skippedCount = 0;
            
            for (const obj of list.objects) {
                // Parse filename: {SKU}_{連番}_{タイムスタンプ}.jpg
                // Example: 1025L190003_1_1735592163456.jpg
                const filename = obj.key;
                const parts = filename.replace('.jpg', '').split('_');
                
                if (parts.length < 3) {
                    console.warn(`⚠️ Skipping invalid filename: ${filename}`);
                    skippedCount++;
                    continue;
                }
                
                const sku = parts[0];
                const imageNumber = parts[1];
                const timestamp = parts[2];
                const imageUrl = `${R2_PUBLIC_URL}/${filename}`;
                
                // Check if product exists
                const product = await c.env.DB.prepare(`
                    SELECT id FROM products WHERE sku = ?
                `).bind(sku).first();
                
                if (!product) {
                    // Create product if not exists
                    await c.env.DB.prepare(`
                        INSERT OR IGNORE INTO products (sku, name, category)
                        VALUES (?, ?, ?)
                    `).bind(sku, `商品 ${sku}`, 'Imported').run();
                }
                
                // Check if image already exists
                const existingImage = await c.env.DB.prepare(`
                    SELECT id FROM images WHERE original_url = ?
                `).bind(imageUrl).first();
                
                if (existingImage) {
                    skippedCount++;
                    continue;
                }
                
                // Insert image
                await c.env.DB.prepare(`
                    INSERT INTO images (product_id, original_url, status, created_at)
                    SELECT id, ?, 'pending', datetime(?, 'unixepoch', 'subsec')
                    FROM products WHERE sku = ?
                `).bind(imageUrl, parseInt(timestamp) / 1000, sku).run();
                
                syncedCount++;
            }
            
            return c.json({ 
                success: true,
                synced: syncedCount,
                skipped: skippedCount,
                total: list.objects.length,
                message: `Successfully synced ${syncedCount} images from R2`
            });
        }
        
        // Option 2: Public URL access (if R2 binding not available)
        // In this case, we need to manually provide SKU list or scan existing products
        console.log('🔄 Syncing from R2 public URL...');
        
        // Get all existing products
        const products = await c.env.DB.prepare(`
            SELECT sku FROM products
        `).all();
        
        let syncedCount = 0;
        let skippedCount = 0;
        
        for (const product of products.results) {
            const sku = product.sku as string;
            
            // Try to fetch up to 10 images per product
            for (let i = 1; i <= 10; i++) {
                const filename = `${sku}_${i}_`;
                // Note: We can't get exact timestamp without listing, so we'll check if URL exists
                
                // For now, skip this approach and require R2 bucket binding
                // This would require either R2 listing API or maintaining a separate index
            }
        }
        
        return c.json({ 
            error: 'R2 bucket binding required',
            message: 'Please configure R2_BUCKET in wrangler.jsonc to enable automatic sync'
        }, 400);
        
    } catch (error: any) {
        console.error('Sync error:', error);
        return c.json({ 
            error: 'Sync failed', 
            details: error.message 
        }, 500);
    }
});

// --- API: Manual Image Registration from Bubble ---
app.post('/api/register-image', async (c) => {
    try {
        const body = await c.req.json();
        const { sku, imageUrl } = body;
        
        if (!sku || !imageUrl) {
            return c.json({ error: 'SKU and imageUrl are required' }, 400);
        }
        
        // Check if product exists, create if not
        const product = await c.env.DB.prepare(`
            SELECT id FROM products WHERE sku = ?
        `).bind(sku).first();
        
        if (!product) {
            await c.env.DB.prepare(`
                INSERT INTO products (sku, name, category)
                VALUES (?, ?, ?)
            `).bind(sku, `商品 ${sku}`, 'Imported').run();
        }
        
        // Check if image already exists
        const existingImage = await c.env.DB.prepare(`
            SELECT id FROM images WHERE original_url = ?
        `).bind(imageUrl).first();
        
        if (existingImage) {
            return c.json({ 
                success: true,
                message: 'Image already exists',
                imageId: existingImage.id
            });
        }
        
        // Insert image
        const result = await c.env.DB.prepare(`
            INSERT INTO images (product_id, original_url, status)
            SELECT id, ?, 'pending' FROM products WHERE sku = ?
        `).bind(imageUrl, sku).run();
        
        return c.json({ 
            success: true,
            message: 'Image registered successfully',
            imageId: result.meta.last_row_id
        });
        
    } catch (error: any) {
        console.error('Registration error:', error);
        return c.json({ 
            error: 'Registration failed', 
            details: error.message 
        }, 500);
    }
});

// --- API: Export Selected Images as CSV ---
app.post('/api/export-selected-csv', async (c) => {
    try {
        const body = await c.req.json();
        const imageIds = body.imageIds as string[];
        
        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return c.text('No image IDs provided', 400);
        }
        
        // Fetch image data with product information
        const placeholders = imageIds.map(() => '?').join(',');
        const query = `
            SELECT 
                i.id as image_id,
                i.original_url,
                i.processed_url,
                i.status,
                i.created_at as image_created_at,
                p.sku,
                p.name as product_name,
                p.brand,
                p.brand_kana,
                p.size,
                p.color,
                p.category,
                p.category_sub,
                p.price_cost,
                p.price_sale,
                p.price_ref,
                p.price_list,
                p.stock_quantity,
                p.barcode,
                p.rank,
                p.season,
                p.buyer,
                p.store_name,
                p.location,
                p.status as product_status
            FROM images i
            LEFT JOIN products p ON i.product_id = p.id
            WHERE i.id IN (${placeholders})
            ORDER BY p.sku, i.id
        `;
        
        const result = await c.env.DB.prepare(query).bind(...imageIds).all();
        
        if (!result.results || result.results.length === 0) {
            return c.text('No data found', 404);
        }
        
        // Group images by SKU
        const groupedBySku = new Map<string, any[]>();
        for (const row of result.results as any[]) {
            const sku = row.sku || 'UNKNOWN';
            if (!groupedBySku.has(sku)) {
                groupedBySku.set(sku, []);
            }
            groupedBySku.get(sku)!.push(row);
        }
        
        // Find max number of images per SKU
        let maxImages = 0;
        for (const images of groupedBySku.values()) {
            maxImages = Math.max(maxImages, images.length);
        }
        
        // Build dynamic headers based on max images (all in Japanese)
        const baseHeaders = [
            'SKU',
            '商品名',
            'ブランド',
            'ブランドカナ',
            'サイズ',
            'カラー',
            'カテゴリ大',
            'カテゴリ小',
            '仕入単価',
            '販売価格',
            '参考上代',
            '出品価格',
            '在庫数',
            'バーコード',
            'ランク',
            'シーズン',
            'バイヤー',
            '店舗名',
            '保管場所',
            'ステータス'
        ];
        
        // Add image columns dynamically
        const imageHeaders: string[] = [];
        for (let i = 1; i <= maxImages; i++) {
            imageHeaders.push(
                `画像${i}ID`,
                `画像${i}ステータス`,
                `画像${i}元画像`,
                `画像${i}編集画像`,
                `画像${i}撮影日時`
            );
        }
        
        const headers = [...baseHeaders, ...imageHeaders];
        const csvLines = [headers.join(',')];
        
        // Generate rows grouped by SKU
        for (const [sku, images] of groupedBySku.entries()) {
            const firstImage = images[0];
            
            // Base product information (from first image's product data)
            const baseLine = [
                escapeCSV(sku),
                escapeCSV(firstImage.product_name || ''),
                escapeCSV(firstImage.brand || ''),
                escapeCSV(firstImage.brand_kana || ''),
                escapeCSV(firstImage.size || ''),
                escapeCSV(firstImage.color || ''),
                escapeCSV(firstImage.category || ''),
                escapeCSV(firstImage.category_sub || ''),
                firstImage.price_cost || 0,
                firstImage.price_sale || 0,
                firstImage.price_ref || 0,
                firstImage.price_list || 0,
                firstImage.stock_quantity || 0,
                escapeCSV(firstImage.barcode || ''),
                escapeCSV(firstImage.rank || ''),
                escapeCSV(firstImage.season || ''),
                escapeCSV(firstImage.buyer || ''),
                escapeCSV(firstImage.store_name || ''),
                escapeCSV(firstImage.location || ''),
                escapeCSV(firstImage.product_status || '')
            ];
            
            // Add image data for each image
            const imageCols: string[] = [];
            for (let i = 0; i < maxImages; i++) {
                if (i < images.length) {
                    const img = images[i];
                    // Format status in Japanese
                    let statusJp = '';
                    if (img.status === 'completed') statusJp = '完了';
                    else if (img.status === 'processing') statusJp = '処理中';
                    else if (img.status === 'pending') statusJp = '待機中';
                    else if (img.status === 'failed') statusJp = '失敗';
                    else statusJp = img.status || '';
                    
                    // Indicate if images exist (Yes/No)
                    const hasOriginal = img.original_url ? 'あり' : '';
                    const hasProcessed = img.processed_url ? 'あり' : '';
                    
                    imageCols.push(
                        String(img.image_id || ''),
                        statusJp,
                        hasOriginal,
                        hasProcessed,
                        img.image_created_at || ''
                    );
                } else {
                    // Empty columns for missing images
                    imageCols.push('', '', '', '', '');
                }
            }
            
            const line = [...baseLine, ...imageCols];
            csvLines.push(line.join(','));
        }
        
        const csvContent = csvLines.join('\r\n');
        
        // Create UTF-8 BOM + CSV content as Uint8Array for proper encoding
        const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const encoder = new TextEncoder();
        const csvBytes = encoder.encode(csvContent);
        
        // Combine BOM and CSV content
        const combined = new Uint8Array(BOM.length + csvBytes.length);
        combined.set(BOM);
        combined.set(csvBytes, BOM.length);
        
        return new Response(combined, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="smart_measure_export.csv"'
            }
        });
        
    } catch (error: any) {
        console.error('CSV export error:', error);
        return c.text('CSV export failed: ' + error.message, 500);
    }
});

// Helper function to escape CSV values
function escapeCSV(value: string): string {
    if (!value) return '';
    const str = String(value);
    // Remove all newlines and carriage returns
    const cleaned = str.replace(/[\r\n]+/g, ' ').trim();
    // If value contains comma, quote, wrap in quotes and escape quotes
    if (cleaned.includes(',') || cleaned.includes('"')) {
        return '"' + cleaned.replace(/"/g, '""') + '"';
    }
    return cleaned;
}

// --- API: Download Single Image ---
app.get('/api/download-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        
        // Get image data with product info
        const result = await c.env.DB.prepare(`
            SELECT 
                i.id,
                i.original_url,
                p.sku,
                p.name as product_name
            FROM images i
            LEFT JOIN products p ON i.product_id = p.id
            WHERE i.id = ?
        `).bind(imageId).first();
        
        if (!result) {
            return c.json({ error: 'Image not found' }, 404);
        }
        
        // Generate filename
        const sku = (result.sku as string) || 'UNKNOWN';
        const imageIdStr = (result.id as number).toString().padStart(4, '0');
        const filename = `${sku}_original_${imageIdStr}.png`;
        
        return c.json({
            imageUrl: result.original_url,
            filename: filename,
            sku: sku
        });
        
    } catch (error: any) {
        console.error('Download image error:', error);
        return c.json({ 
            error: 'Failed to get image data', 
            details: error.message 
        }, 500);
    }
});

// --- API: Download Processed Image ---
app.get('/api/download-processed-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        
        // Get image data with product info
        const result = await c.env.DB.prepare(`
            SELECT 
                i.id,
                i.processed_url,
                i.status,
                p.sku,
                p.name as product_name
            FROM images i
            LEFT JOIN products p ON i.product_id = p.id
            WHERE i.id = ?
        `).bind(imageId).first();
        
        if (!result) {
            return c.json({ error: 'Image not found' }, 404);
        }
        
        // Check if processed image exists
        if (!result.processed_url) {
            return c.json({ 
                error: 'No processed image available',
                message: '白抜き処理が完了していません'
            }, 404);
        }
        
        // Generate filename
        const sku = (result.sku as string) || 'UNKNOWN';
        const imageIdStr = (result.id as number).toString().padStart(4, '0');
        const filename = `${sku}_processed_${imageIdStr}.png`;
        
        return c.json({
            imageUrl: result.processed_url,
            filename: filename,
            sku: sku,
            status: result.status
        });
        
    } catch (error: any) {
        console.error('Download processed image error:', error);
        return c.json({ 
            error: 'Failed to get processed image data', 
            details: error.message 
        }, 500);
    }
});

// --- API: Save Edited Image ---
app.post('/api/save-edited-image/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        const body = await c.req.json();
        const imageData = body.imageData;
        
        if (!imageData) {
            return c.json({ error: 'imageData is required' }, 400);
        }
        
        // Verify image exists
        const imageResult = await c.env.DB.prepare(`
            SELECT * FROM images WHERE id = ?
        `).bind(imageId).first();
        
        if (!imageResult) {
            return c.json({ error: 'Image not found' }, 404);
        }
        
        // Update processed_url with edited image data
        await c.env.DB.prepare(`
            UPDATE images SET processed_url = ?, status = 'completed' WHERE id = ?
        `).bind(imageData, imageId).run();
        
        return c.json({ 
            success: true,
            imageId,
            message: 'Image saved successfully'
        });
        
    } catch (error: any) {
        console.error('Save image error:', error);
        return c.json({ 
            error: 'Failed to save image', 
            details: error.message 
        }, 500);
    }
});

export default app

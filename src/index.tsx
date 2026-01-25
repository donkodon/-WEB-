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

// ==========================================
// Phase 1: Fixed company_id (will be dynamic in Phase 2 with Firebase Auth)
// ==========================================
const FIXED_COMPANY_ID = 'test_company';

// Helper function to get company_id from cookie (Phase 1 dynamic company_id)
function getCompanyId(c: any): string {
  const cookies = c.req.header('Cookie') || '';
  const companyIdMatch = cookies.match(/company_id=([^;]+)/);
  return companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
}

// ==========================================
// ImageUrlHelper: Utility for converting between R2 paths and full URLs
// ==========================================
class ImageUrlHelper {
  static readonly WORKERS_BASE_URL = 'https://image-upload-api.jinkedon2.workers.dev';
  
  /**
   * Convert R2 path to full URL
   * @param r2Path - R2 path (e.g., "test_company/1025L280001/uuid.jpg")
   * @returns Full URL (e.g., "https://image-upload-api.jinkedon2.workers.dev/test_company/1025L280001/uuid.jpg")
   */
  static toFullUrl(r2Path: string): string {
    if (!r2Path) return '';
    // If already a full URL, return as-is
    if (r2Path.startsWith('http://') || r2Path.startsWith('https://')) {
      return r2Path;
    }
    return `${this.WORKERS_BASE_URL}/${r2Path}`;
  }
  
  /**
   * Convert full URL to R2 path
   * @param fullUrl - Full URL (e.g., "https://image-upload-api.jinkedon2.workers.dev/test_company/1025L280001/uuid.jpg")
   * @returns R2 path (e.g., "test_company/1025L280001/uuid.jpg")
   */
  static toR2Path(fullUrl: string): string {
    if (!fullUrl) return '';
    // If already an R2 path (no http://), return as-is
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      return fullUrl;
    }
    try {
      const url = new URL(fullUrl);
      // Remove leading '/' from pathname
      return url.pathname.substring(1);
    } catch (e) {
      console.error('❌ Failed to parse URL:', fullUrl, e);
      return fullUrl;
    }
  }
  
  /**
   * Convert array of full URLs to R2 paths
   * @param fullUrls - Array of full URLs
   * @returns Array of R2 paths
   */
  static toR2Paths(fullUrls: string[]): string[] {
    return fullUrls.map(url => this.toR2Path(url));
  }
  
  /**
   * Convert array of R2 paths to full URLs
   * @param r2Paths - Array of R2 paths
   * @returns Array of full URLs
   */
  static toFullUrls(r2Paths: string[]): string[] {
    return r2Paths.map(path => this.toFullUrl(path));
  }
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
    CREATE TABLE IF NOT EXISTS product_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      company_id TEXT NOT NULL DEFAULT 'test_company',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sku, company_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
    CREATE INDEX IF NOT EXISTS idx_product_master_company_id ON product_master(company_id);
    CREATE INDEX IF NOT EXISTS idx_product_master_sku_company ON product_master(sku, company_id);

    -- Seed
    INSERT OR IGNORE INTO users (email, name) VALUES ('user@example.com', 'Kenji');

    INSERT OR IGNORE INTO product_master (sku, name, category) VALUES 
    ('TSHIRT-001-WHT', 'ベーシックコットンTシャツ（ホワイト）', 'Tops'),
    ('DNM-JCKT-NAVY', 'ヴィンテージデニムジャケット（ネイビー）', 'Outerwear'),
    ('SHIRT-LINEN-BEG', 'リネンシャツ（ベージュ）', 'Tops');
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
        "ALTER TABLE product_master ADD COLUMN brand TEXT",
        "ALTER TABLE product_master ADD COLUMN brand_kana TEXT",
        "ALTER TABLE product_master ADD COLUMN size TEXT",
        "ALTER TABLE product_master ADD COLUMN color TEXT",
        "ALTER TABLE product_master ADD COLUMN category_sub TEXT",
        "ALTER TABLE product_master ADD COLUMN price_cost INTEGER",
        "ALTER TABLE product_master ADD COLUMN season TEXT",
        "ALTER TABLE product_master ADD COLUMN rank TEXT",
        "ALTER TABLE product_master ADD COLUMN release_date TEXT",
        "ALTER TABLE product_master ADD COLUMN buyer TEXT",
        "ALTER TABLE product_master ADD COLUMN store_name TEXT",
        "ALTER TABLE product_master ADD COLUMN price_ref INTEGER",
        "ALTER TABLE product_master ADD COLUMN price_sale INTEGER",
        "ALTER TABLE product_master ADD COLUMN price_list INTEGER",
        "ALTER TABLE product_master ADD COLUMN location TEXT",
        "ALTER TABLE product_master ADD COLUMN stock_quantity INTEGER",
        "ALTER TABLE product_master ADD COLUMN barcode TEXT",
        "ALTER TABLE product_master ADD COLUMN status TEXT",
        "ALTER TABLE product_master ADD COLUMN company_id TEXT NOT NULL DEFAULT 'test_company'"
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
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  <i class="fas fa-building text-blue-600 mr-1"></i>
                  企業ID
                </label>
                <input 
                  type="text" 
                  name="company_id" 
                  value="test_company" 
                  placeholder="例: test_company, ABC_company"
                  class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  required
                />
                <p class="text-xs text-gray-500 mt-1">
                  <i class="fas fa-info-circle mr-1"></i>
                  企業ごとにデータが分離されます（Phase 1: デモ用）
                </p>
              </div>
              
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
  // Get form data
  const formData = await c.req.formData();
  const companyId = formData.get('company_id') || 'test_company';
  const email = formData.get('email');
  
  console.log(`🔐 Login attempt: company_id=${companyId}, email=${email}`);
  
  // Phase 1: Store company_id in cookie (no real authentication)
  // Phase 2: Will use Firebase Auth with custom claims
  
  // Set cookie with company_id (expires in 30 days)
  c.header('Set-Cookie', `company_id=${companyId}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
  
  console.log(`✅ Login successful: company_id=${companyId}`);
  
  return c.redirect('/dashboard')
})

// --- Dashboard / Product List (Screenshot 2) ---
app.get('/dashboard', async (c) => {
  try {
    // ✅ Phase 1: Get company_id from cookie
    const cookies = c.req.header('Cookie') || '';
    const companyIdMatch = cookies.match(/company_id=([^;]+)/);
    const companyId = companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
    
    console.log(`📊 Dashboard access: company_id=${companyId}`);
    
    // Check if D1 database is available
    if (!c.env.DB) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>設定が必要です</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 p-8">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
            <h1 class="text-2xl font-bold text-red-600 mb-4">⚠️ データベース設定が必要です</h1>
            <p class="text-gray-700 mb-4">
              Cloudflare Pages の D1 データベースバインディングが設定されていません。
            </p>
            <div class="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <h2 class="font-bold text-yellow-800 mb-2">設定手順：</h2>
              <ol class="list-decimal list-inside text-yellow-800 space-y-2">
                <li>Cloudflare ダッシュボード → Workers & Pages を開く</li>
                <li>smart-measure プロジェクトを選択</li>
                <li>Settings → Functions → D1 database bindings を開く</li>
                <li>Add binding をクリック</li>
                <li>Variable name: <code class="bg-yellow-100 px-1">DB</code></li>
                <li>D1 database: <code class="bg-yellow-100 px-1">measure-master-db</code> を選択</li>
                <li>Save をクリック</li>
                <li>自動再デプロイを待つ（数分）</li>
              </ol>
            </div>
            <p class="text-sm text-gray-500">
              Database ID: 7fad5dc0-abce-4816-b667-193490cf9650
            </p>
          </div>
        </body>
        </html>
      `)
    }
    
    // ========================================
    // R2バケットから直接画像を取得（シンプル版）
    // product_masterからSKU情報のみ取得し、R2バケットをスキャン
    // ========================================
    
    const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
    
    // 1. product_master テーブルから全てのSKUを取得
    console.log('🔄 Fetching SKUs from product_master table...');
    
    const productMasterResult = await c.env.DB.prepare(`
      SELECT 
        sku,
        name,
        brand,
        size,
        color,
        price_sale,
        barcode,
        category,
        rank
      FROM product_master
      ORDER BY sku
    `).all();
    
    console.log(`✅ Retrieved ${productMasterResult.results.length} SKUs from product_master`);
    
    // 2. SKU別にマップを作成
    const skuMap = new Map<string, any>();
    
    for (const item of productMasterResult.results) {
      const pm = item as any;
      skuMap.set(pm.sku, {
        id: pm.sku, // SKUをIDとして使用
        sku: pm.sku,
        name: pm.name || `商品 ${pm.sku}`,
        brand: pm.brand || null,
        size: pm.size || null,
        color: pm.color || null,
        price_sale: pm.price_sale || 0,
        barcode: pm.barcode || null,
        category: pm.category || null,
        rank: pm.rank || null,
        images: []
      });
    }
    
    // 3. product_items から image_urls を取得（Sequence順を保持）
    console.log('🔄 Fetching image_urls from product_items table...');
    
    const productItemsResult = await c.env.DB.prepare(`
      SELECT sku, image_urls, updated_at 
      FROM product_items
      WHERE image_urls IS NOT NULL AND image_urls != '[]'
    `).all();
    
    console.log(`✅ Retrieved ${productItemsResult.results.length} products with image_urls`);
    
    // 4. R2バケットから全ファイルをリスト（存在確認用）
    let r2FileSet = new Set<string>();
    if (c.env.PRODUCT_IMAGES) {
      try {
        const r2ListResult = await c.env.PRODUCT_IMAGES.list({ limit: 1000 });
        r2FileSet = new Set(r2ListResult.objects.map(obj => obj.key));
        console.log(`📂 R2: Found ${r2FileSet.size} files`);
      } catch (e) {
        console.error(`❌ Failed to list R2 bucket:`, e);
      }
    }
    
    // 5. product_items の image_urls を元に画像リストを構築
    for (const item of productItemsResult.results) {
      const pi = item as any;
      const sku = pi.sku;
      
      // image_urls をパース（JSON配列）
      let imageUrls: string[] = [];
      try {
        imageUrls = JSON.parse(pi.image_urls || '[]');
      } catch (e) {
        console.error(`❌ Failed to parse image_urls for SKU ${sku}:`, e);
        continue;
      }
      
      if (imageUrls.length === 0) continue;
      
      // このSKUがproduct_masterに存在しない場合、追加
      if (!skuMap.has(sku)) {
        skuMap.set(sku, {
          id: sku,
          sku: sku,
          name: `商品 ${sku}`,
          brand: null,
          size: null,
          color: null,
          price_sale: 0,
          barcode: null,
          category: null,
          rank: null,
          images: []
        });
      }
      
      const productData = skuMap.get(sku);
      
      // Phase A: Get updated_at for cache busting
      const updatedAt = pi.updated_at || new Date().toISOString();
      const cacheVersion = new Date(updatedAt).getTime();
      
      // ✅ image_urls の配列順序 = Sequence順（ソート不要）
      console.log(`📷 SKU ${sku}: Processing ${imageUrls.length} images from image_urls`);
      
      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        
        // ✅ Phase 1: imageUrl は R2パスまたはフルURLの可能性がある
        // フルURLの場合: "https://image-upload-api.jinkedon2.workers.dev/test_company/1025L280001/uuid.jpg"
        // R2パスの場合: "test_company/1025L280001/uuid.jpg"
        let r2Path = imageUrl;
        
        // フルURLの場合はR2パスに変換
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          r2Path = ImageUrlHelper.toR2Path(imageUrl);
        }
        
        // R2パスからファイル名を抽出
        // 例: "test_company/1025L280001/uuid.jpg" → "uuid.jpg"
        const pathParts = r2Path.split('/');
        const filename = pathParts[pathParts.length - 1];
        
        // R2キーを構築 (Phase 1: Dynamic company_id from cookie)
        // ✅ 新形式のみ対応: {company_id}/1025L280001/uuid.jpg
        let r2Key = r2Path;
        
        // company_idが含まれていない場合は追加
        if (!r2Path.startsWith(`${companyId}/`)) {
          r2Key = `${companyId}/${r2Path}`;
        }
        
        console.log(`🔍 R2 Key: ${r2Key}`);
        // R2に存在するか確認をスキップ（image-upload-api経由でアクセスするため）
        // if (!r2FileSet.has(r2Key)) {
        //   console.warn(`⚠️ Image not found in R2: ${r2Key}`);
        //   continue;
        // }
        
        // ✅ image-upload-api経由で画像を提供（新形式のみ）
        const IMAGE_UPLOAD_API_URL = 'https://image-upload-api.jinkedon2.workers.dev';
        const proxyUrl = `${IMAGE_UPLOAD_API_URL}/${r2Key}`;
        const imageId = `r2_${sku}_${filename.replace(/\.[^/.]+$/, '')}`;
        
        console.log(`📸 Image URL: ${proxyUrl}`);
        // Phase A: 画像の優先順位チェック
        // 1️⃣ _f.png (最終編集画像) > 2️⃣ _p.png (白抜き画像) > 3️⃣ 元画像
        const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        // ✅ 新形式: 動的 company_id 付きのパス
        const finalKey = `${companyId}/${sku}/${filenameWithoutExt}_f.png`;
        const processedKey = `${companyId}/${sku}/${filenameWithoutExt}_p.png`;
        
        let displayUrl = null;
        let status = 'ready';
        
        // Phase A: 優先順位に基づいて画像を選択
        // 1️⃣ _f.png (編集済み最終画像) > 2️⃣ _p.png (白抜き画像) > 3️⃣ 元画像
        displayUrl = proxyUrl;  // Default: 元画像（image-upload-api経由）
        status = 'ready';
        
        // WEB側のR2バケット（PRODUCT_IMAGES）で白抜き/編集済み画像をチェック
        if (c.env.PRODUCT_IMAGES) {
          try {
            // Check for final edited image (_f.png) - WEB側のR2から配信
            const finalObject = await c.env.PRODUCT_IMAGES.get(finalKey);
            if (finalObject) {
              // WEB側のR2から直接配信（/api/image-proxy経由）
              displayUrl = `/api/image-proxy/${sku}/${filenameWithoutExt}_f.png?v=${Date.now()}`;
              status = 'final';
              console.log(`✅ Found FINAL image: ${finalKey}`);
            } else {
              // Check for processed image (_p.png) - WEB側のR2から配信
              const processedObject = await c.env.PRODUCT_IMAGES.get(processedKey);
              if (processedObject) {
                // WEB側のR2から直接配信（/api/image-proxy経由）
                displayUrl = `/api/image-proxy/${sku}/${filenameWithoutExt}_p.png?v=${Date.now()}`;
                status = 'processed';
                console.log(`✅ Found PROCESSED image: ${processedKey}`);
              } else {
                console.log(`📸 Using ORIGINAL image: ${r2Key}`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error checking R2 for processed images:`, error);
          }
        }
        
        // 画像情報を追加（Sequence順を保持）
        productData.images.push({
          id: imageId,
          original_url: proxyUrl,
          processed_url: displayUrl,  // Phase A: 優先順位に基づいたURL
          status: status,              // Phase A: 'final', 'processed', or 'ready'
          created_at: new Date().toISOString(),
          filename: filename,
          sku: sku,
          sequence: i + 1,            // Sequence番号（1, 2, 3...）
          is_main: i === 0,           // 最初の画像がメイン画像
          updated_at: updatedAt       // Phase A: キャッシュバスティング用
        });
      }
      
      console.log(`✅ SKU ${sku}: Added ${productData.images.length} images in sequence order`);
    }
    
    // 4. 画像のないSKUを除外
    const skuMapFiltered = new Map<string, any>();
    for (const [sku, productData] of skuMap.entries()) {
      if (productData.images.length > 0) {
        skuMapFiltered.set(sku, productData);
      }
    }
    
    // 5. 結果を配列に変換
    const products = Array.from(skuMapFiltered.values());
    
    console.log(`📦 Total products with images: ${products.length}`);
    for (const p of products) {
      console.log(`  - ${p.sku}: ${p.name} (${p.images.length} images)`);
    }

  return c.render(
    <Layout active="dashboard" title="商品画像一覧（SKU別）">
      <div class="mb-6 flex justify-between items-end">
        <p class="text-gray-500 text-sm">撮影済み画像の管理・編集・ダウンロードが可能です。</p>
        <div class="flex space-x-3">
            <button id="btn-auto-measure" class="px-4 py-2 text-sm font-medium text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 focus:z-10 focus:ring-2 focus:ring-purple-500 focus:text-purple-700 flex items-center shadow-sm">
                <i class="fas fa-ruler-combined mr-2"></i>
                選択画像を自動採寸
            </button>
            <button id="btn-batch-remove-bg" class="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 focus:z-10 focus:ring-2 focus:ring-blue-500 focus:text-blue-700 flex items-center shadow-sm">
                <i class="fas fa-magic mr-2"></i>
                選択画像を白抜き
            </button>
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
                商品データDL
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
                                const imgResponse = await fetch(data.imageUrl, {
                                    cache: 'no-cache'  // Always fetch fresh data, bypass browser cache
                                });
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
        
        // Product Data Download Function (商品データDL)
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
                
                const confirmation = confirm(imageIds.length + '枚の商品データ（画像+CSV）をZIPでダウンロードしますか？');
                if (!confirmation) return;
                
                try {
                    btnDownloadProcessed.disabled = true;
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>商品データ作成中...';
                    
                    // Create ZIP file
                    const zip = new JSZip();
                    const imagesFolder = zip.folder('images');
                    let imageSuccessCount = 0;
                    let imageSkipCount = 0;
                    const filenameSet = new Set(); // Track filenames to prevent duplicates
                    
                    console.log('📊 Total images to process:', imageIds.length);
                    console.log('📋 Image IDs:', imageIds);
                    
                    // Step 1: Download images
                    for (const imageId of imageIds) {
                        try {
                            console.log('🔄 Processing imageId:', imageId);
                            const response = await fetch('/api/download-product-data/' + imageId);
                            if (!response.ok) {
                                console.error('Failed to download product image:', imageId);
                                imageSkipCount++;
                                continue;
                            }
                            
                            const data = await response.json();
                            console.log('📦 Response data:', data);
                            
                            if (!data.imageUrl) {
                                console.warn('No image available for:', imageId);
                                imageSkipCount++;
                                continue;
                            }
                            
                            if (!data.filename) {
                                console.error('Invalid response for image:', imageId);
                                imageSkipCount++;
                                continue;
                            }
                            
                            console.log('📝 Generated filename:', data.filename);
                            
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
                            console.log('✅ Final unique filename:', uniqueFilename);
                            console.log('📁 Current filenameSet size:', filenameSet.size);
                            console.log('📁 Filenames in set:', Array.from(filenameSet));
                            
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
                                    console.log('✅ Adding to ZIP (data URL):', uniqueFilename, 'Size:', blob.size);
                                    imagesFolder.file(uniqueFilename, blob);
                                    imageSuccessCount++;
                                    console.log('✅ Successfully added. Total success count:', imageSuccessCount);
                                } else {
                                    console.error('Failed to create blob for:', imageId);
                                    imageSkipCount++;
                                }
                            } else {
                                // For regular URLs, fetch and add to ZIP
                                console.log('Fetching image from URL:', data.imageUrl);
                                const imgResponse = await fetch(data.imageUrl, {
                                    cache: 'no-cache'  // Always fetch fresh data, bypass browser cache
                                });
                                if (!imgResponse.ok) {
                                    console.error('Failed to fetch image:', imgResponse.status);
                                    imageSkipCount++;
                                    continue;
                                }
                                const blob = await imgResponse.blob();
                                console.log('Got blob, size:', blob.size);
                                if (blob.size > 0) {
                                    console.log('✅ Adding to ZIP (URL):', uniqueFilename, 'Size:', blob.size);
                                    imagesFolder.file(uniqueFilename, blob);
                                    imageSuccessCount++;
                                    console.log('✅ Successfully added. Total success count:', imageSuccessCount);
                                } else {
                                    console.error('Empty blob for:', imageId);
                                    imageSkipCount++;
                                }
                            }
                        } catch (e) {
                            console.error('❌ Error downloading product image ' + imageId + ':', e);
                            console.error('❌ Error stack:', e.stack);
                            imageSkipCount++;
                        }
                        
                        console.log('🔄 Loop iteration complete. Success:', imageSuccessCount, 'Skip:', imageSkipCount);
                    }
                    
                    console.log('🏁 Image processing finished. Final counts - Success:', imageSuccessCount, 'Skip:', imageSkipCount);
                    
                    // Step 2: Generate CSV
                    console.log('📄 Generating CSV...');
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>CSV生成中...';
                    
                    try {
                        const csvResponse = await fetch('/api/export-product-items', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ imageIds })
                        });
                        
                        if (csvResponse.ok) {
                            const csvBlob = await csvResponse.blob();
                            console.log('✅ CSV generated, size:', csvBlob.size);
                            zip.file('商品情報.csv', csvBlob);
                        } else {
                            console.error('CSV generation failed:', csvResponse.status);
                        }
                    } catch (csvError) {
                        console.error('❌ CSV generation error:', csvError);
                    }
                    
                    // Step 3: Generate and download ZIP
                    console.log('📦 Generating ZIP file...');
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>ZIP作成中...';
                    
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    const timestamp = new Date().toISOString().slice(0, 10);
                    console.log('✅ ZIP generated, size:', zipBlob.size);
                    saveAs(zipBlob, '商品データ_' + timestamp + '.zip');
                    
                    let message = '商品データダウンロード完了\\n画像: ' + imageSuccessCount + '枚';
                    if (imageSkipCount > 0) {
                        message += '\\nスキップ: ' + imageSkipCount + '枚';
                    }
                    message += '\\nCSV: 1ファイル';
                    alert(message);
                } catch (e) {
                    console.error('Product data download error:', e);
                    alert('商品データダウンロードに失敗しました: ' + e.message);
                } finally {
                    btnDownloadProcessed.disabled = false;
                    btnDownloadProcessed.innerHTML = '<i class="fas fa-magic mr-2"></i>商品データDL';
                }
            });
        })();
      `}} />
      
      {/* Background Removal Script */}
      <script dangerouslySetInnerHTML={{__html: `
        (function() {
            console.log('🚀 Background Removal Script Loaded!');
            
            // Fixed model: withoutbg (birefnet-general)
            window.currentBgModel = 'birefnet-general';
            
            function initBatchRemoveBg() {
                console.log('📌 initBatchRemoveBg called!');
                
                const batchBtn = document.getElementById('btn-batch-remove-bg');
                
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
                    
                    const confirmation = confirm(checkedImages.length + '枚の画像の背景を削除しますか？');
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
                            console.log('🎨 Starting background removal for image ID:', imageId);
                            const res = await fetch('/api/remove-bg-image/' + imageId, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: 'birefnet-general'
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
                const confirmation = confirm('双方向同期を実行しますか？\\n\\n1. WEBアプリ → モバイルAPI（CSVデータを送信）\\n2. モバイルAPI → WEBアプリ（スマホデータを受信）');
                
                if (!confirmation) return;
                
                // Show loading state
                btnSyncMobile.disabled = true;
                btnSyncMobile.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>同期中...';
                
                try {
                    // Step 1: Sync TO mobile (WEB → Mobile API)
                    console.log('🔄 Step 1/2: Syncing to mobile API...');
                    const toMobileResponse = await fetch('/api/sync-to-mobile', {
                        method: 'POST'
                    });
                    
                    let toMobileResult = { synced: 0, errors: 0 };
                    if (toMobileResponse.ok) {
                        toMobileResult = await toMobileResponse.json();
                        console.log('✅ Sync to mobile completed:', toMobileResult);
                    }
                    
                    // Step 2: Sync FROM mobile (Mobile API → WEB)
                    console.log('🔄 Step 2/2: Syncing from mobile API...');
                    const fromMobileResponse = await fetch('/api/sync-from-mobile', {
                        method: 'POST'
                    });
                    
                    if (!fromMobileResponse.ok) {
                        throw new Error('Sync failed with status: ' + fromMobileResponse.status);
                    }
                    
                    const fromMobileResult = await fromMobileResponse.json();
                    
                    if (fromMobileResult.success) {
                        alert('✅ 双方向同期完了\\n\\n【WEB → モバイルAPI】\\n送信: ' + toMobileResult.synced + '件\\nエラー: ' + toMobileResult.errors + '件\\n\\n【モバイルAPI → WEB】\\n更新: ' + fromMobileResult.synced + '件\\n新規: ' + fromMobileResult.inserted + '件');
                        window.location.reload();
                    } else {
                        throw new Error(fromMobileResult.error || 'Unknown error');
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
            
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 image-grid" data-sku={product.sku}>
                {/* Debug Info */}
                {product.images.length === 0 && (
                  <div class="col-span-full text-center py-8 text-gray-400">
                    <i class="fas fa-image text-3xl mb-2"></i>
                    <p class="text-sm">画像がありません（SKU: {product.sku}）</p>
                  </div>
                )}
                
                {/* Existing Images */}
                {product.images.map((img: any) => (
                   <div class="relative group aspect-square cursor-move sortable-item" data-image-id={img.id}>
                       <div class="w-full h-full bg-white rounded-lg overflow-hidden border border-gray-100 relative">
                           <img src={img.processed_url || img.original_url} class="w-full h-full object-cover p-2" style="background-color: white;" />
                           
                           {/* Drag Handle */}
                           <div class="drag-handle absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded px-1.5 py-1 shadow-sm cursor-grab active:cursor-grabbing">
                               <i class="fas fa-grip-vertical text-gray-500 text-sm"></i>
                           </div>
                           
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
      
      {/* Sortable.js for Drag & Drop */}
      <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
      
      {/* Initialize Sortable for each image grid */}
      <script dangerouslySetInnerHTML={{__html: `
        document.addEventListener('DOMContentLoaded', () => {
          console.log('🎯 Initializing Sortable for image grids...');
          
          // Find all image grids
          const imageGrids = document.querySelectorAll('.image-grid');
          console.log('📦 Found', imageGrids.length, 'image grids');
          
          imageGrids.forEach((gridEl, index) => {
            const sku = gridEl.dataset.sku;
            
            if (!sku) {
              console.warn('⚠️ No SKU found for grid', index);
              return;
            }
            
            console.log('✅ Setting up Sortable for SKU:', sku);
            
            new Sortable(gridEl, {
              animation: 150,
              handle: '.drag-handle',
              draggable: '.sortable-item',
              ghostClass: 'sortable-ghost',
              dragClass: 'sortable-drag',
              onEnd: async (evt) => {
                console.log('🔄 Drag ended for SKU:', sku);
                console.log('   Old index:', evt.oldIndex, '→ New index:', evt.newIndex);
                
                // 新しい順序を取得
                const imageIds = Array.from(gridEl.querySelectorAll('.sortable-item[data-image-id]'))
                  .map(el => el.dataset.imageId)
                  .filter(id => id); // undefined を除外
                
                console.log('📋 New order:', imageIds);
                
                if (imageIds.length === 0) {
                  console.warn('⚠️ No image IDs found');
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
                    console.log('✅ Order saved:', result);
                    
                    // 成功メッセージを表示（3秒後に消える）
                    const toast = document.createElement('div');
                    toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
                    toast.innerHTML = '<i class="fas fa-check mr-2"></i>画像の順序を保存しました';
                    document.body.appendChild(toast);
                    setTimeout(() => {
                      toast.style.animation = 'fade-out 0.3s';
                      setTimeout(() => toast.remove(), 300);
                    }, 3000);
                    
                    // ページをリロード（更新された順序を表示）
                    setTimeout(() => location.reload(), 1000);
                  } else {
                    console.error('❌ Failed to save order:', result);
                    alert('順序の保存に失敗しました: ' + (result.error || '不明なエラー'));
                    location.reload(); // 元の順序に戻す
                  }
                } catch (error) {
                  console.error('❌ Reorder error:', error);
                  alert('順序の保存中にエラーが発生しました');
                  location.reload(); // 元の順序に戻す
                }
              }
            });
          });
        });
      `}} />
      
      {/* CSS for Sortable animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .sortable-ghost {
          opacity: 0.4;
          background-color: #e0f2fe;
        }
        .sortable-drag {
          cursor: grabbing !important;
          transform: rotate(2deg);
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .drag-handle:hover {
          background-color: rgba(255,255,255,1);
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(20px); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s;
        }
      `}} />
      
      <div class="mt-8 flex justify-between items-center text-sm text-gray-500">
          <span>全 {products.length} 件を表示中</span>
      </div>
    </Layout>
  )
  } catch (error) {
    console.error('Dashboard error:', error);
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>エラー</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 p-8">
        <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 class="text-2xl font-bold text-red-600 mb-4">⚠️ データベース接続エラー</h1>
          <p class="text-gray-700 mb-4">
            Cloudflare Pages の D1 データベースバインディングが設定されていません。
          </p>
          <div class="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
            <h2 class="font-bold text-yellow-800 mb-2">設定手順：</h2>
            <ol class="list-decimal list-inside text-yellow-800 space-y-2">
              <li>Cloudflare ダッシュボード → Workers & Pages を開く</li>
              <li>smart-measure プロジェクトを選択</li>
              <li>Settings → Functions → D1 database bindings を開く</li>
              <li>Add binding をクリック</li>
              <li>Variable name: <code class="bg-yellow-100 px-1">DB</code></li>
              <li>D1 database: <code class="bg-yellow-100 px-1">measure-master-db</code> を選択</li>
              <li>Save をクリック</li>
              <li>自動再デプロイを待つ（数分）</li>
            </ol>
          </div>
          <details class="mt-4">
            <summary class="cursor-pointer text-sm text-gray-500">エラー詳細</summary>
            <pre class="mt-2 p-2 bg-gray-100 text-xs overflow-auto">${error instanceof Error ? error.message : String(error)}</pre>
          </details>
        </div>
      </body>
      </html>
    `)
  }
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

    // images table removed

    return c.json({ success: true });
});

// --- Editor (Screenshot 3) ---
app.get('/edit/:id', async (c) => {
  const id = c.req.param('id')
  
  // Parse R2 image ID: r2_{SKU}_{filename_without_ext}
  let imageResult: any = null;
  
  if (id.startsWith('r2_')) {
    const parts = id.replace('r2_', '').split('_');
    
    if (parts.length >= 2) {
      const sku = parts[0];
      const filenamePart = parts.slice(1).join('_');
      
      // Option 1: Use same logic as dashboard (r2FileSet + proxy URL + cache busting)
      
      // 1. Get updated_at from D1 for cache busting
      let updatedAt = new Date().toISOString();
      try {
        const dbResult = await c.env.DB.prepare(`
          SELECT updated_at FROM product_items WHERE sku = ? LIMIT 1
        `).bind(sku).first();
        if (dbResult && dbResult.updated_at) {
          updatedAt = dbResult.updated_at as string;
        }
      } catch (e) {
        console.warn(`⚠️ Failed to get updated_at for SKU ${sku}:`, e);
      }
      const cacheVersion = new Date(updatedAt).getTime();
      
      // 2. List R2 bucket to check file existence
      let r2FileSet = new Set<string>();
      if (c.env.PRODUCT_IMAGES) {
        try {
          const r2ListResult = await c.env.PRODUCT_IMAGES.list({ limit: 1000 });
          r2FileSet = new Set(r2ListResult.objects.map(obj => obj.key));
          console.log(`📂 Edit screen: R2 has ${r2FileSet.size} files`);
        } catch (e) {
          console.error(`❌ Failed to list R2 bucket:`, e);
        }
      }
      
      // 3. Check for images in priority order: _f.png > _p.png > .jpg (Phase 1: Dynamic company_id)
      const companyId = getCompanyId(c);
      const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
      const processedKey = `${companyId}/${sku}/${filenamePart}_p.png`;
      const originalKey = `${companyId}/${sku}/${filenamePart}.jpg`;
      
      let baseImageUrl = null;
      let originalUrl = null;
      let status = 'ready';
      
      if (r2FileSet.has(finalKey)) {
        baseImageUrl = `/api/image-proxy/${sku}/${filenamePart}_f.png?v=${cacheVersion}`;
        status = 'final';
        console.log(`✅ Edit screen using final image: ${finalKey}`);
      } else if (r2FileSet.has(processedKey)) {
        baseImageUrl = `/api/image-proxy/${sku}/${filenamePart}_p.png?v=${cacheVersion}`;
        status = 'processed';
        console.log(`✅ Edit screen using processed image: ${processedKey}`);
      } else {
        console.log(`ℹ️ Edit screen using original image`);
      }
      
      // Set original URL (always .jpg)
      originalUrl = `/api/image-proxy/${sku}/${filenamePart}.jpg?v=${cacheVersion}`;
      
      imageResult = {
        id: id,
        original_url: originalUrl,
        processed_url: baseImageUrl || originalUrl,  // Fallback to original if no processed version
        sku: sku,
        product_name: `商品 ${sku}`,
        status: status
      };
    }
  }
  
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
                const imageId = "${id}";
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
                
                // --- ERASER PATHS TRACKING (Phase 2.5) ---
                let eraserPaths = []; // Array of {id, points, size, opacity, timestamp}
                let currentPath = null; // Current path being drawn

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
                img.onload = async () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    maskCanvas.width = img.width;
                    maskCanvas.height = img.height;
                    
                    // Load saved edit settings from R2
                    await loadEditSettings();
                    
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

                // --- LOAD EDIT SETTINGS (Phase 2.5) ---
                const loadEditSettings = async () => {
                    try {
                        const imageId = '${id}';
                        console.log('📖 Loading edit settings for:', imageId);
                        
                        const response = await fetch('/api/edit-settings/' + imageId);
                        const data = await response.json();
                        
                        if (data.exists && data.settings) {
                            console.log('✅ Edit settings loaded:', data.settings);
                            
                            // Apply adjustments to UI sliders
                            if (data.settings.adjustments) {
                                const adj = data.settings.adjustments;
                                
                                if (adj.brightness !== undefined) {
                                    state.brightness = adj.brightness;
                                    els.brightness.value = adj.brightness;
                                    els.valBrightness.textContent = adj.brightness;
                                }
                                
                                if (adj.hue !== undefined) {
                                    state.hue = adj.hue;
                                    els.hue.value = adj.hue;
                                    els.valHue.textContent = adj.hue;
                                }
                                
                                if (adj.wb !== undefined) {
                                    state.wb = adj.wb;
                                    els.wb.value = adj.wb;
                                    els.valWb.textContent = adj.wb;
                                }
                            }
                            
                            // Restore eraser paths to maskCanvas
                            if (data.settings.eraser_paths && data.settings.eraser_paths.length > 0) {
                                eraserPaths = data.settings.eraser_paths;
                                console.log('🎨 Restoring', eraserPaths.length, 'eraser paths');
                                
                                // Redraw all eraser paths on maskCanvas
                                eraserPaths.forEach(path => {
                                    if (!path.points || path.points.length < 2) return;
                                    
                                    maskCtx.lineWidth = (path.size || 24) * 2;
                                    maskCtx.lineCap = 'round';
                                    maskCtx.lineJoin = 'round';
                                    maskCtx.globalCompositeOperation = 'source-over';
                                    maskCtx.strokeStyle = 'rgba(0,0,0,1)';
                                    
                                    maskCtx.beginPath();
                                    maskCtx.moveTo(path.points[0][0], path.points[0][1]);
                                    
                                    for (let i = 1; i < path.points.length; i++) {
                                        maskCtx.lineTo(path.points[i][0], path.points[i][1]);
                                    }
                                    
                                    maskCtx.stroke();
                                });
                                
                                console.log('✅ Eraser paths restored to maskCanvas');
                            }
                        } else {
                            console.log('⚠️ No saved settings found, using defaults');
                        }
                    } catch (error) {
                        console.error('❌ Error loading edit settings:', error);
                    }
                };
                
                // --- SAVE EDIT SETTINGS (Phase 2.5) ---
                const saveEditSettings = async () => {
                    try {
                        const imageId = '${id}';
                        console.log('💾 Saving edit settings for:', imageId);
                        
                        // Collect current adjustments from state
                        const adjustments = {
                            brightness: state.brightness,
                            hue: state.hue,
                            wb: state.wb
                        };
                        
                        // Send to API
                        const response = await fetch('/api/edit-settings/' + imageId, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                adjustments: adjustments,
                                eraser_paths: eraserPaths
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            console.log('✅ Edit settings saved successfully');
                        } else {
                            console.error('❌ Failed to save edit settings:', result.error);
                        }
                    } catch (error) {
                        console.error('❌ Error saving edit settings:', error);
                    }
                };

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
                    // Show saving state
                    els.btnSave.disabled = true;
                    els.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 保存中...';
                    
                    try {
                        // Phase A: Save both Canvas image (_f.png) and settings.json
                        
                        // 1. Create temporary canvas with white background
                        // This prevents transparent pixels from having black RGB values (0,0,0)
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = canvas.width;
                        tempCanvas.height = canvas.height;
                        const tempCtx = tempCanvas.getContext('2d');
                        
                        // Draw white background first
                        tempCtx.fillStyle = '#FFFFFF';
                        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                        
                        // Draw edited image on top (with transparency preserved)
                        tempCtx.drawImage(canvas, 0, 0);
                        
                        // 2. Get Canvas data as base64 (transparent pixels now have white RGB values)
                        const imageData = tempCanvas.toDataURL('image/png');
                        
                        console.log('📸 Image data prepared with white background for transparent pixels');
                        
                        // 3. Save Canvas image as _f.png
                        const saveImageResponse = await fetch('/api/save-edited-image/' + imageId, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageData: imageData })
                        });
                        
                        if (!saveImageResponse.ok) {
                            const error = await saveImageResponse.json();
                            throw new Error(error.details || error.error || 'Failed to save image');
                        }
                        
                        // 4. Save edit settings to settings.json
                        await saveEditSettings();
                        
                        alert('編集内容を保存しました！');
                        window.location.href = '/dashboard';
                        
                    } catch (e) {
                        console.error('Save error:', e);
                        alert('保存中にエラーが発生しました: ' + e.message);
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
                            
                            // Start tracking eraser path (Phase 2.5)
                            if (state.tool === 'eraser') {
                                currentPath = {
                                    id: 'path_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                                    points: [[pos.x, pos.y]],
                                    size: state.brushSize,
                                    opacity: 1.0,
                                    timestamp: new Date().toISOString()
                                };
                            }
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
                            
                            // Add point to current path (Phase 2.5)
                            if (currentPath) {
                                currentPath.points.push([pos.x, pos.y]);
                            }
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
                        
                        // Save completed eraser path (Phase 2.5)
                        if (state.tool === 'eraser' && currentPath && currentPath.points.length > 1) {
                            eraserPaths.push(currentPath);
                            console.log('✅ Eraser path saved:', currentPath.id, 'Points:', currentPath.points.length);
                            currentPath = null;
                        }
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
                 
                 <input type="file" id="csv-input" class="hidden" accept=".csv,.tsv,text/csv,text/tab-separated-values" />
                 <div id="drop-zone" class="border-2 border-dashed border-blue-100 bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-colors h-64">
                     <div class="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mb-4 text-blue-500 text-2xl pointer-events-none">
                         <i class="fas fa-cloud-upload-alt"></i>
                     </div>
                     <p id="file-name" class="font-bold text-blue-600 mb-1 pointer-events-none">クリックして選択 <span class="text-gray-500 font-normal">またはドラッグ＆ドロップ</span></p>
                     <p class="text-xs text-gray-400 pointer-events-none">CSV, TSV (最大 10MB)</p>
                 </div>
                 
                 <div class="flex items-center justify-between mt-4">
                     <div class="text-xs text-green-600 flex items-center font-medium">
                         <i class="fas fa-check-circle mr-1"></i> 最新のインポート: 2023/10/24 14:30
                     </div>
                     <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">完了</span>
                 </div>
                 
                 <div class="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
                     <a href="/api/download-csv-template" download="product_master_template.csv" class="text-sm text-blue-600 hover:underline flex items-center">
                         <i class="fas fa-download mr-1"></i> テンプレートCSVをダウンロード
                     </a>
                     <button id="btn-import" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                         インポート実行
                     </button>
                 </div>
                 {/* CSV Import Script - External File */}
                 <script src="/static/csv-import.js"></script>
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
    console.log('📥 CSV Import API called');
    
    // Get company_id from cookie (Phase 1: Dynamic company_id)
    const companyId = getCompanyId(c);
    console.log(`📦 CSV Import: company_id=${companyId}`);
    
    const body = await c.req.parseBody();
    const file = body['csv'];
    
    console.log('📁 Received file:', file ? 'YES' : 'NO', file instanceof File ? '(File object)' : '(Not a File)');
    
    if (!file || !(file instanceof File)) {
        console.error('❌ No valid file uploaded');
        return c.text('No file uploaded', 400);
    }
    
    console.log('📄 File details:', {
        name: file.name,
        type: file.type,
        size: file.size
    });

    const buffer = await file.arrayBuffer();
    console.log('✅ File read as buffer, size:', buffer.byteLength, 'bytes');
    
    // Check for UTF-8 BOM
    const hasUtf8Bom = buffer.byteLength >= 3 && 
        new Uint8Array(buffer, 0, 3).toString() === '239,187,191';
    
    // Try UTF-8 first (most common)
    let text = new TextDecoder('utf-8').decode(buffer);
    let encoding = 'UTF-8';
    
    // Detect mojibake (garbled text) - check for replacement characters or invalid UTF-8 patterns
    // Common signs: � (U+FFFD), or garbled Japanese patterns like �o�[�R
    const hasMojibake = text.includes('�') || 
                        /[\x80-\xFF]{2,}/.test(text.substring(0, 500)) || // Multiple high bytes in sequence
                        (text.includes('��') && !text.includes('日本語')); // Garbled Japanese
    
    console.log('🔍 Encoding detection:', {
        hasUtf8Bom,
        hasMojibake,
        firstLinePreview: text.split(/\r\n|\n|\r/)[0].substring(0, 100)
    });
    
    // If UTF-8 BOM is present, force UTF-8
    if (hasUtf8Bom) {
        console.log('✅ UTF-8 BOM detected, using UTF-8');
        encoding = 'UTF-8';
    }
    // If mojibake detected and no UTF-8 BOM, try Shift-JIS
    else if (hasMojibake) {
        console.log('⚠️ Mojibake detected, trying Shift-JIS...');
        try {
            text = new TextDecoder('shift-jis').decode(buffer);
            encoding = 'Shift-JIS';
            console.log('✅ Shift-JIS decoding successful');
            console.log('📝 First line after Shift-JIS:', text.split(/\r\n|\n|\r/)[0].substring(0, 100));
        } catch (e) {
            console.warn('⚠️ Shift-JIS decoding failed, keeping UTF-8:', e);
            encoding = 'UTF-8 (fallback)';
        }
    } else {
        console.log('✅ UTF-8 decoding looks good');
    }

    const lines = text.split(/\r\n|\n|\r/);
    
    // Robust CSV parser that handles:
    // 1. Quoted fields with commas inside
    // 2. Escaped quotes ("") inside quoted fields
    // 3. Empty fields
    // 4. Mixed quoted/unquoted fields
    const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            if (inQuotes) {
                if (char === '"') {
                    // Check for escaped quote ("")
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        currentField += '"';
                        i += 2;
                        continue;
                    } else {
                        // End of quoted field
                        inQuotes = false;
                        i++;
                        continue;
                    }
                } else {
                    currentField += char;
                    i++;
                }
            } else {
                if (char === '"') {
                    // Start of quoted field
                    inQuotes = true;
                    i++;
                } else if (char === ',') {
                    // End of field
                    result.push(currentField.trim());
                    currentField = '';
                    i++;
                } else {
                    currentField += char;
                    i++;
                }
            }
        }
        
        // Don't forget the last field
        result.push(currentField.trim());
        
        return result;
    };
    
    // Parse header row using the same parser
    const headers = parseCSVLine(lines[0]);
    
    // Debug: Log raw headers
    console.log('📄 Raw CSV Headers (count=' + headers.length + '):', headers.slice(0, 10).join(' | ') + '...');

    // Mapping indexes based on header row (exact match first, then fuzzy matching)
    // User requested specific column mapping:
    // A:バーコード, B:ID, C:ブランド, E:品名/商品名, F:サイズ, G:カラー, L:商品ランク, Y:現状売価
    const getIndex = (names: string[]): number => {
        // First try exact match (case-insensitive)
        for (const name of names) {
            const exactIdx = headers.findIndex(h => h && h.toLowerCase() === name.toLowerCase());
            if (exactIdx > -1) {
                console.log(`✅ Exact match: "${name}" -> column ${exactIdx}`);
                return exactIdx;
            }
        }
        // Then try partial match (contains)
        for (const name of names) {
            const partialIdx = headers.findIndex(h => h && h.includes(name));
            if (partialIdx > -1) {
                console.log(`✅ Partial match: "${name}" found in "${headers[partialIdx]}" -> column ${partialIdx}`);
                return partialIdx;
            }
        }
        console.log(`⚠️ No match found for: ${names.join(', ')}`);
        return -1;
    };
    
    // Safe getter for row values (handles negative index)
    const getRowValue = (row: string[], idx: number): string | null => {
        if (idx < 0 || idx >= row.length) return null;
        const val = row[idx];
        return (val === undefined || val === null || val.trim() === '') ? null : val.trim();
    };
    
    // Explicit priority mapping based on user request
    // IMPORTANT: Order matters - put exact/preferred match first
    const idx = {
        barcode: getIndex(['バーコード', 'Barcode']),      // Col A
        sku: getIndex(['ID', 'sku', 'SKU', '商品コード']),  // Col B
        brand: getIndex(['ブランド', 'Brand']),            // Col C
        brand_kana: getIndex(['ブランドカナ', 'BrandKana']), // Col D
        // FIXED: Put '商品名' before '品名' - most CSVs use '商品名'
        name: getIndex(['商品名', '品名', 'Name', 'ProductName']),  // Col E
        size: getIndex(['サイズ', 'Size']),                // Col F
        color: getIndex(['カラー', 'Color', '色']),        // Col G
        // Cols H-K skipped
        rank: getIndex(['商品ランク', 'ランク', 'Rank']),  // Col L
        // Cols M-X skipped
        // FIXED: Add more price column variations
        price_sale: getIndex(['現状売価', '販売価格', '販売価格(税抜)', '売価', 'Price', 'SalePrice']), // Col Y
        
        // Keep these for supplementary info if available, but lower priority
        stock: getIndex(['在数', '在数(現在)', 'Stock', '在庫数']),
        status: getIndex(['ステータス', 'Status']),
        price_cost: getIndex(['仕入単価', '仕入金額', 'Cost', '原価']),
        category: getIndex(['カテゴリ大', 'Category', 'カテゴリ']),
        category_sub: getIndex(['カテゴリ小', 'SubCategory']),
        season: getIndex(['シーズン', 'Season']),
        buyer: getIndex(['バイヤー', 'Buyer']),
        store: getIndex(['店舗名', 'Store']),
        ref_price: getIndex(['参考上代', '参考上代(税抜)', 'RefPrice']),
        list_price: getIndex(['出品価格', '出品価格(税抜)', 'ListPrice']),
        location: getIndex(['保管場所', 'Location'])
    };
    
    // Validate required columns
    const missingRequired: string[] = [];
    if (idx.sku < 0) missingRequired.push('SKU/ID');
    if (idx.name < 0) missingRequired.push('商品名/品名');
    
    if (missingRequired.length > 0) {
        console.error('❌ Missing required columns:', missingRequired);
        console.error('Available headers:', headers);
    }

    let count = 0;
    let skippedRows: { row: number; reason: string; data: string }[] = [];
    let problemRows: { row: number; sku: string; reason: string; rawData: string[] }[] = [];
    
    // Debug: Log index mapping
    console.log('📋 CSV Index Mapping:', JSON.stringify(idx, null, 2));
    console.log('📋 Headers:', JSON.stringify(headers, null, 2));
    
    // Prepared statement for insertion (with company_id)
    const stmt = c.env.DB.prepare(`
        INSERT OR REPLACE INTO product_master (
            sku, name, brand, brand_kana, size, color, price_cost, price_sale, 
            stock_quantity, barcode, status, category, category_sub, season, 
            rank, buyer, store_name, price_ref, price_list, location, company_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batch = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = parseCSVLine(line);
        
        // Debug: Log first row
        if (i === 1) {
            console.log('🔍 First Row Parsed:', JSON.stringify(row, null, 2));
            console.log('🔍 SKU (idx=' + idx.sku + '):', row[idx.sku]);
            console.log('🔍 Name (idx=' + idx.name + '):', row[idx.name]);
            console.log('🔍 Brand (idx=' + idx.brand + '):', row[idx.brand]);
            console.log('🔍 Size (idx=' + idx.size + '):', row[idx.size]);
            console.log('🔍 Color (idx=' + idx.color + '):', row[idx.color]);
            console.log('🔍 Price Sale (idx=' + idx.price_sale + '):', row[idx.price_sale]);
        }
        
        // Use safe getter for all values
        const rowSku = getRowValue(row, idx.sku);
        const rowName = getRowValue(row, idx.name);
        
        // Debug: Log problematic rows
        if (!rowSku && !rowName) {
            const reason = `No SKU (idx=${idx.sku}) or Name (idx=${idx.name}). Row has ${row.length} fields.`;
            console.log(`⚠️ Row ${i} skipped: ${reason}`);
            skippedRows.push({ row: i, reason, data: row.slice(0, 5).join('|') });
            continue;
        }
        
        // If we have SKU but no name, log a warning (this causes '不明な製品')
        if (rowSku && !rowName) {
            const reason = `SKU exists but NAME is empty/null. name_idx=${idx.name}, row[${idx.name}]="${row[idx.name]}"`;
            console.log(`⚠️ Row ${i} - SKU "${rowSku}": ${reason}`);
            console.log(`   Raw row data (first 10 fields): ${row.slice(0, 10).map((v, j) => `[${j}]="${v}"`).join(', ')}`);
            problemRows.push({ row: i, sku: rowSku, reason, rawData: row.slice(0, 10) });
        }

        const sku = rowSku || `UNKNOWN-${Date.now()}-${i}`;
        const name = rowName || '不明な製品';
        
        const cleanInt = (val: string) => {
            if (!val) return 0;
            return parseInt(val.replace(/,/g, '').replace(/[¥￥]/g, '')) || 0;
        };

        // Use safe getter for all values (including company_id)
        batch.push(stmt.bind(
            sku,
            name,
            getRowValue(row, idx.brand),
            getRowValue(row, idx.brand_kana),
            getRowValue(row, idx.size),
            getRowValue(row, idx.color),
            cleanInt(getRowValue(row, idx.price_cost) || '0'),
            cleanInt(getRowValue(row, idx.price_sale) || '0'),
            cleanInt(getRowValue(row, idx.stock) || '0'),
            getRowValue(row, idx.barcode),
            getRowValue(row, idx.status) || 'Active',
            getRowValue(row, idx.category),
            getRowValue(row, idx.category_sub),
            getRowValue(row, idx.season),
            getRowValue(row, idx.rank),
            getRowValue(row, idx.buyer),
            getRowValue(row, idx.store),
            cleanInt(getRowValue(row, idx.ref_price) || '0'),
            cleanInt(getRowValue(row, idx.list_price) || '0'),
            getRowValue(row, idx.location),
            companyId,  // Add company_id from cookie
            new Date().toISOString()
        ));
        
        count++;
        
        // Execute batch every 50 rows
        if (batch.length >= 50) {
            console.log(`💾 Executing batch: ${batch.length} rows`);
            await c.env.DB.batch(batch);
            console.log(`✅ Batch executed successfully`);
            batch.length = 0;
        }
    }
    
    if (batch.length > 0) {
        console.log(`💾 Executing final batch: ${batch.length} rows`);
        await c.env.DB.batch(batch);
        console.log(`✅ Final batch executed successfully`);
    }
    
    console.log(`✅ CSV Import Complete: ${count} rows inserted/updated in database`);

    // Return detailed response for debugging
    return c.json({
        success: true,
        message: `${count} 件の商品データをインポートしました。`,
        count: count,
        debug: {
            encoding: encoding, // Show detected encoding
            totalLines: lines.length,
            headerCount: headers.length,
            headers: headers.slice(0, 15), // First 15 headers for debugging
            indexMapping: idx,
            skippedCount: skippedRows.length,
            skippedRows: skippedRows.slice(0, 5), // First 5 skipped rows
            problemCount: problemRows.length,
            problemRows: problemRows.slice(0, 10), // First 10 problem rows (不明な製品)
            firstRowSample: count > 0 ? '解析済み' : 'データなし'
        }
    });
});

// --- API: Download CSV Template ---
app.get('/api/download-csv-template', async (c) => {
    const csvTemplate = `sku,barcode,name,brand,category,size,color,price,status
SAMPLE-001,4901234567890,サンプル商品A,ブランドA,カテゴリA,M,ブルー,5000,Active
SAMPLE-002,4901234567891,サンプル商品B,ブランドB,カテゴリB,L,レッド,8000,Active
SAMPLE-003,4901234567892,サンプル商品C,ブランドC,カテゴリC,S,グリーン,3000,Active`;

    return new Response(csvTemplate, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="product_master_template.csv"'
        }
    });
});

// --- API: Bulk Import for Mobile App (JSON Format) ---
app.post('/api/products/bulk-import', async (c) => {
    try {
        const { products } = await c.req.json();
        
        if (!products || !Array.isArray(products)) {
            return c.json({ success: false, error: 'Invalid request: products array required' }, 400);
        }

        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        console.log(`📦 CSV Import: company_id=${companyId}, products=${products.length}`);

        let inserted = 0;
        let updated = 0;
        const batch = [];

        const stmt = c.env.DB.prepare(`
            INSERT OR REPLACE INTO product_master (
                sku, barcode, name, brand, category, size, color, 
                price_sale, status, company_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
                (SELECT created_at FROM product_master WHERE sku = ? AND company_id = ?), 
                ?
            ))
        `);

        for (const product of products) {
            if (!product.sku) continue;

            // Check if product exists for this company
            const existing = await c.env.DB.prepare(
                'SELECT sku FROM product_master WHERE sku = ? AND company_id = ?'
            ).bind(product.sku, companyId).first();

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
                companyId,    // Add company_id
                product.sku,  // For COALESCE check
                companyId,    // For COALESCE check
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
        FROM product_master 
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
            FROM product_master 
            WHERE sku = ?
        `).bind(sku).first();

        if (!product) {
            return c.json({ 
                success: false, 
                error: 'Product not found' 
            }, 404);
        }

        // Images are fetched from R2 and mobile API only - no images table

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

        // All images come from mobile app only (no WEB app images table)
        const allImages = mobileAppImages.map((img, index) => ({
            id: `mobile_${index}`,
            sku: sku,
            item_code: img.filename.replace('.jpg', ''),
            image_urls: JSON.stringify([img.url]),
            source: 'mobile',
            condition: 'Unknown',
            photographed_at: img.uploaded
        }));

        return c.json({
            success: true,
            product: {
                ...product,
                hasCapturedData: allImages.length > 0,
                capturedItems: allImages,
                latestItem: allImages.length > 0 ? allImages[0] : null,
                capturedCount: allImages.length,
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
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        
        console.log('🔄 Syncing product data from mobile app API and R2 bucket...');
        
        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        console.log(`📦 Sync from mobile: company_id=${companyId}`);
        
        // Get all products from local database for this company
        const localProducts = await c.env.DB.prepare(`
            SELECT sku FROM product_master WHERE company_id = ?
        `).bind(companyId).all();
        
        const localSkus = new Set(localProducts.results.map((p: any) => p.sku));
        let syncedCount = 0;
        let insertedCount = 0;
        let skippedCount = 0;
        
        // Step 1: Fetch all products from mobile API
        console.log('📡 Fetching all products from mobile API...');
        const allProductsResponse = await fetch(`${MOBILE_API_URL}/api/products`);
        
        if (allProductsResponse.ok) {
            const allProductsData = await allProductsResponse.json();
            
            if (allProductsData.success && allProductsData.products) {
                for (const product of allProductsData.products) {
                    const sku = product.sku;
                    
                    try {
                        if (localSkus.has(sku)) {
                            // Update existing product for this company
                            await c.env.DB.prepare(`
                                UPDATE product_master SET
                                    name = ?,
                                    brand = ?,
                                    size = ?,
                                    color = ?,
                                    price_sale = ?,
                                    barcode = ?,
                                    category = ?
                                WHERE sku = ? AND company_id = ?
                            `).bind(
                                product.name || '',
                                product.brand || null,
                                product.size || null,
                                product.color || null,
                                product.price || 0,
                                product.barcode || null,
                                product.category || null,
                                sku,
                                companyId
                            ).run();
                            
                            syncedCount++;
                            console.log(`✅ Updated product: ${sku} for company_id: ${companyId}`);
                        } else {
                            // Insert new product for this company
                            await c.env.DB.prepare(`
                                INSERT INTO product_master (
                                    sku, name, brand, size, color, price_sale, barcode, category, status, company_id, created_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                            `).bind(
                                sku,
                                product.name || `商品 ${sku}`,
                                product.brand || null,
                                product.size || null,
                                product.color || null,
                                product.price || 0,
                                product.barcode || null,
                                product.category || null,
                                'Active',
                                companyId
                            ).run();
                            
                            insertedCount++;
                            console.log(`✨ Inserted new product: ${sku} for company_id: ${companyId}`);
                        }
                    } catch (e) {
                        console.error(`❌ Failed to sync product ${sku}:`, e);
                        skippedCount++;
                    }
                }
            }
        }
        
        // Step 2: R2 bucket auto-creation is DISABLED
        // Only CSV import and mobile API sync should create products
        console.log('ℹ️ R2 bucket auto-creation is disabled. Use CSV import to add products.');
        
        return c.json({
            success: true,
            synced: syncedCount,
            inserted: insertedCount,
            skipped: skippedCount,
            total: syncedCount + insertedCount,
            message: `Successfully synced ${syncedCount} products, inserted ${insertedCount} new products`
        });
        
    } catch (error: any) {
        console.error('Sync from mobile API error:', error);
        return c.json({ 
            success: false, 
            error: error.message || 'Sync failed' 
        }, 500);
    }
});

// --- API: Sync TO Mobile (WEB → Mobile API) ---
app.post('/api/sync-to-mobile', async (c) => {
    try {
        const MOBILE_API_URL = c.env.MOBILE_API_URL || 'https://measure-master-api.jinkedon2.workers.dev';
        
        console.log('🔄 Syncing product data TO mobile app API...');
        
        // Get company_id from cookie (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        console.log(`📦 Sync to mobile: company_id=${companyId}`);
        
        // Get all products from local database for this company
        const localProducts = await c.env.DB.prepare(`
            SELECT * FROM product_master WHERE company_id = ?
        `).bind(companyId).all();
        
        let syncedCount = 0;
        let errorCount = 0;
        
        // Send each product to mobile API
        for (const product of localProducts.results) {
            const p = product as any;
            
            try {
                const response = await fetch(`${MOBILE_API_URL}/api/products`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sku: p.sku,
                        name: p.name || `商品 ${p.sku}`,
                        brand: p.brand || null,
                        size: p.size || null,
                        color: p.color || null,
                        price: p.price_sale || 0,
                        barcode: p.barcode || null,
                        category: p.category || null,
                        description: p.description || null
                    })
                });
                
                if (response.ok) {
                    syncedCount++;
                    console.log(`✅ Synced to mobile API: ${p.sku}`);
                } else {
                    errorCount++;
                    console.error(`❌ Failed to sync ${p.sku}: ${response.status}`);
                }
            } catch (e) {
                errorCount++;
                console.error(`❌ Failed to sync ${p.sku}:`, e);
            }
        }
        
        return c.json({
            success: true,
            synced: syncedCount,
            errors: errorCount,
            total: localProducts.results.length,
            message: `Successfully synced ${syncedCount}/${localProducts.results.length} products to mobile API`
        });
        
    } catch (error: any) {
        console.error('Sync to mobile API error:', error);
        return c.json({ 
            success: false, 
            error: error.message || 'Sync failed' 
        }, 500);
    }
});

// ============================================================
// === EDIT SETTINGS API (Phase 2.5) ===
// ============================================================

// --- GET /api/edit-settings/:imageId - Load edit settings from R2 ---
app.get('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        console.log('📖 Loading edit settings for:', imageId);

        // Validate imageId format (e.g., r2_1025L280001_1025L280001_1)
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename from imageId
        // Format: r2_<SKU>_<filename_without_ext>
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_'); // Handle filenames with underscores
        
        // Build settings key: {company_id}/{sku}/{filename}_settings.json (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;
        console.log('🔍 Looking for settings:', settingsKey);

        // Try to fetch settings from R2
        const settingsObject = await c.env.PRODUCT_IMAGES.get(settingsKey);

        if (!settingsObject) {
            console.log('⚠️ No settings found for:', settingsKey);
            return c.json({ 
                exists: false,
                message: 'No edit settings found'
            });
        }

        // Parse JSON settings
        const settingsText = await settingsObject.text();
        const settings = JSON.parse(settingsText);

        console.log('✅ Edit settings loaded successfully');
        return c.json({
            exists: true,
            settings: settings
        });

    } catch (error: any) {
        console.error('❌ Error loading edit settings:', error);
        return c.json({ 
            error: 'Failed to load edit settings',
            details: error.message 
        }, 500);
    }
});

// --- POST /api/edit-settings/:imageId - Save edit settings to R2 ---
app.post('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        const body = await c.req.json();
        console.log('💾 Saving edit settings for:', imageId);

        // Validate imageId format
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;

        // Extract data from request body
        const { adjustments, eraser_paths } = body;

        // Check if settings are empty (no eraser paths and default adjustments)
        const hasEraserPaths = eraser_paths && eraser_paths.length > 0;
        const hasAdjustments = adjustments && (
            adjustments.brightness !== 0 ||
            adjustments.hue !== 0 ||
            adjustments.wb !== 5500
        );

        // If empty, delete existing settings file (if any)
        if (!hasEraserPaths && !hasAdjustments) {
            console.log('🗑️ No edits detected, deleting settings file:', settingsKey);
            try {
                await c.env.PRODUCT_IMAGES.delete(settingsKey);
                console.log('✅ Settings file deleted');
            } catch (deleteError) {
                console.log('⚠️ Settings file may not exist, skipping delete');
            }
            return c.json({
                success: true,
                message: 'Settings cleared (file deleted)',
                imageId: imageId
            });
        }

        // Build settings JSON structure
        const settings = {
            version: '1.0',
            image_id: imageId,
            sku: sku,
            filename: `${filenamePart}.jpg`,
            adjustments: adjustments || {
                brightness: 0,
                hue: 0,
                wb: 5500
            },
            eraser_paths: eraser_paths || [],
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                edit_count: (eraser_paths || []).length
            }
        };

        // Save to R2 as JSON
        await c.env.PRODUCT_IMAGES.put(
            settingsKey,
            JSON.stringify(settings, null, 2),
            {
                httpMetadata: {
                    contentType: 'application/json'
                }
            }
        );

        console.log('✅ Edit settings saved successfully:', settingsKey);
        return c.json({
            success: true,
            message: 'Edit settings saved',
            imageId: imageId,
            settingsKey: settingsKey
        });

    } catch (error: any) {
        console.error('❌ Error saving edit settings:', error);
        return c.json({ 
            error: 'Failed to save edit settings',
            details: error.message 
        }, 500);
    }
});

// --- DELETE /api/edit-settings/:imageId - Delete edit settings from R2 ---
app.delete('/api/edit-settings/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        console.log('🗑️ Deleting edit settings for:', imageId);

        // Validate imageId format
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }

        // Extract SKU and filename
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }

        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        const companyId = getCompanyId(c);
        const settingsKey = `${companyId}/${sku}/${filenamePart}_settings.json`;

        // Delete from R2
        await c.env.PRODUCT_IMAGES.delete(settingsKey);

        console.log('✅ Edit settings deleted:', settingsKey);
        return c.json({
            success: true,
            message: 'Edit settings deleted',
            imageId: imageId
        });

    } catch (error: any) {
        console.error('❌ Error deleting edit settings:', error);
        return c.json({ 
            error: 'Failed to delete edit settings',
            details: error.message 
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
        
        let requestBody: any;
        
        // Check if it's a base64 data URL
        if (imageUrl.startsWith('data:')) {
            console.log('📦 Detected base64 data URL, extracting base64 data...');
            
            // Extract base64 data from data URL
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }
            
            const base64Data = matches[2];
            console.log(`📊 Base64 data length: ${base64Data.length} characters`);
            
            // Use image_base64 parameter for base64 data
            requestBody = {
                image_base64: base64Data
            };
        } else {
            // Regular URL
            requestBody = {
                image_url: imageUrl
            };
        }
        
        // Call Hugging Face Space API (Flask/Docker API)
        const response = await fetch('https://jinkedon-withoutbg-api.hf.space/api/remove-bg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
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
        
        // Check image ID format and get original URL
        let originalUrl: string;
        let isR2Image = false;
        let isProductItemImage = false;
        let dbImageId: number | null = null;
        let productId: number | null = null;
        let itemId: number | null = null;
        let imageIndex: number | null = null;
        
        if (imageId.startsWith('r2_')) {
            // R2 image format: r2_{SKU}_{filename_without_ext}
            isR2Image = true;
            const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
            
            // Extract SKU and filename: r2_1025L280003_image1 -> 1025L280003/image1.jpg
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length >= 2) {
                const sku = parts[0];
                const filenamePart = parts.slice(1).join('_');
                const companyId = getCompanyId(c);
                
                // Try common image extensions
                const extensions = ['jpg', 'jpeg', 'png', 'webp'];
                let found = false;
                
                for (const ext of extensions) {
                    const testKey = `${companyId}/${sku}/${filenamePart}.${ext}`;
                    const testUrl = `${R2_PUBLIC_URL}/${testKey}`;
                    
                    // Test if file exists in R2
                    if (c.env.PRODUCT_IMAGES) {
                        const obj = await c.env.PRODUCT_IMAGES.head(testKey);
                        if (obj) {
                            originalUrl = testUrl;
                            found = true;
                            console.log(`✅ Found R2 image: ${testKey}`);
                            break;
                        }
                    }
                }
                
                if (!found) {
                    // Fallback: assume .jpg
                    originalUrl = `${R2_PUBLIC_URL}/${sku}/${filenamePart}.jpg`;
                    console.log(`⚠️ Assuming JPG format: ${originalUrl}`);
                }
            } else {
                return c.json({ error: 'Invalid R2 image ID format' }, 400);
            }
            
            console.log(`📸 Processing R2 image: ${imageId} -> ${originalUrl}`);
        } else {
            // Legacy format or unknown
            return c.json({ error: 'Unsupported image ID format. Use r2_{SKU}_{filename} format.' }, 400);
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
                    // Fetch the processed image
                    const imageResponse = await fetch(briaResult.imageUrl);
                    const imageBuffer = await imageResponse.arrayBuffer();
                    
                    // Upload to R2 bucket
                    // 新形式: {company_id}/{SKU}/{filename}_p.png（processedフォルダ廃止）
                    // 例: r2_1025L280001_1025L280001_1 → test_company/1025L280001/1025L280001_1_p.png
                    const parts = imageId.replace('r2_', '').split('_');
                    const sku = parts[0];
                    const filenamePart = parts.slice(1).join('_');
                    const companyId = getCompanyId(c);
                    const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                    
                    if (c.env.PRODUCT_IMAGES) {
                        await c.env.PRODUCT_IMAGES.put(r2Key, imageBuffer, {
                            httpMetadata: {
                                contentType: 'image/png'
                            }
                        });
                        console.log(`✅ Uploaded processed image to R2: ${r2Key}`);
                    }
                    
                    // Get R2 public URL
                    const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
                    const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
                    
                    // For R2 images, no DB update needed
                    console.log(`✅ Processed image saved to R2: ${r2Key}`);

                    return c.json({ 
                        success: true,
                        imageId,
                        processedUrl: processedUrl,
                        message: 'Background removed using Fal.ai BRIA RMBG 2.0 (Cloud)'
                    });
                } else {
                    console.error('❌ BRIA API failed, falling back to local rembg:', briaResult.error);
                }
            }
        }

        // ==========================================
        // Priority 2: withoutBG Focus (birefnet-general) - Free Hugging Face Spaces
        // Note: Hugging Face API only supports URL, not base64. For base64, skip to rembg server
        // ==========================================
        const isBase64Image = originalUrl.startsWith('data:');
        
        if ((model === 'birefnet-general' || model === 'cloudflare-ai') && !isBase64Image) {
            console.log('🚀 Using withoutBG Focus model for background removal (URL mode)');
            
            try {
                const result = await removeBackgroundWithWithoutBG(originalUrl);
                
                if (!result.success || !result.imageDataUrl) {
                    throw new Error(result.error || 'withoutBG processing failed');
                }

                // Convert data URL to binary buffer for R2 upload
                const base64Data = result.imageDataUrl.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Upload to R2 bucket
                // 新形式: {company_id}/{SKU}/{filename}_p.png（processedフォルダ廃止）
                // 例: r2_1025L280001_1025L280001_1 → test_company/1025L280001/1025L280001_1_p.png
                const parts = imageId.replace('r2_', '').split('_');
                const sku = parts[0];
                const filenamePart = parts.slice(1).join('_');
                const companyId = getCompanyId(c);
                const r2Key = `${companyId}/${sku}/${filenamePart}_p.png`;
                
                if (c.env.PRODUCT_IMAGES) {
                    await c.env.PRODUCT_IMAGES.put(r2Key, bytes, {
                        httpMetadata: {
                            contentType: 'image/png'
                        }
                    });
                    console.log(`✅ Uploaded processed image to R2: ${r2Key}`);
                }
                
                // Get R2 public URL
                const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
                const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;
                
                // For R2 images, no DB update needed
                console.log(`✅ Processed image saved to R2: ${r2Key}`);

                return c.json({ 
                    success: true,
                    imageId,
                    processedUrl: processedUrl,
                    message: 'Background removed using withoutBG Focus (Free)'
                });
            } catch (apiError: any) {
                console.error('❌ withoutBG API failed:', apiError.message);
                // Don't fail immediately for URL images - try fallback to local rembg
                console.log('⚠️ Falling back to local rembg server...');
            }
        }
        
        // Log if skipping withoutBG due to base64
        if (isBase64Image) {
            console.log('📦 Base64 image detected - using local rembg server (withoutBG API does not support base64)');
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
            // Log failure (no DB to update for R2 images)
            console.log(`❌ Background removal failed for ${imageId}`);
            const errorText = await response.text();
            throw new Error(`Background removal failed: ${response.statusText} - ${errorText}`);
        }

        // Get the processed image as binary data
        const imageBuffer = await response.arrayBuffer();
        
        // Upload to R2 bucket
        // 新形式: {SKU}/{filename}_p.png（processedフォルダ廃止）
        // 例: r2_1025L280001_1025L280001_1 → 1025L280001/1025L280001_1_p.png
        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const r2Key = `${sku}/${filenamePart}_p.png`;
        
        if (c.env.PRODUCT_IMAGES) {
            await c.env.PRODUCT_IMAGES.put(r2Key, imageBuffer, {
                httpMetadata: {
                    contentType: 'image/png'
                }
            });
            console.log(`✅ Uploaded processed image to R2: ${r2Key}`);
        }
        
        // Get R2 public URL
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        const processedUrl = `${R2_PUBLIC_URL}/${r2Key}`;

        // For R2 images, no DB update needed - processed image is stored in R2 with predictable naming
        console.log(`✅ Processed image saved to R2: ${r2Key}`);

        return c.json({ 
            success: true,
            imageId,
            dbImageId: dbImageId,
            processedUrl: processedUrl,
            message: 'Background removed and saved to R2'
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
                    SELECT id FROM product_master WHERE sku = ?
                `).bind(sku).first();
                
                if (!product) {
                    // Create product if not exists
                    await c.env.DB.prepare(`
                        INSERT OR IGNORE INTO product_master (sku, name, category)
                        VALUES (?, ?, ?)
                    `).bind(sku, `商品 ${sku}`, 'Imported').run();
                }
                
                // Check if image already exists
                // images table removed
                
                if (existingImage) {
                    skippedCount++;
                    continue;
                }
                
                // Insert image
                // images table removed
                
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
            SELECT id FROM product_master WHERE sku = ?
        `).bind(sku).first();
        
        if (!product) {
            await c.env.DB.prepare(`
                INSERT INTO product_master (sku, name, category)
                VALUES (?, ?, ?)
            `).bind(sku, `商品 ${sku}`, 'Imported').run();
        }
        
        // Image registration removed - images are now managed via R2 bucket only
        return c.json({ 
            success: true,
            message: 'Product exists, but image registration is handled via R2 bucket',
            sku: sku
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
        // images table removed
        
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
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        
        // R2画像ID形式: r2_{SKU}_{filename_without_ext}
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }
        
        // Extract SKU from image ID
        const parts = imageId.replace('r2_', '').split('_');
        const sku = parts[0];
        const filenamePart = parts.slice(1).join('_');
        const companyId = getCompanyId(c);
        
        // 新形式で白抜き画像をチェック: {company_id}/{SKU}/{filename}_p.png (Phase 1: Dynamic company_id)
        const processedKey = `${companyId}/${sku}/${filenamePart}_p.png`;
        let processedUrl = null;
        
        if (c.env.PRODUCT_IMAGES) {
            try {
                const r2Object = await c.env.PRODUCT_IMAGES.head(processedKey);
                if (r2Object) {
                    processedUrl = `${R2_PUBLIC_URL}/${processedKey}`;
                    console.log(`✅ Found processed image: ${processedKey}`);
                }
            } catch (e) {
                console.error(`❌ Failed to check processed image:`, e);
            }
        }
        
        // Check if processed image exists
        if (!processedUrl) {
            return c.json({ 
                error: 'No processed image available',
                message: '白抜き処理が完了していません'
            }, 404);
        }
        
        // Generate unique filename using full imageId
        // Extract filename part from imageId (e.g., r2_1025L280001_2 -> 1025L280001_2)
        const imageIdPart = imageId.replace('r2_', '');
        const filename = `${imageIdPart}_processed.png`;
        
        console.log(`📝 Generated filename: ${filename} for imageId: ${imageId}`);
        
        // Fetch image data from R2 and convert to base64 to avoid CORS issues
        try {
            const r2Object = await c.env.PRODUCT_IMAGES.get(processedKey);
            if (!r2Object) {
                return c.json({ 
                    error: 'Failed to retrieve image from R2',
                    message: 'R2オブジェクトの取得に失敗しました'
                }, 500);
            }
            
            // Convert R2 object to ArrayBuffer then to base64
            const arrayBuffer = await r2Object.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64String = buffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64String}`;
            
            console.log(`✅ Converted image to base64 (${base64String.length} chars)`);
            
            return c.json({
                imageUrl: dataUrl,
                filename: filename,
                sku: sku,
                status: 'completed'
            });
        } catch (e) {
            console.error(`❌ Failed to fetch R2 object:`, e);
            return c.json({ 
                error: 'Failed to fetch image data',
                message: '画像データの取得に失敗しました'
            }, 500);
        }
        
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
        
        console.log('💾 Saving edited image:', imageId);
        
        // Extract SKU and filename from imageId
        // Format: r2_1025L280001_1025L280001_1 → SKU = 1025L280001, filename = 1025L280001_1
        if (!imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid imageId format' }, 400);
        }
        
        const parts = imageId.split('_');
        if (parts.length < 3) {
            return c.json({ error: 'Cannot extract SKU from imageId' }, 400);
        }
        
        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_');
        
        // Phase A: Build R2 key for FINAL image: {company_id}/{sku}/{filename}_f.png
        // _f.png = Final/Completed image (with edits applied)
        // _p.png = Processed/White-background only (preserved)
        // Get company_id from cookie (Phase 1 with dynamic company_id)
        const cookies = c.req.header('Cookie') || '';
        const companyIdMatch = cookies.match(/company_id=([^;]+)/);
        const companyId = companyIdMatch ? companyIdMatch[1] : FIXED_COMPANY_ID;
        const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
        
        console.log('📂 Final image key:', finalKey);
        
        // Convert base64 to binary
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const binaryString = atob(base64Data);
        const imageBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            imageBuffer[i] = binaryString.charCodeAt(i);
        }
        
        console.log('📊 Image size:', imageBuffer.length, 'bytes');
        
        // Upload to R2 (overwrites existing _f.png)
        await c.env.PRODUCT_IMAGES.put(finalKey, imageBuffer, {
            httpMetadata: {
                contentType: 'image/png'
            }
        });
        
        console.log('✅ Saved final image to R2:', finalKey);
        
        // Update D1 updated_at timestamp for cache busting
        await c.env.DB.prepare(`
            UPDATE product_items 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE sku = ?
        `).bind(sku).run();
        
        console.log('✅ Updated D1 timestamp for SKU:', sku);
        
        return c.json({ 
            success: true,
            imageId,
            finalKey,
            message: 'Final image saved successfully'
        });
        
    } catch (error: any) {
        console.error('❌ Save image error:', error);
        return c.json({ 
            error: 'Failed to save image', 
            details: error.message 
        }, 500);
    }
});

// ========================================
// 商品データDL機能
// ========================================

// 新しいCSV出力API: product_itemsテーブルから直接データ取得
app.post('/api/export-product-items', async (c) => {
    try {
        const body = await c.req.json();
        const imageIds = body.imageIds as string[];
        
        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return c.text('No image IDs provided', 400);
        }
        
        console.log('📊 CSV Export - imageIds:', imageIds);
        
        // imageIdsからSKUを抽出
        // 例: r2_1025L280001_1025L280001_4 → SKU = 1025L280001
        const skus = [...new Set(imageIds.map(id => {
            const parts = id.split('_');
            return parts[1]; // 2番目の部分がSKU
        }).filter(Boolean))];
        
        console.log('📦 Extracted SKUs:', skus);
        
        if (skus.length === 0) {
            return c.text('No valid SKUs found', 400);
        }
        
        // product_itemsテーブルから該当データを取得
        const placeholders = skus.map(() => '?').join(',');
        const query = `
            SELECT 
                sku,
                item_code,
                name,
                barcode,
                color,
                category,
                price,
                size,
                brand,
                actual_measurements,
                condition,
                material,
                product_rank,
                inspection_notes,
                status
            FROM product_items
            WHERE sku IN (${placeholders})
            ORDER BY sku, item_code
        `;
        
        const result = await c.env.DB.prepare(query).bind(...skus).all();
        
        console.log('✅ Query result:', result.results?.length, 'items');
        
        if (!result.results || result.results.length === 0) {
            return c.text('No data found', 404);
        }
        
        // CSVヘッダー（日本語）
        const headers = [
            'SKU',
            'アイテムコード',
            '商品名',
            'バーコード',
            'カラー',
            'カテゴリ',
            '価格',
            'サイズ',
            'ブランド',
            '実寸',
            'コンディション',
            '素材',
            'ランク',
            '検品メモ',
            'ステータス'
        ];
        
        // CSV行を生成
        const csvLines = [headers.join(',')];
        
        // Helper function to escape CSV values
        const escapeCSV = (value: any): string => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            // Contains comma, newline, or quote -> wrap in quotes and escape quotes
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        
        for (const row of result.results as any[]) {
            const line = [
                escapeCSV(row.sku),
                escapeCSV(row.item_code),
                escapeCSV(row.name),
                escapeCSV(row.barcode),
                escapeCSV(row.color),
                escapeCSV(row.category),
                escapeCSV(row.price),
                escapeCSV(row.size),
                escapeCSV(row.brand),
                escapeCSV(row.actual_measurements),
                escapeCSV(row.condition),
                escapeCSV(row.material),
                escapeCSV(row.product_rank),
                escapeCSV(row.inspection_notes),
                escapeCSV(row.status)
            ];
            csvLines.push(line.join(','));
        }
        
        // UTF-8 BOM + CSV content
        const BOM = '\uFEFF';
        const csvContent = BOM + csvLines.join('\n');
        
        console.log('✅ CSV generated:', csvLines.length, 'lines');
        
        return new Response(csvContent, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="product_items.csv"'
            }
        });
        
    } catch (error: any) {
        console.error('❌ CSV export error:', error);
        return c.text('CSV export failed: ' + error.message, 500);
    }
});

// 画像ダウンロードAPI: R2から直接取得（DBに依存しない）
app.get('/api/download-product-data/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        
        console.log('🖼️ Download product data - imageId:', imageId);
        
        if (!imageId || !imageId.startsWith('r2_')) {
            return c.json({ error: 'Invalid image ID format' }, 400);
        }
        
        // imageIdからSKUとファイル名部分を抽出
        // 例: r2_1025L280001_1025L280001_5 → SKU=1025L280001, filenamePart=1025L280001_5
        const parts = imageId.split('_');
        const sku = parts[1];
        const filenamePart = parts.slice(2).join('_'); // "1025L280001_5"
        
        if (!sku || !filenamePart) {
            return c.json({ error: 'Cannot extract SKU or filename from image ID' }, 400);
        }
        
        console.log('📦 Extracted SKU:', sku, 'Filename part:', filenamePart);
        
        // R2から直接取得（DBは使わない）
        // Phase A優先順位: _f.png（編集済み最新） > _p.png（白抜きのみ） > .jpg（元画像）
        let r2Object = null;
        let status = 'original';
        let key = '';
        const companyId = getCompanyId(c);
        
        // 1. 最優先: 編集済み画像をチェック（{company_id}/{sku}/{filename}_f.png）⭐ (Phase 1: Dynamic company_id)
        const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
        console.log('🔍 Step 1: Checking final edited image:', finalKey);
        
        try {
            r2Object = await c.env.PRODUCT_IMAGES.get(finalKey);
            if (r2Object) {
                key = finalKey;
                status = 'final';
                console.log('✅ Found FINAL edited image:', finalKey);
            }
        } catch (error) {
            console.log('⚠️ No final edited image found');
        }
        
        // 2. フォールバック: 白抜き画像をチェック（{company_id}/{sku}/{filename}_p.png） (Phase 1: Dynamic company_id)
        if (!r2Object) {
            const processedKey = `${companyId}/${sku}/${filenamePart}_p.png`;
            console.log('🔍 Step 2: Checking processed image:', processedKey);
            
            try {
                r2Object = await c.env.PRODUCT_IMAGES.get(processedKey);
                if (r2Object) {
                    key = processedKey;
                    status = 'processed';
                    console.log('✅ Found processed image:', processedKey);
                }
            } catch (error) {
                console.log('⚠️ No processed image found');
            }
        }
        
        // 3. 最終フォールバック: オリジナル画像をチェック（WEB側のR2）
        if (!r2Object) {
            // 複数の拡張子を試行（jpg, jpeg, png, webp）
            const extensions = ['jpg', 'jpeg', 'png', 'webp'];
            
            for (const ext of extensions) {
                const originalKey = `${companyId}/${sku}/${filenamePart}.${ext}`;
                console.log('🔍 Step 3: Checking original image in WEB R2:', originalKey);
                
                try {
                    r2Object = await c.env.PRODUCT_IMAGES.get(originalKey);
                    if (r2Object) {
                        key = originalKey;
                        status = 'original';
                        console.log('✅ Found original image in WEB R2:', originalKey);
                        break;
                    }
                } catch (error) {
                    // 次の拡張子を試す
                }
            }
        }
        
        // 4. 最終的なフォールバック: image-upload-api経由で元画像を取得
        if (!r2Object) {
            console.log('🔍 Step 4: Trying to fetch from image-upload-api');
            const IMAGE_UPLOAD_API_URL = 'https://image-upload-api.jinkedon2.workers.dev';
            const extensions = ['jpg', 'jpeg', 'png', 'webp'];
            
            let imageUrl = null;
            let foundExt = 'jpg';
            
            for (const ext of extensions) {
                const testUrl = `${IMAGE_UPLOAD_API_URL}/${companyId}/${sku}/${filenamePart}.${ext}`;
                console.log('🔍 Testing:', testUrl);
                
                try {
                    const response = await fetch(testUrl, { method: 'HEAD' });
                    if (response.ok) {
                        imageUrl = testUrl;
                        foundExt = ext;
                        status = 'original';
                        console.log('✅ Found original image in image-upload-api:', testUrl);
                        break;
                    }
                } catch (error) {
                    // 次の拡張子を試す
                }
            }
            
            if (imageUrl) {
                // image-upload-api経由で画像を取得してプロキシする
                const filename = `${filenamePart}_${status}.${foundExt}`;
                console.log('📝 Generated filename:', filename);
                console.log('🔗 Fetching from image-upload-api:', imageUrl);
                console.log('📊 Status:', status);
                
                try {
                    // image-upload-apiから画像をフェッチ
                    const response = await fetch(imageUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch from image-upload-api: ${response.status}`);
                    }
                    
                    const imageBuffer = await response.arrayBuffer();
                    console.log('✅ Successfully fetched image from image-upload-api, size:', imageBuffer.byteLength);
                    
                    // 画像データをBase64エンコードして返す
                    const base64Image = btoa(
                        new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    const dataUrl = `data:image/${foundExt === 'jpg' || foundExt === 'jpeg' ? 'jpeg' : foundExt};base64,${base64Image}`;
                    
                    return c.json({
                        imageUrl: dataUrl,
                        filename: filename,
                        sku: sku,
                        status: status
                    });
                } catch (error) {
                    console.error('❌ Error fetching from image-upload-api:', error);
                    // Continue to check if there's an R2 object
                }
            }
        }
        
        // 5. どれも見つからない場合は404
        if (!r2Object) {
            console.log('❌ No image found for:', filenamePart);
            return c.json({ 
                error: 'No image available',
                message: '画像が見つかりません（WEB R2 と image-upload-api の両方で見つかりませんでした）'
            }, 404);
        }
        
        // 6. WEB側のR2から取得した画像のプロキシURLを返す
        const extension = key.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `${filenamePart}_${status}.${extension}`;
        
        // プロキシURL経由で画像を配信（バイナリ直接）
        const keyFilename = key.split('/').pop();
        const imageUrl = `/api/image-proxy/${sku}/${keyFilename}`;
        
        console.log('📝 Generated filename:', filename);
        console.log('🔗 Proxy URL (WEB R2):', imageUrl);
        console.log('📊 Status:', status);
        
        return c.json({
            imageUrl: imageUrl,
            filename: filename,
            sku: sku,
            status: status
        });
        
    } catch (error: any) {
        console.error('❌ Download product data error:', error);
        return c.json({ 
            error: 'Failed to get product data',
            details: error.message
        }, 500);
    }
});

// --- API: 画像プロキシ（R2からバイナリを直接返す） ---
app.get('/api/image-proxy/:sku/:filename', async (c) => {
    try {
        const { sku, filename } = c.req.param();
        
        console.log('🖼️ Image proxy request - SKU:', sku, 'Filename:', filename);
        
        // 1. SKUのバリデーション（英数字とアンダースコアのみ）
        if (!/^[A-Za-z0-9_]+$/.test(sku)) {
            console.log('❌ Invalid SKU format:', sku);
            return c.json({ error: 'Invalid SKU format' }, 400);
        }
        
        // 2. ファイル名のバリデーション
        // - パストラバーサル防止（../ や ..\）
        // - スラッシュやバックスラッシュを含まない
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            console.log('❌ Invalid filename (path traversal):', filename);
            return c.json({ error: 'Invalid filename' }, 400);
        }
        
        // 3. 拡張子のホワイトリスト
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const hasValidExtension = allowedExtensions.some(ext => 
            filename.toLowerCase().endsWith(ext)
        );
        
        if (!hasValidExtension) {
            console.log('❌ Unsupported file type:', filename);
            return c.json({ error: 'Unsupported file type' }, 400);
        }
        
        // 4. ファイル名の長さチェック（DoS攻撃防止）
        if (filename.length > 255) {
            console.log('❌ Filename too long:', filename.length);
            return c.json({ error: 'Filename too long' }, 400);
        }
        
        // R2から画像を取得 (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        const key = `${companyId}/${sku}/${filename}`;
        console.log('🔍 Fetching from R2:', key);
        
        const r2Object = await c.env.PRODUCT_IMAGES.get(key);
        
        if (!r2Object) {
            console.log('❌ Image not found:', key);
            return c.notFound();
        }
        
        // Content-Typeを拡張子から判定
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const contentTypeMap: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';
        
        console.log('✅ Image found - Size:', r2Object.size, 'Type:', contentType);
        
        // バイナリを直接返す（Base64変換なし）
        return new Response(r2Object.body, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': r2Object.size?.toString() || '',
                'Cache-Control': 'public, max-age=0, must-revalidate',
                'ETag': r2Object.httpEtag || '',
                'Last-Modified': r2Object.uploaded?.toUTCString() || ''
            }
        });
        
    } catch (error: any) {
        console.error('❌ Image proxy error:', error);
        return c.json({ 
            error: 'Failed to fetch image',
            details: error.message
        }, 500);
    }
});

// --- API: R2バケット確認用（デバッグ） ---
app.get('/api/debug/r2-list', async (c) => {
    try {
        const prefix = c.req.query('prefix') || '';
        
        if (!c.env.PRODUCT_IMAGES) {
            return c.json({ error: 'R2 bucket not configured' }, 500);
        }
        
        // R2バケットの内容をリスト
        const listed = await c.env.PRODUCT_IMAGES.list({
            prefix: prefix,
            limit: 100
        });
        
        const results = {
            prefix: prefix,
            count: listed.objects.length,
            truncated: listed.truncated,
            objects: listed.objects.map(obj => ({
                key: obj.key,
                size: obj.size,
                uploaded: obj.uploaded?.toISOString(),
                httpEtag: obj.httpEtag
            }))
        };
        
        return c.json(results, 200, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        
    } catch (error: any) {
        console.error('R2 list error:', error);
        return c.json({ 
            error: 'Failed to list R2 objects',
            details: error.message
        }, 500);
    }
});

// --- Debug: R2フォルダビューア ---
app.get('/debug/r2-folder', async (c) => {
    try {
        const sku = c.req.query('sku') || '';
        const R2_PUBLIC_URL = 'https://pub-300562464768499b8fcaee903d0f9861.r2.dev';
        
        if (!c.env.PRODUCT_IMAGES) {
            return c.html(`
                <html>
                <head>
                    <title>R2 Error</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 p-8">
                    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
                        <h1 class="text-2xl font-bold text-red-600 mb-4">❌ R2バケットが設定されていません</h1>
                    </div>
                </body>
                </html>
            `);
        }
        
        // SKUが指定されていない場合、SKUフォルダ一覧を表示 (Phase 1: Dynamic company_id配下のみ)
        if (!sku) {
            const companyId = getCompanyId(c);
            const listed = await c.env.PRODUCT_IMAGES.list({ 
                prefix: `${companyId}/`,
                delimiter: '/',
                limit: 100
            });
            
            const folders = listed.delimitedPrefixes?.map(prefix => 
                prefix.replace(`${companyId}/`, '').replace('/', '')
            ) || [];
            
            return c.html(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>R2 Folder Browser</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 p-8">
                    <div class="max-w-4xl mx-auto">
                        <div class="bg-white rounded-lg shadow p-6">
                            <h1 class="text-3xl font-bold text-gray-800 mb-6">
                                <i class="fas fa-folder text-yellow-500 mr-2"></i>
                                R2 Folder Browser
                            </h1>
                            <p class="text-gray-600 mb-6">SKUフォルダ一覧（${folders.length}個）</p>
                            
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                                ${folders.map(folder => `
                                    <a href="/debug/r2-folder?sku=${folder}" 
                                       class="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 flex items-center transition-colors">
                                        <i class="fas fa-folder text-blue-500 text-2xl mr-3"></i>
                                        <span class="font-mono text-sm">${folder}</span>
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet"/>
                </body>
                </html>
            `);
        }
        
        // 特定のSKUフォルダの内容を表示 (Phase 1: Dynamic company_id)
        const companyId = getCompanyId(c);
        const prefix = `${companyId}/${sku}/`;
        const listed = await c.env.PRODUCT_IMAGES.list({
            prefix: prefix,
            limit: 100
        });
        
        const files = listed.objects.map(obj => {
            const filename = obj.key.split('/')[2]; // Phase 1: company_id/sku/filename
            const isProcessed = filename.endsWith('_p.png');
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(filename);
            
            return {
                key: obj.key,
                filename: filename,
                url: `${R2_PUBLIC_URL}/${obj.key}`,
                size: obj.size,
                uploaded: obj.uploaded?.toISOString(),
                isProcessed: isProcessed,
                isImage: isImage,
                sizeKB: Math.round(obj.size / 1024)
            };
        });
        
        const originalImages = files.filter(f => f.isImage && !f.isProcessed);
        const processedImages = files.filter(f => f.isProcessed);
        
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>R2 Folder: ${sku}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    .image-card { position: relative; overflow: hidden; }
                    .image-card img { transition: transform 0.3s; }
                    .image-card:hover img { transform: scale(1.05); }
                </style>
            </head>
            <body class="bg-gray-100 p-8">
                <div class="max-w-6xl mx-auto">
                    <!-- Header -->
                    <div class="mb-6">
                        <a href="/debug/r2-folder" class="text-blue-600 hover:underline mb-2 inline-block">
                            <i class="fas fa-arrow-left mr-2"></i>フォルダ一覧に戻る
                        </a>
                        <div class="bg-white rounded-lg shadow p-6">
                            <h1 class="text-3xl font-bold text-gray-800 mb-2">
                                <i class="fas fa-folder-open text-yellow-500 mr-2"></i>
                                ${sku}
                            </h1>
                            <p class="text-gray-600">
                                全${files.length}ファイル（元画像: ${originalImages.length}枚、白抜き画像: ${processedImages.length}枚）
                            </p>
                        </div>
                    </div>
                    
                    <!-- 元画像 -->
                    <div class="bg-white rounded-lg shadow p-6 mb-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-image text-blue-500 mr-2"></i>
                            元画像（${originalImages.length}枚）
                        </h2>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            ${originalImages.map(file => `
                                <div class="image-card bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                                    <a href="${file.url}" target="_blank">
                                        <img src="${file.url}" 
                                             alt="${file.filename}"
                                             class="w-full h-48 object-cover"
                                             loading="lazy">
                                    </a>
                                    <div class="p-3">
                                        <p class="font-mono text-xs text-gray-600 truncate mb-1" title="${file.filename}">
                                            ${file.filename}
                                        </p>
                                        <p class="text-xs text-gray-500">${file.sizeKB} KB</p>
                                        <p class="text-xs text-gray-400">${new Date(file.uploaded).toLocaleString('ja-JP')}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${originalImages.length === 0 ? '<p class="text-gray-500 text-center py-8">元画像がありません</p>' : ''}
                    </div>
                    
                    <!-- 白抜き画像 -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-magic text-green-500 mr-2"></i>
                            白抜き画像（${processedImages.length}枚）
                        </h2>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            ${processedImages.map(file => `
                                <div class="image-card bg-gray-50 rounded-lg overflow-hidden border border-green-200">
                                    <a href="${file.url}" target="_blank">
                                        <img src="${file.url}" 
                                             alt="${file.filename}"
                                             class="w-full h-48 object-contain bg-white"
                                             loading="lazy">
                                    </a>
                                    <div class="p-3">
                                        <p class="font-mono text-xs text-gray-600 truncate mb-1" title="${file.filename}">
                                            ${file.filename}
                                        </p>
                                        <p class="text-xs text-gray-500">${file.sizeKB} KB</p>
                                        <p class="text-xs text-gray-400">${new Date(file.uploaded).toLocaleString('ja-JP')}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${processedImages.length === 0 ? '<p class="text-gray-500 text-center py-8">白抜き画像がありません</p>' : ''}
                    </div>
                    
                    <!-- 削除ボタン（将来用） -->
                    <div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p class="text-sm text-yellow-800">
                            <i class="fas fa-info-circle mr-2"></i>
                            画像を削除したい場合は、Cloudflare Dashboardから直接削除できます
                        </p>
                    </div>
                </div>
                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet"/>
            </body>
            </html>
        `);
        
    } catch (error: any) {
        console.error('R2 folder browser error:', error);
        return c.html(`
            <html>
            <head>
                <title>Error</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-gray-100 p-8">
                <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
                    <h1 class="text-2xl font-bold text-red-600 mb-4">❌ エラーが発生しました</h1>
                    <pre class="bg-gray-100 p-4 rounded text-sm">${error.message}</pre>
                </div>
            </body>
            </html>
        `);
    }
});

// 画像順序変更API
app.post('/api/reorder-images', async (c) => {
    try {
        const { sku, imageIds } = await c.req.json();
        
        console.log('🔄 Reorder images for SKU:', sku);
        console.log('📋 New order:', imageIds);
        
        if (!sku || !imageIds || !Array.isArray(imageIds)) {
            return c.json({ error: 'Invalid request: sku and imageIds array required' }, 400);
        }
        
        // 1. 現在の image_urls を取得
        const result = await c.env.DB.prepare(`
            SELECT image_urls FROM product_items WHERE sku = ?
        `).bind(sku).first();
        
        if (!result) {
            return c.json({ error: 'SKU not found' }, 404);
        }
        
        const currentImageUrls = JSON.parse(result.image_urls || '[]');
        console.log('📦 Current image_urls:', currentImageUrls);
        
        if (currentImageUrls.length === 0) {
            return c.json({ error: 'No images found for this SKU' }, 404);
        }
        
        // 2. imageIds の順序に従って image_urls を並び替え
        const newImageUrls: string[] = [];
        
        for (const imageId of imageIds) {
            // imageId = "r2_1025L280001_1025L280001_uuid" から UUID部分を抽出
            const parts = imageId.replace('r2_', '').split('_');
            if (parts.length < 2) continue;
            
            // SKU以降の部分を結合（例: "1025L280001_uuid"）
            const filenamePart = parts.slice(1).join('_');
            
            // currentImageUrls から該当するURLを探す
            const matchingUrl = currentImageUrls.find(url => {
                const urlFilename = url.split('/').pop() || '';
                const urlFilenamePart = urlFilename.replace(/\.[^/.]+$/, ''); // 拡張子を除去
                return urlFilenamePart === filenamePart;
            });
            
            if (matchingUrl) {
                newImageUrls.push(matchingUrl);
            } else {
                console.warn(`⚠️ No matching URL found for imageId: ${imageId}`);
            }
        }
        
        console.log('✅ New image_urls:', newImageUrls);
        
        // 3. 順序が変わっていない場合はスキップ
        if (JSON.stringify(currentImageUrls) === JSON.stringify(newImageUrls)) {
            return c.json({ success: true, message: 'Order unchanged', imageUrls: newImageUrls });
        }
        
        // 4. D1 を更新
        await c.env.DB.prepare(`
            UPDATE product_items 
            SET image_urls = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE sku = ?
        `).bind(JSON.stringify(newImageUrls), sku).run();
        
        console.log('✅ Image order updated successfully for SKU:', sku);
        
        return c.json({ 
            success: true, 
            imageUrls: newImageUrls,
            message: '画像の順序を更新しました'
        });
        
    } catch (error: any) {
        console.error('❌ Reorder images error:', error);
        return c.json({ error: 'Failed to reorder images', details: error.message }, 500);
    }
});

// ==========================================
// 🗑️ Admin: R2画像削除エンドポイント（Phase 1用）
// ==========================================

/**
 * R2画像削除エンドポイント（管理者用）
 * 
 * GET /api/admin/delete-all-r2-images?confirm=yes
 * 
 * クエリパラメータ:
 * - confirm: "yes" を指定すると実際に削除を実行
 * - dryRun: "true" を指定すると削除せずに一覧のみ表示
 */
app.get('/api/admin/delete-all-r2-images', async (c) => {
  const confirm = c.req.query('confirm');
  const dryRun = c.req.query('dryRun') === 'true';
  
  if (!c.env.PRODUCT_IMAGES) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }
  
  try {
    console.log('🗂️ Starting R2 image deletion process...');
    
    const bucket = c.env.PRODUCT_IMAGES;
    const deletedFiles: string[] = [];
    const errors: { key: string; error: string }[] = [];
    
    // R2のすべてのオブジェクトを取得
    let cursor: string | undefined;
    let totalFiles = 0;
    
    do {
      const listed = await bucket.list({
        limit: 1000,
        cursor: cursor
      });
      
      console.log(`📦 Found ${listed.objects.length} objects in this batch`);
      
      for (const obj of listed.objects) {
        totalFiles++;
        
        if (dryRun) {
          // Dry runモード: 削除せずに一覧のみ
          deletedFiles.push(obj.key);
          console.log(`🔍 Would delete: ${obj.key}`);
        } else if (confirm === 'yes') {
          // 実際に削除
          try {
            await bucket.delete(obj.key);
            deletedFiles.push(obj.key);
            console.log(`✅ Deleted: ${obj.key}`);
          } catch (err: any) {
            errors.push({ key: obj.key, error: err.message });
            console.error(`❌ Failed to delete ${obj.key}:`, err.message);
          }
        } else {
          // confirmパラメータがない場合は一覧のみ
          deletedFiles.push(obj.key);
        }
      }
      
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    
    const summary = {
      totalFiles,
      deletedCount: confirm === 'yes' && !dryRun ? deletedFiles.length : 0,
      errorCount: errors.length,
      mode: dryRun ? 'DRY_RUN' : (confirm === 'yes' ? 'EXECUTED' : 'PREVIEW'),
      files: deletedFiles,
      errors
    };
    
    if (dryRun) {
      return c.json({
        success: true,
        message: `Dry run completed. ${totalFiles} files would be deleted.`,
        ...summary
      });
    }
    
    if (confirm !== 'yes') {
      return c.json({
        success: false,
        message: 'Preview mode. Add ?confirm=yes to execute deletion.',
        warning: '⚠️ THIS WILL DELETE ALL IMAGES IN R2 BUCKET!',
        ...summary
      });
    }
    
    return c.json({
      success: true,
      message: `Successfully deleted ${deletedFiles.length} files from R2`,
      ...summary
    });
    
  } catch (error: any) {
    console.error('❌ Error during R2 deletion:', error);
    return c.json({
      success: false,
      error: 'Failed to delete R2 images',
      details: error.message
    }, 500);
  }
});

/**
 * R2画像統計情報取得エンドポイント
 * 
 * GET /api/admin/r2-stats
 */
app.get('/api/admin/r2-stats', async (c) => {
  if (!c.env.PRODUCT_IMAGES) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }
  
  try {
    const bucket = c.env.PRODUCT_IMAGES;
    let cursor: string | undefined;
    let totalFiles = 0;
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};
    const skuFolders = new Set<string>();
    
    do {
      const listed = await bucket.list({
        limit: 1000,
        cursor: cursor
      });
      
      for (const obj of listed.objects) {
        totalFiles++;
        totalSize += obj.size;
        
        // ファイルタイプを集計
        const ext = obj.key.split('.').pop() || 'unknown';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        
        // SKUフォルダを集計
        const sku = obj.key.split('/')[0];
        if (sku) {
          skuFolders.add(sku);
        }
      }
      
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    
    return c.json({
      success: true,
      stats: {
        totalFiles,
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileTypes,
        skuFolders: Array.from(skuFolders),
        skuCount: skuFolders.size
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error getting R2 stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get R2 stats',
      details: error.message
    }, 500);
  }
});

export default app

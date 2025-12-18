import { Hono } from 'hono'
import { renderer } from './renderer'
import { Layout } from './components'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

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

app.post('/login', (c) => {
  return c.redirect('/dashboard')
})

// --- Dashboard / Product List (Screenshot 2) ---
app.get('/dashboard', async (c) => {
  // Fetch products and images from D1
  const products = await c.env.DB.prepare(`
    SELECT p.*, i.original_url, i.processed_url, i.status as image_status, i.id as image_id 
    FROM products p 
    LEFT JOIN images i ON p.id = i.product_id
  `).all();

  return c.render(
    <Layout active="dashboard" title="商品画像一覧（SKU別）">
      <div class="mb-6 flex justify-between items-end">
        <p class="text-gray-500 text-sm">撮影済み画像の管理・編集・ダウンロードが可能です。</p>
        <div class="flex space-x-3">
            <button class="bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-lg flex items-center hover:bg-blue-50 transition-colors text-sm font-medium">
                <i class="fas fa-magic mr-2"></i>
                選択画像を白抜き
            </button>
            <button class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
                <i class="fas fa-download mr-2"></i>
                CSV出力
            </button>
        </div>
      </div>

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
        {products.results.map((product: any) => (
          <div class="bg-white border border-gray-200 rounded-xl p-4 transition hover:shadow-md">
            <div class="flex items-center mb-4">
                <input type="radio" name="sku_select" class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 mr-3" />
                <div>
                    <h3 class="font-bold text-gray-800">SKU: {product.sku}</h3>
                    <p class="text-sm text-gray-500">{product.name}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Images for this product */}
                {[1, 2, 3].map((i) => (
                   <div class="relative group">
                       <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-100 relative">
                           {product.original_url ? (
                               <img src={product.processed_url || product.original_url} class="w-full h-full object-cover p-2" />
                           ) : (
                               <div class="w-full h-full flex items-center justify-center text-gray-300">
                                   <i class="fas fa-image text-3xl"></i>
                               </div>
                           )}
                           
                           <div class="absolute top-2 left-2">
                               <input type="radio" class="w-4 h-4 bg-white border-gray-300 rounded-full" />
                           </div>

                           {/* Status Badge Mockup */}
                           {product.status === 'processing' && i === 2 && (
                               <div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                                   <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                   <span class="text-white text-xs font-bold px-2 py-1 bg-white/20 rounded-full backdrop-blur">白抜き処理中...</span>
                               </div>
                           )}
                       </div>
                       
                       <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-pointer" onclick={`window.location.href='/edit/${product.id}'`}></div>
                   </div> 
                ))}
            </div>
          </div>
        ))}
      </div>
      
      <div class="mt-8 flex justify-between items-center text-sm text-gray-500">
          <span>全 24 件中 1 から 2 件目を表示</span>
          <div class="flex space-x-1">
              <button class="px-3 py-1 border rounded hover:bg-gray-50 bg-white"><i class="fas fa-chevron-left"></i></button>
              <button class="px-3 py-1 border rounded bg-blue-50 text-blue-600 border-blue-200 font-bold">1</button>
              <button class="px-3 py-1 border rounded hover:bg-gray-50 bg-white">2</button>
              <button class="px-3 py-1 border rounded hover:bg-gray-50 bg-white">3</button>
              <button class="px-3 py-1 border rounded hover:bg-gray-50 bg-white"><i class="fas fa-chevron-right"></i></button>
          </div>
      </div>
    </Layout>
  )
})

// --- Editor (Screenshot 3) ---
app.get('/edit/:id', (c) => {
  const id = c.req.param('id')
  // Mock data for editor
  const imageSrc = "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=2070&auto=format&fit=crop"

  return c.render(
    <Layout active="dashboard" title="画像処理プレビュー">
        <div class="flex justify-between items-center -mt-6 mb-6">
            <div class="text-sm breadcrumbs text-gray-500">
                <a href="/dashboard" class="hover:text-blue-600">ダッシュボード</a> <span class="mx-2">›</span>
                <a href="#" class="hover:text-blue-600">商品登録</a> <span class="mx-2">›</span>
                <span class="text-gray-800 font-medium">画像処理プレビュー</span>
            </div>
            <div class="flex space-x-3">
                 <button class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
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
                         <button class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50">
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
                         <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
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
                     <span class="text-xs font-mono text-gray-400">IMG_20240901.jpg (Processing Mode)</span>
                </div>
                
                <div id="canvas-container" class="flex-1 bg-gray-50 border border-gray-100 rounded-lg relative overflow-hidden flex items-center justify-center" style="background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;">
                    <div class="relative shadow-2xl">
                         <canvas id="main-canvas" class="max-h-[600px] max-w-full object-contain cursor-crosshair"></canvas>
                         <div class="absolute top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm pointer-events-none">
                             <i class="fas fa-circle text-[8px] mr-1"></i> 処理後 (Processed)
                         </div>
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
                img.src = "${imageSrc}";
                
                // --- STATE ---
                let state = {
                    brightness: 0,
                    wb: 5500,
                    hue: 0,
                    tool: 'none', // 'brush', 'eraser'
                    brushSize: 24,
                    isDrawing: false
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
                    btnEraser: document.getElementById('btn-eraser')
                };

                // --- INIT ---
                img.onload = () => {
                    // Set canvas size to image size (high res)
                    // CSS will handle display size
                    canvas.width = img.width;
                    canvas.height = img.height;
                    maskCanvas.width = img.width;
                    maskCanvas.height = img.height;
                    
                    // Initial Render
                    render();
                };

                // --- RENDER LOOP ---
                function render() {
                    // 1. Clear Main Canvas
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // 2. Apply Filters (Brightness, Hue)
                    const bVal = 100 + parseInt(state.brightness);
                    const hVal = parseInt(state.hue);
                    ctx.filter = 'brightness(' + bVal + '%) hue-rotate(' + hVal + 'deg)';
                    
                    // 3. Draw Original Image
                    ctx.drawImage(img, 0, 0);
                    ctx.filter = 'none'; // Reset filter

                    // 4. Apply WB (Temperature) Simulation
                    // Simple overlay approach for performance
                    if (state.wb != 5500) {
                         ctx.save();
                         ctx.globalCompositeOperation = 'overlay';
                         if (state.wb > 5500) {
                             // Warm (Orange)
                             const intensity = (state.wb - 5500) / 3500 * 0.4;
                             ctx.fillStyle = 'rgba(255, 140, 0, ' + intensity + ')';
                         } else {
                             // Cool (Blue)
                             const intensity = (5500 - state.wb) / 3500 * 0.4;
                             ctx.fillStyle = 'rgba(0, 100, 255, ' + intensity + ')';
                         }
                         ctx.fillRect(0, 0, canvas.width, canvas.height);
                         ctx.restore();
                    }

                    // 5. Apply Mask (Eraser)
                    // 'destination-out' removes pixels where mask is drawn
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.drawImage(maskCanvas, 0, 0);
                    ctx.restore();
                }

                // --- EVENT LISTENERS (SLIDERS) ---
                const updateState = (key, val, displayEl, suffix = '') => {
                    state[key] = val;
                    if(displayEl) displayEl.innerText = val + suffix;
                    requestAnimationFrame(render);
                };

                els.brightness.addEventListener('input', (e) => updateState('brightness', e.target.value, els.valBrightness));
                els.wb.addEventListener('input', (e) => updateState('wb', e.target.value, els.valWb, 'K'));
                els.hue.addEventListener('input', (e) => updateState('hue', e.target.value, els.valHue, '°'));
                els.size.addEventListener('input', (e) => updateState('brushSize', e.target.value, els.valSize, 'px'));

                // --- TOOL SELECTION ---
                const setTool = (tool) => {
                    state.tool = (state.tool === tool) ? 'none' : tool;
                    
                    // UI Update
                    els.btnBrush.classList.remove('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    els.btnEraser.classList.remove('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    
                    if (state.tool === 'brush') els.btnBrush.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                    if (state.tool === 'eraser') els.btnEraser.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'ring-1');
                };

                els.btnBrush.addEventListener('click', () => setTool('brush'));
                els.btnEraser.addEventListener('click', () => setTool('eraser'));

                // --- DRAWING LOGIC ---
                // Helper to get coordinates relative to canvas resolution
                const getPos = (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    return {
                        x: (e.clientX - rect.left) * scaleX,
                        y: (e.clientY - rect.top) * scaleY
                    };
                };

                const startDraw = (e) => {
                    if (state.tool === 'none') return;
                    state.isDrawing = true;
                    draw(e);
                };

                const endDraw = () => {
                    state.isDrawing = false;
                    maskCtx.beginPath(); // Reset path
                };

                const draw = (e) => {
                    if (!state.isDrawing) return;
                    
                    const pos = getPos(e);
                    maskCtx.lineWidth = state.brushSize * 2; // Make it a bit bigger
                    maskCtx.lineCap = 'round';
                    maskCtx.lineJoin = 'round';

                    if (state.tool === 'eraser') {
                        // Eraser: Paint on mask (Opaque = Erased on Main)
                        maskCtx.globalCompositeOperation = 'source-over';
                        maskCtx.strokeStyle = 'rgba(0,0,0,1)';
                    } else if (state.tool === 'brush') {
                        // Brush (Restore): Erase from mask (Transparent = Visible on Main)
                        maskCtx.globalCompositeOperation = 'destination-out';
                        maskCtx.strokeStyle = 'rgba(0,0,0,1)';
                    }

                    maskCtx.lineTo(pos.x, pos.y);
                    maskCtx.stroke();
                    maskCtx.beginPath();
                    maskCtx.moveTo(pos.x, pos.y);

                    requestAnimationFrame(render);
                };

                canvas.addEventListener('mousedown', startDraw);
                canvas.addEventListener('mousemove', draw);
                canvas.addEventListener('mouseup', endDraw);
                canvas.addEventListener('mouseout', endDraw);
                
                // Touch support (basic)
                canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e.touches[0]); });
                canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
                canvas.addEventListener('touchend', endDraw);
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
                 
                 <div class="border-2 border-dashed border-blue-100 bg-blue-50/50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-colors h-64">
                     <div class="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mb-4 text-blue-500 text-2xl">
                         <i class="fas fa-cloud-upload-alt"></i>
                     </div>
                     <p class="font-bold text-blue-600 mb-1">クリックして選択 <span class="text-gray-500 font-normal">またはドラッグ＆ドロップ</span></p>
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
                     <button class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200">
                         インポート実行
                     </button>
                 </div>
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

export default app

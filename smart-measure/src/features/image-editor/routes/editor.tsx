import { Hono } from 'hono'
import { getImageUploadApiUrl } from '../helpers/image-url'
import type { AppEnv } from '../../../types/bindings'
import { Layout } from '../../../components'
import { getCompanyId } from '../../auth/helpers/auth'
import { getImageDisplayUrl } from '../helpers/image-status'
import { logger } from '../../../shared/helpers/logger'

const editor = new Hono<AppEnv>()

// Note: No authentication middleware here - SSR pages need to be accessible
// We check for authenticated user first, then fall back to database lookup by SKU

editor.post('/api/upload-image', async (c) => {
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
editor.get('/edit/:id', async (c) => {
  const id = c.req.param('id')
  
  // Priority 1: Get company_id from authenticated user
  const user = c.get('user') as { companyId?: string } | undefined;
  let companyId = user?.companyId;
  let isAuthenticated = !!companyId;
  
  if (companyId) {
    logger.debug(`✅ Editor accessed by authenticated user with companyId: ${companyId}`);
  } else {
    // Priority 2: For unauthenticated access, get company_id from database by SKU
    // This will be set later after parsing the imageId to extract SKU
    logger.debug(`⚠️ Editor accessed without authentication - will lookup company_id from database`);
  }
  
  // Parse R2 image ID: r2_{SKU}_{filename_without_ext} or measurement_{SKU}
  let imageResult: any = null;
  let isMeasurement = false;
  let maskImageUrl: string | null = null;
  
  // Handle measurement images
  if (id.startsWith('measurement_')) {
    const sku = id.replace('measurement_', '');
    isMeasurement = true;
    
    // Get measurement image and mask URL from database
    // 通常画像と同じ仕組み: processed_imagesに"measurement"があれば_p.pngをimage-proxy経由で表示
    const dbResult = await c.env.DB.prepare(`
      SELECT 
        COALESCE(annotated_image_url, measurement_image_url) as original_url,
        COALESCE(processed_images, '[]') as processed_images,
        mask_image_url_r2,
        mask_image_url,
        updated_at
      FROM product_items
      WHERE sku = ? AND company_id = ?
      LIMIT 1
    `).bind(sku, companyId).first();
    
    if (dbResult && dbResult.original_url) {
      const originalUrl = dbResult.original_url as string;
      const updatedAt = dbResult.updated_at as string;
      const cacheV = new Date(updatedAt).getTime();

      // processed_imagesに"measurement"があれば背景削除済み
      let processedImages: string[] = [];
      try { processedImages = JSON.parse(dbResult.processed_images as string || '[]'); } catch {}
      const isProcessed = processedImages.includes('measurement');

      // マスク: 背景削除マスク優先、なければ採寸マスク
      maskImageUrl = (dbResult.mask_image_url_r2 || dbResult.mask_image_url) as string | null;

      const processedUrl = isProcessed
        ? `/api/image-proxy/${sku}/measurement_p.png?v=${cacheV}`
        : null;

      imageResult = {
        id: id,
        original_url: originalUrl,
        processed_url: processedUrl,
        sku: sku,
        product_name: `商品 ${sku} - 採寸データ`,
        status: isProcessed ? 'processed' : 'measurement'
      };
    }
  } else if (id.startsWith('r2_')) {
    const parts = id.replace('r2_', '').split('_');
    
    if (parts.length >= 2) {
      const sku = parts[0];
      const filenamePart = parts.slice(1).join('_');
      logger.debug(`🔍 Editor parsing imageId: ${id}`);
      logger.debug(`🔍 Extracted SKU: ${sku}, filenamePart: ${filenamePart}`);
      
      // If not authenticated, get company_id from database by SKU
      if (!companyId) {
        try {
          const companyResult = await c.env.DB.prepare(`
            SELECT company_id FROM product_items WHERE sku = ? LIMIT 1
          `).bind(sku).first();
          
          if (companyResult) {
            companyId = companyResult.company_id as string;
            logger.debug(`✅ Retrieved company_id from DB: ${companyId} for SKU: ${sku}`);
          } else {
            logger.error(`❌ SKU ${sku} not found in database`);
            return c.redirect('/dashboard');
          }
        } catch (e) {
          logger.error(`❌ Failed to get company_id for SKU ${sku}:`, e);
          return c.redirect('/dashboard');
        }
      }
      
      // ✅ Performance fix: Get image status from DB instead of R2.list()
      let updatedAt = new Date().toISOString();
      let processedImages: string[] = [];
      let finalImages: string[] = [];
      
      try {
        const dbResult = await c.env.DB.prepare(`
          SELECT updated_at, 
                 COALESCE(processed_images, '[]') as processed_images,
                 COALESCE(final_images, '[]') as final_images,
                 COALESCE(mask_images_r2, '[]') as mask_images_r2
          FROM product_items 
          WHERE sku = ? AND company_id = ?
          LIMIT 1
        `).bind(sku, companyId).first();
        
        if (dbResult) {
          if (dbResult.updated_at) {
            updatedAt = dbResult.updated_at as string;
          }
          // mask_images_r2（JSON配列）から filenamePart に一致するマスクURLを取得
          try {
            const maskImages: Array<{ filename: string; url: string }> =
              JSON.parse(dbResult.mask_images_r2 as string || '[]');
            const matched = maskImages.find(m => m.filename === filenamePart);
            if (matched) {
              maskImageUrl = matched.url;
              logger.debug(`🎭 Mask image URL found (mask_images_r2[${filenamePart}]): ${maskImageUrl}`);
            } else {
              logger.debug(`🎭 No mask found for filenamePart: ${filenamePart} in mask_images_r2: ${JSON.stringify(maskImages)}`);
            }
          } catch (e) {
            logger.warn('⚠️ Failed to parse mask_images_r2:', e);
          }
          try {
            processedImages = JSON.parse(dbResult.processed_images as string || '[]');
            finalImages = JSON.parse(dbResult.final_images as string || '[]');
            logger.debug(`🔍 DB status - SKU: ${sku}, processed: ${JSON.stringify(processedImages)}, final: ${JSON.stringify(finalImages)}`);
          } catch (e) {
            logger.error('Failed to parse image status:', e);
          }
        }
      } catch (e) {
        logger.warn(`⚠️ Failed to get image status for SKU ${sku}:`, e);
      }
      
      const cacheVersion = new Date(updatedAt).getTime();
      // Note: companyId is already defined at line 36
      
      logger.debug(`🔍 Calling getImageDisplayUrl with filenamePart: ${filenamePart}`);
      
      // Use helper function to get display URL based on DB status (no R2 API calls)
      // updatedAt を渡すことでキャッシュバスターを DB の更新日時ベースに固定する
      const imageStatus = getImageDisplayUrl(
        sku,
        filenamePart,
        processedImages,
        finalImages,
        companyId,
        updatedAt
      );
      
      const baseImageUrl = imageStatus.url;
      const status = imageStatus.status === 'final' ? 'final' : 
                    imageStatus.status === 'processed' ? 'processed' : 'ready';
      
      logger.debug(`🎯 Editor using image status from DB: ${status} (no R2 list() call)`);
      
      // Set original URL using image proxy (supports both original and processed images)
      const originalUrl = `/api/image-proxy/${sku}/${filenamePart}.jpg?v=${cacheVersion}`;
      
      // Only set processed_url if status is 'processed' or 'final'
      const processedUrl = (status === 'processed' || status === 'final') ? baseImageUrl : null;
      
      logger.debug(`🔍 Editor URLs - Original: ${originalUrl}, Processed: ${processedUrl}, Status: ${status}`);
      
      imageResult = {
        id: id,
        original_url: originalUrl,
        processed_url: processedUrl,  // null if not processed
        sku: sku,
        product_name: `商品 ${sku}`,
        status: status
      };
      
      logger.debug(`📦 imageResult - status: ${status}, original: ${originalUrl}, processed: ${processedUrl}`);
    }
  }
  
  if (!imageResult) {
    return c.redirect('/dashboard');
  }
  
  // f画像 > p画像 > オリジナルの優先順位で表示
  // getImageDisplayUrl がすでにキャッシュバスター付きURLを返すので、
  // ?v= の二重付与を避けるためそのまま使用する
  const baseImageSrc = (imageResult.processed_url || imageResult.original_url) as string;
  // baseImageSrc にすでに ?v= が含まれる場合は追加しない
  const imageSrc = baseImageSrc.includes('?v=') ? baseImageSrc : `${baseImageSrc}?v=${Date.now()}`;
  const baseOriginalSrc = imageResult.original_url as string;
  const originalSrc = baseOriginalSrc.includes('?v=') ? baseOriginalSrc : `${baseOriginalSrc}?v=${Date.now()}`;
  const isProcessed = !!imageResult.processed_url;
  const productSku = imageResult.sku || 'Unknown';
  const productName = imageResult.product_name || '';
  const hasMask = true; // マスクURLの有無に関わらず常にマスク編集タブを表示

  // マスクURLにもキャッシュバスターを付与（保存後の古いマスクが表示されないように）
  const maskImageUrlWithCache = maskImageUrl
    ? `${maskImageUrl}?_cb=${Date.now()}`
    : '';
  
  logger.debug(`📤 Sending to browser - imageSrc: ${imageSrc}, originalSrc: ${originalSrc}`);

  return c.render(
    <Layout active="dashboard" title="画像処理プレビュー">
        <div class="flex justify-between items-center -mt-6 mb-6">
            <div class="text-sm breadcrumbs text-gray-500">
                <a href="/dashboard" class="hover:text-blue-600">ダッシュボード</a> <span class="mx-2">›</span>
                <a href="#" class="hover:text-blue-600">商品登録</a> <span class="mx-2">›</span>
                <span class="text-gray-800 font-medium">画像処理プレビュー</span>
            </div>
            <div class="flex space-x-3">
                 <button id="btn-toggle-original" onclick="window.toggleOriginal()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center hover:bg-gray-50 transition-colors text-sm font-medium">
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
                {/* Tab Navigation - 常に表示 */}
                <div class="flex space-x-2 mb-4 border-b border-gray-200">
                    <button 
                        id="tab-adjust" 
                        class="flex-1 px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors"
                        onclick="switchTab('adjust')"
                    >
                        <i class="fas fa-sliders-h mr-1"></i> 画像調整
                    </button>
                    <button 
                        id="tab-mask" 
                        class="flex-1 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors"
                        onclick="switchTab('mask')"
                    >
                        <i class="fas fa-mask mr-1"></i> マスク編集
                    </button>
                </div>

                
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-gray-800 text-sm" id="tool-title">
                        <i class="fas fa-sliders-h mr-2"></i> 編集ツール
                    </h3>
                    <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">v2.0</span>
                </div>

                {/* Image Adjust Tools */}
                <div id="adjust-tools">
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
                     <div class="space-y-2">
                         <button id="btn-save" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
                             <i class="fas fa-save mr-2"></i> 保存してダッシュボードへ
                         </button>
                         <button class="w-full bg-white hover:bg-gray-50 text-gray-500 font-medium py-2 rounded-lg transition-colors text-sm border border-transparent hover:border-gray-200">
                             キャンセル
                         </button>
                     </div>
                 </div>
                </div>
                {/* End Image Adjust Tools */}
                
                {/* Mask Edit Tools */}
                <div id="mask-tools" class="hidden">
                    {/* Mode Selection */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">編集モード</div>
                        <div class="flex space-x-2">
                            <button 
                                id="mask-mode-brush"
                                onclick="setMaskMode('brush')"
                                class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <i class="fas fa-paintbrush mr-1"></i> ブラシ
                            </button>
                            <button 
                                id="mask-mode-eraser"
                                onclick="setMaskMode('eraser')"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <i class="fas fa-eraser mr-1"></i> 消しゴム
                            </button>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">
                            <strong>ブラシ:</strong> 白く塗る（削除エリア）<br/>
                            <strong>消しゴム:</strong> 黒く塗る（保持エリア）
                        </div>
                    </div>

                    {/* Brush Size for Mask */}
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">ブラシサイズ</div>
                        <div class="flex justify-between text-xs font-medium mb-2">
                            <span>サイズ</span>
                            <span id="val-mask-brush-size" class="text-blue-600">20px</span>
                        </div>
                        <input 
                            type="range" 
                            id="range-mask-brush-size" 
                            min="1" 
                            max="50" 
                            value="20" 
                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>

                    {/* History Controls */}
                    <div class="mb-6">
                        <button 
                            onclick="undoMask()"
                            class="w-full bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                        >
                            <i class="fas fa-undo mr-1"></i> 元に戻す
                        </button>
                    </div>

                    {/* Save Mask */}
                    <div class="mt-auto pt-4 border-t border-gray-100">
                        <div class="space-y-2">
                            <button onclick={`saveMask('${productSku}')`} class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-200 transition-all flex items-center justify-center text-sm">
                                <i class="fas fa-save mr-2"></i> 保存
                            </button>
                        </div>
                    </div>
                </div>
                {/* End Mask Edit Tools */}
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

        {/* Load mask editor script - 常に読み込む */}
        <script src="/static/editor/mask/editor.js"></script>
        
        {/* Editor Data Container */}

        
        <div id="editor-data"

        
             data-is-measurement={String(isMeasurement)}

        
             data-has-mask={String(hasMask)}

        
             data-mask-image-url={maskImageUrlWithCache}

        
             data-product-sku={productSku}

        
             data-image-id={id}

        
             data-image-src={imageSrc}

        
             data-original-src={originalSrc}

        
             data-is-processed={String(isProcessed)}

        
             style="display: none;">

        
        </div>
        {/* --- IMAGE PROCESSING LOGIC --- 読み込み順を保証 ---
             1. editor-state.js   → window.EditorState
             2. image-adjust.js   → window.ImageAdjust
             3. mask-tools.js     → window.MaskTools
             4. crop-tool.js      → window.CropTool
             5. image-processing.js → 統合エントリーポイント
             6. tab-switching.js  → window.switchTab
        */}
        <script src="/static/editor/tools/editor-state.js"></script>
        <script src="/static/editor/tools/image-adjust.js"></script>
        <script src="/static/editor/tools/mask-tools.js"></script>
        <script src="/static/editor/tools/crop-tool.js"></script>
        <script src="/static/editor/tools/image-processing.js"></script>
        <script src="/static/editor/common/tab-switching.js"></script>
    </Layout>
  )
})


export default editor

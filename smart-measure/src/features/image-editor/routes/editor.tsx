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
    const dbResult = await c.env.DB.prepare(`
      SELECT 
        COALESCE(measurement_image_url, annotated_image_url) as image_url,
        mask_image_url,
        updated_at
      FROM product_items
      WHERE sku = ? AND company_id = ?
      LIMIT 1
    `).bind(sku, companyId).first();
    
    if (dbResult && dbResult.image_url) {
      const imageUrl = dbResult.image_url as string;
      maskImageUrl = dbResult.mask_image_url as string | null;
      
      imageResult = {
        id: id,
        original_url: imageUrl,
        processed_url: imageUrl.includes('_p.png') ? imageUrl : null,
        sku: sku,
        product_name: `商品 ${sku} - 採寸データ`,
        status: imageUrl.includes('_p.png') ? 'processed' : 'measurement'
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
                 mask_image_url
          FROM product_items 
          WHERE sku = ? AND company_id = ?
          LIMIT 1
        `).bind(sku, companyId).first();
        
        if (dbResult) {
          if (dbResult.updated_at) {
            updatedAt = dbResult.updated_at as string;
          }
          if (dbResult.mask_image_url) {
            maskImageUrl = dbResult.mask_image_url as string;
            logger.debug(`🎭 Mask image URL found: ${maskImageUrl}`);
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
      const imageStatus = getImageDisplayUrl(
        sku,
        filenamePart,
        processedImages,
        finalImages,
        companyId
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
  
  // Use processed image if available, otherwise original
  // 🆕 Add timestamp to bypass browser cache after regeneration
  const baseImageSrc = (imageResult.processed_url || imageResult.original_url) as string;
  const imageSrc = `${baseImageSrc}?v=${Date.now()}`;
  const baseOriginalSrc = imageResult.original_url as string;
  const originalSrc = `${baseOriginalSrc}?v=${Date.now()}`;
  const isProcessed = !!imageResult.processed_url;
  const productSku = imageResult.sku || 'Unknown';
  const productName = imageResult.product_name || '';
  const hasMask = !!maskImageUrl;
  
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
                {/* Tab Navigation - Only show if measurement image with mask */}
                {isMeasurement && hasMask && (
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
                )}
                
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
                     <div class="grid grid-cols-2 gap-2">
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
                         <button id="btn-mask" class="tool-btn flex flex-col items-center justify-center p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600" onclick="enableMaskMode()">
                             <i class="fas fa-mask mb-1 text-sm"></i>
                             <span class="text-[10px]">マスク</span>
                         </button>
                     </div>
                     <div id="mask-mode-indicator" class="mt-2 text-xs text-center text-blue-600 font-medium hidden">
                         <i class="fas fa-info-circle mr-1"></i> 青い部分が商品として保持されます
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

                {/* Mask Editing Panel (Hidden by default) */}
                <div id="mask-panel" class="mb-4 border-2 border-blue-200 rounded-lg p-3 bg-blue-50 hidden">
                    <div class="text-xs font-bold text-blue-700 mb-3 flex items-center">
                        <i class="fas fa-mask mr-2"></i>
                        マスク編集モード
                    </div>
                    
                    {/* Brush/Eraser Toggle */}
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <button id="mask-brush-btn" class="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
                            <i class="fas fa-paint-brush mb-1"></i>
                            商品指定
                        </button>
                        <button id="mask-eraser-btn" class="flex flex-col items-center justify-center p-2 bg-white border-2 border-blue-400 rounded-lg text-xs font-medium text-blue-600">
                            <i class="fas fa-eraser mb-1"></i>
                            背景指定
                        </button>
                    </div>
                    
                    {/* Mask Edit Hint */}
                    <div class="mb-3 text-[10px] text-gray-500 bg-white border border-gray-200 rounded-lg p-2">
                        <i class="fas fa-lightbulb text-yellow-500 mr-1"></i>
                        最初は全体が<strong class="text-blue-600">青（商品）</strong>。消しゴムで背景を指定
                    </div>
                    
                    {/* Mask Brush Size */}
                    <div class="mb-3">
                        <div class="flex justify-between text-[10px] text-gray-600 mb-1">
                            <span>ブラシサイズ</span>
                            <span id="mask-size-val" class="font-bold text-blue-600">20px</span>
                        </div>
                        <input type="range" id="mask-size" min="5" max="100" value="20" class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    </div>
                    
                    {/* Undo/Redo */}
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <button id="mask-undo" class="py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-700 font-medium">
                            <i class="fas fa-undo mr-1"></i> 元に戻す
                        </button>
                        <button id="mask-redo" class="py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-700 font-medium">
                            <i class="fas fa-redo mr-1"></i> やり直す
                        </button>
                    </div>
                    
                    {/* Mask Visibility Toggle */}
                    <div class="mb-3">
                        <label class="flex items-center space-x-2 p-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" id="mask-visibility-toggle" checked class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                            <span class="text-xs font-medium text-gray-700">
                                <i class="fas fa-eye text-blue-600 mr-1"></i>
                                青いマスクを表示
                            </span>
                        </label>
                    </div>
                    
                    {/* Mask Actions */}
                    <div class="space-y-2">
                        <button id="mask-preview" class="w-full py-2 text-xs bg-white border border-blue-300 rounded-lg hover:bg-blue-50 text-blue-600 font-bold">
                            <i class="fas fa-eye mr-1"></i> プレビュー
                        </button>
                        <button id="mask-save" class="w-full py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow">
                            <i class="fas fa-save mr-1"></i> マスクを保存
                        </button>
                        <button id="mask-cancel" class="w-full py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                            <i class="fas fa-times mr-1"></i> キャンセル
                        </button>
                    </div>
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
                {/* End Image Adjust Tools */}
                
                {/* Mask Edit Tools */}
                <div id="mask-tools" style="display: none;">
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
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">履歴</div>
                        <div class="flex space-x-2">
                            <button 
                                onclick="undoMask()"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                                <i class="fas fa-undo mr-1"></i> 元に戻す
                            </button>
                            <button 
                                onclick="redoMask()"
                                class="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                            >
                                <i class="fas fa-redo mr-1"></i> やり直し
                            </button>
                        </div>
                    </div>

                    {/* Save Mask */}
                    <div class="mt-auto pt-4 border-t border-gray-100">
                        <div class="space-y-2">
                            <button onclick="previewMask()" class="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 rounded-lg transition-colors text-sm border border-gray-200">
                                <i class="fas fa-eye mr-2"></i> プレビュー
                            </button>
                            <button onclick="resetMask()" class="w-full bg-white hover:bg-gray-50 text-gray-500 font-medium py-2 rounded-lg transition-colors text-sm border border-gray-200">
                                <i class="fas fa-undo mr-2"></i> リセット
                            </button>
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

        {/* Load mask editor script if measurement image with mask */}
        {isMeasurement && hasMask && (
            <script src="/static/editor/mask/editor.js"></script>
        )}
        
        {/* Editor Data Container */}

        
        <div id="editor-data"

        
             data-is-measurement={String(isMeasurement)}

        
             data-has-mask={String(hasMask)}

        
             data-mask-image-url={maskImageUrl || ''}

        
             data-product-sku={productSku}

        
             data-image-id={id}

        
             data-image-src={imageSrc}

        
             data-original-src={originalSrc}

        
             data-is-processed={String(isProcessed)}

        
             style="display: none;">

        
        </div>
        {/* --- IMAGE PROCESSING LOGIC --- Load first to define mask functions */}
        <script src="/static/editor/tools/image-processing.js"></script>
        <script src="/static/editor/common/tab-switching.js"></script>
    </Layout>
  )
})


export default editor

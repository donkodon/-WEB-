import { Hono } from 'hono'
import type { AppEnv } from '../../../types/bindings'
import type { CsvExportRow } from '../../../types/database'
import { getCompanyId } from '../../auth/helpers/auth'
import { requireFirebaseAuth } from '../../auth/middleware/auth'
import { getImageUploadApiUrl } from '../../image-editor/helpers/image-url'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const csv = new Hono<AppEnv>()

// Apply Firebase authentication to all CSV endpoints
csv.use('*', requireFirebaseAuth)

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

  // eslint-disable-next-line max-lines-per-function
csv.post('/api/import-csv', async (c) => {
    logger.debug('📥 CSV Import API called');
    
    // Get company_id from cookie (Phase 1: Dynamic company_id)
    const companyId = getCompanyId(c);
    logger.debug(`📦 CSV Import: company_id=${companyId}`);
    
    const body = await c.req.parseBody();
    const file = body['csv'];
    
    logger.debug('📁 Received file:', file ? 'YES' : 'NO', file instanceof File ? '(File object)' : '(Not a File)');
    
    if (!file || !(file instanceof File)) {
        logger.error('❌ No valid file uploaded');
        return c.text('No file uploaded', 400);
    }
    
    logger.debug('📄 File details:', {
        name: file.name,
        type: file.type,
        size: file.size
    });

    const buffer = await file.arrayBuffer();
    logger.debug(' File read as buffer, size:', buffer.byteLength, 'bytes');
    
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
    
    logger.debug('🔍 Encoding detection:', {
        hasUtf8Bom,
        hasMojibake,
        firstLinePreview: text.split(/\r\n|\n|\r/)[0].substring(0, 100)
    });
    
    // If UTF-8 BOM is present, force UTF-8
    if (hasUtf8Bom) {
        logger.debug('✅ UTF-8 BOM detected, using UTF-8');
        encoding = 'UTF-8';
    }
    // If mojibake detected and no UTF-8 BOM, try Shift-JIS
    else if (hasMojibake) {
        logger.warn(' Mojibake detected, trying Shift-JIS...');
        try {
            text = new TextDecoder('shift-jis').decode(buffer);
            encoding = 'Shift-JIS';
            logger.debug('✅ Shift-JIS decoding successful');
            logger.debug('📝 First line after Shift-JIS:', text.split(/\r\n|\n|\r/)[0].substring(0, 100));
        } catch {
            logger.warn('⚠️ Shift-JIS decoding failed, keeping UTF-8');
            encoding = 'UTF-8 (fallback)';
        }
    } else {
        logger.debug('✅ UTF-8 decoding looks good');
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
    logger.debug('📄 Raw CSV Headers (count=' + headers.length + '):', headers.slice(0, 10).join(' | ') + '...');

    // Mapping indexes based on header row (exact match first, then fuzzy matching)
    // User requested specific column mapping:
    // A:バーコード, B:ID, C:ブランド, E:品名/商品名, F:サイズ, G:カラー, L:商品ランク, Y:現状売価
    const getIndex = (names: string[]): number => {
        // First try exact match (case-insensitive)
        for (const name of names) {
            const exactIdx = headers.findIndex(h => h && h.toLowerCase() === name.toLowerCase());
            if (exactIdx > -1) {
                logger.debug(`✅ Exact match: "${name}" -> column ${exactIdx}`);
                return exactIdx;
            }
        }
        // Then try partial match (contains)
        for (const name of names) {
            const partialIdx = headers.findIndex(h => h && h.includes(name));
            if (partialIdx > -1) {
                logger.debug(`✅ Partial match: "${name}" found in "${headers[partialIdx]}" -> column ${partialIdx}`);
                return partialIdx;
            }
        }
        logger.debug(`⚠️ No match found for: ${names.join(', ')}`);
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
        logger.error(' Missing required columns:', missingRequired);
        logger.error('Available headers:', headers);
    }

    let count = 0;
    const skippedRows: { row: number; reason: string; data: string }[] = [];
    const problemRows: { row: number; sku: string; reason: string; rawData: string[] }[] = [];
    
    // Debug: Log index mapping
    logger.debug('📋 CSV Index Mapping:', JSON.stringify(idx, null, 2));
    logger.debug('📋 Headers:', JSON.stringify(headers, null, 2));
    
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
            logger.debug('🔍 First Row Parsed:', JSON.stringify(row, null, 2));
            logger.debug('🔍 SKU (idx=' + idx.sku + '):', row[idx.sku]);
            logger.debug('🔍 Name (idx=' + idx.name + '):', row[idx.name]);
            logger.debug('🔍 Brand (idx=' + idx.brand + '):', row[idx.brand]);
            logger.debug('🔍 Size (idx=' + idx.size + '):', row[idx.size]);
            logger.debug('🔍 Color (idx=' + idx.color + '):', row[idx.color]);
            logger.debug('🔍 Price Sale (idx=' + idx.price_sale + '):', row[idx.price_sale]);
        }
        
        // Use safe getter for all values
        const rowSku = getRowValue(row, idx.sku);
        const rowName = getRowValue(row, idx.name);
        
        // Debug: Log problematic rows
        if (!rowSku && !rowName) {
            const reason = `No SKU (idx=${idx.sku}) or Name (idx=${idx.name}). Row has ${row.length} fields.`;
            logger.debug(`⚠️ Row ${i} skipped: ${reason}`);
            skippedRows.push({ row: i, reason, data: row.slice(0, 5).join('|') });
            continue;
        }
        
        // If we have SKU but no name, log a warning (this causes '不明な製品')
        if (rowSku && !rowName) {
            const reason = `SKU exists but NAME is empty/null. name_idx=${idx.name}, row[${idx.name}]="${row[idx.name]}"`;
            logger.debug(`⚠️ Row ${i} - SKU "${rowSku}": ${reason}`);
            logger.debug(`   Raw row data (first 10 fields): ${row.slice(0, 10).map((v, j) => `[${j}]="${v}"`).join(', ')}`);
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
            logger.debug(`💾 Executing batch: ${batch.length} rows`);
            await c.env.DB.batch(batch);
            logger.debug(`✅ Batch executed successfully`);
            batch.length = 0;
        }
    }
    
    if (batch.length > 0) {
        logger.debug(`💾 Executing final batch: ${batch.length} rows`);
        await c.env.DB.batch(batch);
        logger.debug(`✅ Final batch executed successfully`);
    }
    
    logger.debug(`✅ CSV Import Complete: ${count} rows inserted/updated in database`);

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
csv.get('/api/download-csv-template', async (_c) => {
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


  // eslint-disable-next-line max-lines-per-function
csv.post('/api/export-selected-csv', async (c) => {
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
        const groupedBySku = new Map<string, CsvExportRow[]>();
        for (const row of result.results as CsvExportRow[]) {
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
        logError('CSV export selected', error, { imageIdsCount: imageIds?.length });
        return c.text('CSV export failed', 500);
    }
});

// ========================================
// 商品データDL機能
// ========================================

// 新しいCSV出力API: product_itemsテーブルから直接データ取得
  // eslint-disable-next-line max-lines-per-function
csv.post('/api/export-product-items', async (c) => {
    try {
        const body = await c.req.json();
        const imageIds = body.imageIds as string[];
        
        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return c.text('No image IDs provided', 400);
        }
        
        logger.debug('📊 CSV Export - imageIds:', imageIds);
        
        // imageIdsからSKUを抽出
        // 例: r2_1025L280001_1025L280001_4 → SKU = 1025L280001
        const skus = [...new Set(imageIds.map(id => {
            const parts = id.split('_');
            return parts[1]; // 2番目の部分がSKU
        }).filter(Boolean))];
        
        logger.debug('📦 Extracted SKUs:', skus);
        
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
        
        logger.debug(' Query result:', result.results?.length, 'items');
        
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
        
        interface ProductItemCsv {
            sku: string | null
            item_code: string | null
            name: string | null
            barcode: string | null
            color: string | null
            category: string | null
            price: string | null
            size: string | null
            brand: string | null
            actual_measurements: string | null
            condition: string | null
            material: string | null
            product_rank: string | null
            inspection_notes: string | null
            status: string | null
        }
        
        for (const row of result.results as ProductItemCsv[]) {
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
        
        logger.debug(' CSV generated:', csvLines.length, 'lines');
        
        return new Response(csvContent, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="product_items.csv"'
            }
        });
        
    } catch (error: any) {
        logError('CSV export product items', error, { imageIdsCount: imageIds?.length });
        return c.text('CSV export failed', 500);
    }
});


  // eslint-disable-next-line max-lines-per-function
csv.get('/api/download-product-data/:imageId', async (c) => {
    try {
        const imageId = c.req.param('imageId');
        
        logger.debug('🖼️ Download product data - imageId:', imageId);
        
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
        
        logger.debug('📦 Extracted SKU:', sku, 'Filename part:', filenamePart);
        
        // R2から直接取得（DBは使わない）
        // Phase A優先順位: _f.png（編集済み最新） > _p.png（白抜きのみ） > .jpg（元画像）
        let r2Object = null;
        let status = 'original';
        let key = '';
        const companyId = getCompanyId(c);
        
        // 1. 最優先: 編集済み画像をチェック（{company_id}/{sku}/{filename}_f.png）⭐ (Phase 1: Dynamic company_id)
        const finalKey = `${companyId}/${sku}/${filenamePart}_f.png`;
        logger.debug('🔍 Step 1: Checking final edited image:', finalKey);
        
        try {
            r2Object = await c.env.PRODUCT_IMAGES.get(finalKey);
            if (r2Object) {
                key = finalKey;
                status = 'final';
                logger.debug(' Found FINAL edited image:', finalKey);
            }
        } catch {
            logger.warn(' No final edited image found');
        }
        
        // 2. フォールバック: 白抜き画像をチェック（{company_id}/{sku}/{filename}_p.png） (Phase 1: Dynamic company_id)
        if (!r2Object) {
            const processedKey = `${companyId}/${sku}/${filenamePart}_p.png`;
            logger.debug('🔍 Step 2: Checking processed image:', processedKey);
            
            try {
                r2Object = await c.env.PRODUCT_IMAGES.get(processedKey);
                if (r2Object) {
                    key = processedKey;
                    status = 'processed';
                    logger.debug(' Found processed image:', processedKey);
                }
            } catch {
                logger.warn(' No processed image found');
            }
        }
        
        // 3. 最終フォールバック: オリジナル画像をチェック（WEB側のR2）
        if (!r2Object) {
            // 複数の拡張子を試行（jpg, jpeg, png, webp）
            const extensions = ['jpg', 'jpeg', 'png', 'webp'];
            
            for (const ext of extensions) {
                const originalKey = `${companyId}/${sku}/${filenamePart}.${ext}`;
                logger.debug('🔍 Step 3: Checking original image in WEB R2:', originalKey);
                
                try {
                    r2Object = await c.env.PRODUCT_IMAGES.get(originalKey);
                    if (r2Object) {
                        key = originalKey;
                        status = 'original';
                        logger.debug(' Found original image in WEB R2:', originalKey);
                        break;
                    }
                } catch {
                    // 次の拡張子を試す
                }
            }
        }
        
        // 4. 最終的なフォールバック: image-upload-api経由で元画像を取得
        if (!r2Object) {
            logger.debug('🔍 Step 4: Trying to fetch from image-upload-api');
            const IMAGE_UPLOAD_API_URL = getImageUploadApiUrl(c.env);
            const extensions = ['jpg', 'jpeg', 'png', 'webp'];
            
            let imageUrl = null;
            let foundExt = 'jpg';
            
            for (const ext of extensions) {
                const testUrl = `${IMAGE_UPLOAD_API_URL}/${companyId}/${sku}/${filenamePart}.${ext}`;
                logger.debug('🔍 Testing:', testUrl);
                
                try {
                    const response = await fetch(testUrl, { method: 'HEAD' });
                    if (response.ok) {
                        imageUrl = testUrl;
                        foundExt = ext;
                        status = 'original';
                        logger.debug(' Found original image in image-upload-api:', testUrl);
                        break;
                    }
                } catch {
                    // 次の拡張子を試す
                }
            }
            
            if (imageUrl) {
                // image-upload-api経由で画像を取得してプロキシする
                const filename = `${filenamePart}_${status}.${foundExt}`;
                logger.debug('📝 Generated filename:', filename);
                logger.debug('🔗 Fetching from image-upload-api:', imageUrl);
                logger.debug('📊 Status:', status);
                
                try {
                    // image-upload-apiから画像をフェッチ
                    const response = await fetch(imageUrl);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch from image-upload-api: ${response.status}`);
                    }
                    
                    const imageBuffer = await response.arrayBuffer();
                    logger.debug(' Successfully fetched image from image-upload-api, size:', imageBuffer.byteLength);
                    
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
                } catch {
                    logger.error(' Error fetching from image-upload-api:', error);
                    // Continue to check if there's an R2 object
                }
            }
        }
        
        // 5. どれも見つからない場合は404
        if (!r2Object) {
            logger.debug('❌ No image found for:', filenamePart);
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
        
        logger.debug('📝 Generated filename:', filename);
        logger.debug('🔗 Proxy URL (WEB R2):', imageUrl);
        logger.debug('📊 Status:', status);
        
        return c.json({
            imageUrl: imageUrl,
            filename: filename,
            sku: sku,
            status: status
        });
        
    } catch (error: any) {
        logError('Download product data', error, { imageId });
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});


export default csv

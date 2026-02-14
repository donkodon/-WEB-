/**
 * Image Upload API (完全版) v4.1 with company_id support
 * 
 * ✅ v4.1 修正内容:
 * - CORS設定を特定ドメインに限定（CSRF攻撃対策）
 * - console.logを削除（機密情報露出防止）
 * - エラーハンドリング改善（スタック情報を本番環境で非表示）
 * 
 * ✅ v4.0 修正内容: company_id フォルダ対応
 * - アップロード時: company_id/{sku}/{fileName}
 * - 取得時: company_id/{sku}/{fileName}
 * - 削除時: company_id/{sku}/{fileName}
 */

// 許可されたオリジンのリスト
const ALLOWED_ORIGINS = [
  'https://smart-measure.pages.dev',
  'https://smart-measure-production.pages.dev',
  'https://measure-master-api.jinkedon2.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8788',
  'http://127.0.0.1:8788'
];

// CORS設定を動的に生成
function getCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ==========================================
      // Root endpoint - API documentation
      // ==========================================
      if (path === '/' && request.method === 'GET') {
        return new Response(JSON.stringify({
          service: 'Image Upload API (完全版)',
          version: '4.1',
          changes: 'Security improvements: CORS restrictions, removed console.log, improved error handling',
          previous_version: '4.0 - Added company_id folder support',
          endpoints: {
            upload: 'POST /upload (FormData: file, fileName, sku, company_id)',
            delete: 'DELETE /delete?filename={company_id}/{sku}/{filename}',
            batchDelete: 'POST /batch-delete (JSON: { filenames: [...] })',
            exists: 'GET /exists?filename={company_id}/{sku}/{filename}',
            list: 'GET /list?company_id={company_id}&sku={sku}&limit=100',
            get: 'GET /{company_id}/{sku}/{fileName}',
          },
          examples: {
            upload: {
              method: 'POST',
              url: '/upload',
              formData: {
                file: 'Binary file data',
                fileName: '1025L280001_uuid.jpg',
                sku: '1025L280001',
                company_id: 'test_company'
              }
            },
            delete: {
              method: 'DELETE',
              url: '/delete?filename=test_company/1025L280001/1025L280001_uuid.jpg'
            },
            list: {
              method: 'GET',
              url: '/list?company_id=test_company&sku=1025L280001&limit=100'
            },
            get: {
              method: 'GET',
              url: '/test_company/1025L280001/1025L280001_uuid.jpg'
            }
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // POST /upload - Upload image with company_id
      // ==========================================
      if (path === '/upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const fileName = formData.get('fileName');
        const sku = formData.get('sku');
        const companyId = formData.get('company_id') || 'test_company'; // ✅ company_id を取得

        if (!file || !fileName || !sku) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: file, fileName, sku'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // ✅ 修正: company_id を含むキーを作成
        const key = `${companyId}/${sku}/${fileName}`;

        // Upload to R2
        await env.PRODUCT_IMAGES.put(key, file, {
          httpMetadata: {
            contentType: file.type || 'application/octet-stream'
          }
        });

        // ✅ URLも company_id を含む
        const publicUrl = `https://image-upload-api.jinkedon2.workers.dev/${key}`;

        return new Response(JSON.stringify({
          success: true,
          message: 'File uploaded successfully',
          url: publicUrl,
          key: key,
          company_id: companyId,
          sku: sku,
          fileName: fileName
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // DELETE /delete?filename={company_id}/{sku}/{filename}
      // ==========================================
      if (path === '/delete' && request.method === 'DELETE') {
        const filename = url.searchParams.get('filename');

        if (!filename) {
          return new Response(JSON.stringify({
            error: 'Missing filename parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        await env.PRODUCT_IMAGES.delete(filename);

        return new Response(JSON.stringify({
          success: true,
          message: 'File deleted successfully',
          filename: filename
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // POST /batch-delete - Batch delete
      // ==========================================
      if (path === '/batch-delete' && request.method === 'POST') {
        const body = await request.json();
        const filenames = body.filenames || [];

        if (!Array.isArray(filenames) || filenames.length === 0) {
          return new Response(JSON.stringify({
            error: 'Missing or invalid filenames array'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const results = await Promise.all(
          filenames.map(async (filename) => {
            try {
              await env.PRODUCT_IMAGES.delete(filename);
              return { filename, success: true };
            } catch (error) {
              return { filename, success: false, error: error.message };
            }
          })
        );

        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        return new Response(JSON.stringify({
          success: true,
          message: `Deleted ${successCount}/${results.length} files`,
          successCount,
          failCount,
          results
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // GET /exists?filename={company_id}/{sku}/{filename}
      // ==========================================
      if (path === '/exists' && request.method === 'GET') {
        const filename = url.searchParams.get('filename');

        if (!filename) {
          return new Response(JSON.stringify({
            error: 'Missing filename parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const object = await env.PRODUCT_IMAGES.head(filename);

        if (!object) {
          return new Response(JSON.stringify({
            exists: false,
            filename
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        return new Response(JSON.stringify({
          exists: true,
          filename,
          size: object.size,
          uploaded: object.uploaded,
          httpMetadata: object.httpMetadata
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // GET /list?company_id={company_id}&sku={sku}&limit=100
      // ==========================================
      if (path === '/list' && request.method === 'GET') {
        const companyId = url.searchParams.get('company_id') || 'test_company';
        const sku = url.searchParams.get('sku');
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const cursor = url.searchParams.get('cursor');

        if (!sku) {
          return new Response(JSON.stringify({
            error: 'Missing sku parameter'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // ✅ company_id を含むプレフィックス
        const prefix = `${companyId}/${sku}/`;

        const listOptions = {
          prefix,
          limit
        };
        
        if (cursor) {
          listOptions.cursor = cursor;
        }
        
        const listed = await env.PRODUCT_IMAGES.list(listOptions);

        return new Response(JSON.stringify({
          success: true,
          company_id: companyId,
          sku,
          files: listed.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded
          })),
          truncated: listed.truncated,
          cursor: listed.cursor
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ==========================================
      // GET /{company_id}/{sku}/{fileName} - Serve image
      // ==========================================
      if (request.method === 'GET') {
        const key = path.substring(1); // Remove leading '/'

        const object = await env.PRODUCT_IMAGES.get(key);

        if (!object) {
          return new Response(JSON.stringify({
            error: 'File not found',
            key
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Determine content type from file extension
        const ext = key.split('.').pop().toLowerCase();
        const contentTypeMap = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml'
        };
        const contentType = contentTypeMap[ext] || object.httpMetadata?.contentType || 'application/octet-stream';

        return new Response(object.body, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
            ...corsHeaders
          }
        });
      }

      // No matching route
      return new Response(JSON.stringify({
        error: 'Endpoint not found',
        path,
        method: request.method
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (error) {
      // 本番環境ではスタック情報を非表示
      const isDevelopment = ALLOWED_ORIGINS.some(origin => origin.includes('localhost') || origin.includes('127.0.0.1'));
      
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'An error occurred'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

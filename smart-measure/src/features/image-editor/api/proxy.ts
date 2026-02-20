/**
 * Image Proxy API
 *
 * GET /api/image-proxy/:sku/:filename  R2画像をバイナリで直接返す（<img>タグ用）
 * GET /api/images/proxy                汎用プロキシ（CORS回避・マスクエディタ用）
 */
import { Hono } from 'hono'
import type { R2ObjectBody } from '@cloudflare/workers-types'
import type { AppEnv } from '../../../types/bindings'
import { createSafeErrorResponse, ErrorCode, logError } from '../../../shared/helpers/error-handler'
import { logger } from '../../../shared/helpers/logger'

const proxy = new Hono<AppEnv>()

proxy.get('/api/image-proxy/:sku/:filename', async (c) => {
    try {
        const { sku, filename } = c.req.param();

        logger.debug('🖼️ Image proxy request - SKU:', sku, 'Filename:', filename);

        // バリデーション
        if (!/^[A-Za-z0-9_]+$/.test(sku)) {
            return c.json({ error: 'Invalid SKU format' }, 400);
        }
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return c.json({ error: 'Invalid filename' }, 400);
        }
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        if (!allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
            return c.json({ error: 'Unsupported file type' }, 400);
        }
        if (filename.length > 255) {
            return c.json({ error: 'Filename too long' }, 400);
        }

        let r2Object: R2ObjectBody | null = null;

        // 認証済みユーザーがいれば自社のみ、なければDBから会社IDを解決
        const user = c.get('user') as { companyId?: string } | undefined;
        const userCompanyId = user?.companyId;
        let companyIdFromDb: string | null = null;

        if (userCompanyId) {
            logger.debug('👤 Authenticated user - company_id:', userCompanyId);
            try {
                const dbResult = await c.env.DB.prepare(`
                    SELECT company_id FROM product_items
                    WHERE sku = ? AND company_id = ?
                    LIMIT 1
                `).bind(sku, userCompanyId).first();

                if (!dbResult) {
                    logger.warn('❌ SKU not found in user company:', { sku, userCompanyId });
                    return c.json({ error: 'Image not found in your company' }, 404);
                }
                companyIdFromDb = dbResult.company_id as string;
                logger.debug('✅ SKU verified for user company:', companyIdFromDb);
            } catch (error) {
                logger.error('❌ DB query failed:', error);
                return c.json({ error: 'Database error' }, 500);
            }
        } else {
            logger.debug('🔓 Unauthenticated request - querying DB by SKU:', sku);
            try {
                const dbResult = await c.env.DB.prepare(`
                    SELECT company_id FROM product_items
                    WHERE sku = ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                `).bind(sku).first();

                if (!dbResult || !dbResult.company_id) {
                    logger.warn('❌ SKU not found in DB:', sku);
                    return c.json({ error: 'Image not found' }, 404);
                }
                companyIdFromDb = dbResult.company_id as string;
                logger.debug('📊 Found company_id from DB:', companyIdFromDb);
            } catch (error) {
                logger.error('❌ DB query failed:', error);
                return c.json({ error: 'Database error' }, 500);
            }
        }

        const companyIds = userCompanyId ? [userCompanyId] : [companyIdFromDb!];

        for (const tryCompanyId of companyIds) {
            const key = `${tryCompanyId}/${sku}/${filename}`;
            logger.debug('🔍 Trying R2 key:', key);
            r2Object = await c.env.PRODUCT_IMAGES.get(key);
            if (r2Object) {
                logger.debug('✅ Image found at:', key);
                break;
            }
        }

        if (!r2Object) {
            logger.debug('❌ Image not found in any company folder:', companyIds);
            return c.notFound();
        }

        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const contentTypeMap: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif'
        };
        const contentType = contentTypeMap[ext] || 'application/octet-stream';

        logger.debug(' Image found - Size:', r2Object.size, 'Type:', contentType);

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
        logError('Image proxy', error, {});
        return c.json(createSafeErrorResponse(error, ErrorCode.RESOURCE_NOT_FOUND), 500);
    }
});

// --- 汎用プロキシ（CORS回避用・マスクエディタから利用）---
proxy.get('/api/images/proxy', async (c) => {
    try {
        const targetUrl = c.req.query('url');
        if (!targetUrl) {
            return c.json({ error: 'url parameter required' }, 400);
        }

        const allowedHosts = [
            'pub-300562464768499b8fcaee903d0f9861.r2.dev',
            'image-upload-api.jinkedon2.workers.dev',
            'r2.dev'
        ];
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(targetUrl);
        } catch {
            return c.json({ error: 'Invalid URL' }, 400);
        }

        if (!allowedHosts.some(host => parsedUrl.hostname.endsWith(host))) {
            logger.warn('🚫 Proxy blocked for host:', parsedUrl.hostname);
            return c.json({ error: 'Host not allowed' }, 403);
        }

        logger.debug('🔀 Image proxy:', targetUrl);

        const response = await fetch(targetUrl);
        if (!response.ok) {
            return c.json({ error: 'Upstream fetch failed', status: response.status }, 502);
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const body = await response.arrayBuffer();

        return new Response(body, {
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            }
        });

    } catch (error: any) {
        logError('Image proxy URL', error, {});
        return c.json({ error: 'Proxy error' }, 500);
    }
});

export default proxy

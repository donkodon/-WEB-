/**
 * Billing API - Usage tracking and reporting
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../../types/bindings';
import { requireFirebaseAuth } from '../../auth/middleware/auth';
import { trackBulkSKUDownload, getCurrentUsageSummary } from '../middleware/billing';
import { logError, createSafeErrorResponse, ErrorCode } from '../../../shared/helpers/error-handler';

const billing = new Hono<AppEnv>();

// Apply Firebase authentication to all billing endpoints
billing.use('*', requireFirebaseAuth)

/**
 * POST /api/billing/track-download
 * Track product data download with billing
 * 
 * Request body:
 * {
 *   skus: ['SKU001', 'SKU002', ...],
 *   imageIds: [1, 2, 3, ...]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   billing: {
 *     chargedCount: 5,
 *     freeCount: 3,
 *     totalCount: 8
 *   }
 * }
 */
billing.post(
  '/api/billing/track-download',
  trackBulkSKUDownload,
  async (c) => {
    try {
      // Get billing result from middleware
      const billingResult = c.get('billingResult') as {
        chargedCount: number;
        freeCount: number;
        totalCount: number;
      } | undefined;

      return c.json({
        success: true,
        billing: billingResult || {
          chargedCount: 0,
          freeCount: 0,
          totalCount: 0,
        },
        message: 'Download tracked successfully',
      });
    } catch (error: any) {
      logError('Track download billing', error);
      return c.json(createSafeErrorResponse(error, ErrorCode.DB_ERROR), 500);
    }
  }
);

/**
 * GET /api/billing/usage
 * Get current month usage summary
 * 
 * Response:
 * {
 *   success: true,
 *   usage: {
 *     billing_month: '2026-02',
 *     sku_download_count: 285,
 *     ai_generation_count: 156,
 *     sku_download_amount: 19250,
 *     ai_generation_amount: 12800,
 *     total_amount: 32050,
 *     is_free_account: false
 *   }
 * }
 */
billing.get('/api/billing/usage', async (c) => {
  try {
    const user = c.get('user') as { company_id: string; id: number };
    const usage = await getCurrentUsageSummary(c.env.DB, user.company_id);

    return c.json({
      success: true,
      usage,
    });
  } catch (error: any) {
    logError('Get usage summary', error);
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
  }
});

/**
 * GET /api/billing/usage/breakdown
 * Get detailed usage breakdown by tier (松/竹/梅)
 * 
 * Response:
 * {
 *   success: true,
 *   breakdown: {
 *     sku_download: [
 *       { tier_name: '松', count: 100, unit_price: 100, subtotal: 10000 },
 *       { tier_name: '竹', count: 185, unit_price: 50, subtotal: 9250 }
 *     ],
 *     ai_generation: [...]
 *   }
 * }
 */
billing.get('/api/billing/usage/breakdown', async (c) => {
  try {
    const user = c.get('user') as { company_id: string; id: number };
    const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Get SKU download breakdown
    const skuBreakdown = await c.env.DB
      .prepare(
        `SELECT 
           tier_name,
           COUNT(*) as count,
           unit_price,
           SUM(unit_price) as subtotal
         FROM usage_logs
         WHERE company_id = ?
           AND action_type = 'sku_download'
           AND billing_month = ?
           AND is_charged = 1
         GROUP BY tier_name, unit_price
         ORDER BY unit_price DESC`
      )
      .bind(user.company_id, billingMonth)
      .all();

    // Get AI generation breakdown
    const aiBreakdown = await c.env.DB
      .prepare(
        `SELECT 
           tier_name,
           COUNT(*) as count,
           unit_price,
           SUM(unit_price) as subtotal
         FROM usage_logs
         WHERE company_id = ?
           AND action_type = 'ai_generation'
           AND billing_month = ?
           AND is_charged = 1
         GROUP BY tier_name, unit_price
         ORDER BY unit_price DESC`
      )
      .bind(user.company_id, billingMonth)
      .all();

    return c.json({
      success: true,
      breakdown: {
        sku_download: skuBreakdown.results,
        ai_generation: aiBreakdown.results,
      },
    });
  } catch (error: any) {
    logError('Get usage breakdown', error);
    return c.json(createSafeErrorResponse(error, ErrorCode.DB_QUERY_FAILED), 500);
  }
});

export default billing;

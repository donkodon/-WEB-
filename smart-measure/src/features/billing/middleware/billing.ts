/**
 * Billing Middleware - Track usage and enforce duplicate download rules
 */

import { Context, Next } from 'hono';
import { logger } from '../../../shared/helpers/logger';
import { Bindings } from '../../../types/bindings';
import { logUsage, getCurrentBillingMonth } from '../lib/billing-calculator';

/**
 * Track SKU download usage (single SKU)
 * 
 * Rules:
 * - Only charges once per SKU per month
 * - Duplicate downloads within the same month are free
 * - Records in usage_logs and sku_download_tracking tables
 * 
 * Usage:
 * app.get('/api/products/download/:sku', trackSKUDownload, async (c) => {...})
 */
export async function trackSKUDownload(c: Context<{ Bindings: Bindings }>, next: Next) {
  const sku = c.req.param('sku');
  
  if (!sku) {
    return c.json({ error: 'SKU is required' }, 400);
  }

  // Get company_id from authenticated user context
  const user = c.get('user') as { company_id: string; id: number } | undefined;
  
  if (!user || !user.company_id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const { company_id, id: userId } = user;
  const billingMonth = getCurrentBillingMonth();

  try {
    // Check if this SKU was already downloaded this month
    const existingDownload = await c.env.DB
      .prepare(
        `SELECT * FROM sku_download_tracking 
         WHERE company_id = ? 
           AND sku = ? 
           AND billing_month = ?`
      )
      .bind(company_id, sku, billingMonth)
      .first<{ id: number; download_count: number }>();

    if (existingDownload) {
      // Duplicate download - increment count but don't charge
      await c.env.DB
        .prepare(
          `UPDATE sku_download_tracking 
           SET download_count = download_count + 1 
           WHERE id = ?`
        )
        .bind(existingDownload.id)
        .run();

      logger.info(`ℹ️ Duplicate SKU download (no charge): ${sku} [${company_id}] - Already downloaded ${existingDownload.download_count} time(s) this month`);
      
      // Continue to next handler (allow download)
      await next();
      return;
    }

    // First download this month - log usage
    await logUsage(c.env.DB, company_id, userId, 'sku_download', sku);

    // Record in tracking table
    await c.env.DB
      .prepare(
        `INSERT INTO sku_download_tracking (company_id, sku, billing_month, download_count)
         VALUES (?, ?, ?, 1)`
      )
      .bind(company_id, sku, billingMonth)
      .run();

    logger.info(`✅ SKU download tracked: ${sku} [${company_id}]`);
    
    // Continue to next handler
    await next();
  } catch (error) {
    logger.error('❌ Error tracking SKU download:', error instanceof Error ? error.message : String(error));
    // Don't block the download on billing errors
    await next();
  }
}

/**
 * Track bulk SKU downloads (multiple SKUs at once)
 * 
 * Usage:
 * app.post('/api/products/download', trackBulkSKUDownload, async (c) => {...})
 * 
 * Request body: { skus: ['SKU001', 'SKU002', ...] }
 */
export async function trackBulkSKUDownload(c: Context<{ Bindings: Bindings }>, next: Next) {
  // Get company_id from authenticated user context
  const user = c.get('user') as { company_id: string; id: number } | undefined;
  
  if (!user || !user.company_id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const { company_id, id: userId } = user;
  const billingMonth = getCurrentBillingMonth();

  try {
    // Get SKUs from request body
    const body = await c.req.json();
    const skus = body.skus as string[];

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return c.json({ error: 'SKUs array is required' }, 400);
    }

    logger.info(`📦 Tracking bulk download: ${skus.length} SKUs [${company_id}]`);

    let chargedCount = 0;
    let freeCount = 0;

    // Process each SKU
    for (const sku of skus) {
      // Check if this SKU was already downloaded this month
      const existingDownload = await c.env.DB
        .prepare(
          `SELECT * FROM sku_download_tracking 
           WHERE company_id = ? 
             AND sku = ? 
             AND billing_month = ?`
        )
        .bind(company_id, sku, billingMonth)
        .first<{ id: number; download_count: number }>();

      if (existingDownload) {
        // Duplicate download - increment count but don't charge
        await c.env.DB
          .prepare(
            `UPDATE sku_download_tracking 
             SET download_count = download_count + 1 
             WHERE id = ?`
          )
          .bind(existingDownload.id)
          .run();

        freeCount++;
        logger.info(`  ℹ️ Duplicate: ${sku} (no charge)`);
      } else {
        // First download this month - log usage
        await logUsage(c.env.DB, company_id, userId, 'sku_download', sku);

        // Record in tracking table
        await c.env.DB
          .prepare(
            `INSERT INTO sku_download_tracking (company_id, sku, billing_month, download_count)
             VALUES (?, ?, ?, 1)`
          )
          .bind(company_id, sku, billingMonth)
          .run();

        chargedCount++;
        logger.info(`  ✅ Charged: ${sku}`);
      }
    }

    logger.info(`📊 Bulk download summary: ${chargedCount} charged, ${freeCount} free [${company_id}]`);
    
    // Store summary in context for response
    c.set('billingResult', {
      chargedCount,
      freeCount,
      totalCount: skus.length,
    });

    // Continue to next handler
    await next();
  } catch (error) {
    logger.error('❌ Error tracking bulk SKU download:', error instanceof Error ? error.message : String(error));
    // Don't block the download on billing errors
    await next();
  }
}

/**
 * Track AI image generation usage
 * 
 * Rules:
 * - Charges for every generation (no deduplication)
 * - Records in usage_logs table
 * 
 * Usage:
 * app.post('/api/ai-generate/:sku', trackAIGeneration, async (c) => {...})
 */
export async function trackAIGeneration(c: Context<{ Bindings: Bindings }>, next: Next) {
  const sku = c.req.param('sku');
  
  if (!sku) {
    return c.json({ error: 'SKU is required' }, 400);
  }

  // Get company_id from authenticated user context
  const user = c.get('user') as { company_id: string; id: number } | undefined;
  
  if (!user || !user.company_id) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const { company_id, id: userId } = user;

  try {
    // Check if already generated (one-time limit)
    const existingGeneration = await c.env.DB
      .prepare(
        `SELECT generated_image_url FROM product_items 
         WHERE sku = ? AND company_id = ?`
      )
      .bind(sku, company_id)
      .first<{ generated_image_url: string | null }>();

    if (existingGeneration?.generated_image_url) {
      // Already generated - return 409 Conflict
      return c.json(
        { 
          error: 'AI image already generated for this SKU',
          message: 'AI画像は既に生成済みです。再生成はできません。'
        }, 
        409
      );
    }

    // Log usage BEFORE generation (ensures billing even if generation fails)
    await logUsage(c.env.DB, company_id, userId, 'ai_generation', sku);

    logger.info(`✅ AI generation tracked: ${sku} [${company_id}]`);
    
    // Continue to generation handler
    await next();
  } catch (error) {
    logger.error('❌ Error tracking AI generation:', error instanceof Error ? error.message : String(error));
    return c.json({ error: 'Failed to track usage' }, 500);
  }
}

/**
 * Get current month usage summary
 * Used for dashboard display
 */
export async function getCurrentUsageSummary(
  db: any,
  companyId: string
): Promise<{
  billing_month: string;
  sku_download_count: number;
  ai_generation_count: number;
  sku_download_amount: number;
  ai_generation_amount: number;
  total_amount: number;
  is_free_account: boolean;
}> {
  const billingMonth = getCurrentBillingMonth();

  // Check account type
  const accountPlan = await db
    .prepare(
      `SELECT plan_type FROM account_plans 
       WHERE company_id = ? AND status = 'active'`
    )
    .bind(companyId)
    .first<{ plan_type: string }>();

  const isFree = accountPlan?.plan_type === 'free';

  // Aggregate usage
  const skuResult = await db
    .prepare(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(unit_price), 0) as amount
       FROM usage_logs
       WHERE company_id = ?
         AND action_type = 'sku_download'
         AND billing_month = ?
         AND is_charged = 1`
    )
    .bind(companyId, billingMonth)
    .first<{ count: number; amount: number }>();

  const aiResult = await db
    .prepare(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(unit_price), 0) as amount
       FROM usage_logs
       WHERE company_id = ?
         AND action_type = 'ai_generation'
         AND billing_month = ?
         AND is_charged = 1`
    )
    .bind(companyId, billingMonth)
    .first<{ count: number; amount: number }>();

  return {
    billing_month: billingMonth,
    sku_download_count: skuResult?.count || 0,
    ai_generation_count: aiResult?.count || 0,
    sku_download_amount: skuResult?.amount || 0,
    ai_generation_amount: aiResult?.amount || 0,
    total_amount: (skuResult?.amount || 0) + (aiResult?.amount || 0),
    is_free_account: isFree,
  };
}

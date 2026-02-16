/**
 * Billing Calculator - Usage-based pricing logic
 * 
 * Pricing Structure:
 * - 松プラン (0-100件): ¥100/件
 * - 竹プラン (101-500件): ¥50/件
 * - 梅プラン (501件以上): ¥25/件
 * 
 * Example:
 * - 285 SKU downloads = 0-100 ×¥100 + 101-285 ×¥50 = ¥10,000 + ¥9,250 = ¥19,250
 */

import { D1Database } from '@cloudflare/workers-types';

export interface PricingTier {
  id: number;
  action_type: string;
  tier_name: string; // 松, 竹, 梅
  min_quantity: number;
  max_quantity: number | null;
  unit_price: number;
}

export interface PriceCalculation {
  tier_name: string;
  unit_price: number;
  quantity: number; // Current count (1-based for new action)
}

export interface UsageLog {
  id: number;
  company_id: string;
  user_id: number | null;
  action_type: string;
  resource_id: string | null;
  unit_price: number;
  tier_name: string;
  billing_month: string;
  is_charged: number;
  billed: number;
  created_at: string;
}

/**
 * Get current billing month in YYYY-MM format
 */
export function getCurrentBillingMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Fetch pricing tiers for a specific action type
 * Returns tiers ordered by min_quantity (松 → 竹 → 梅)
 */
export async function getPricingTiers(
  db: D1Database,
  actionType: string
): Promise<PricingTier[]> {
  const result = await db
    .prepare(
      `SELECT * FROM pricing_tiers 
       WHERE action_type = ? 
       ORDER BY min_quantity ASC`
    )
    .bind(actionType)
    .all<PricingTier>();

  if (!result.success) {
    throw new Error(`Failed to fetch pricing tiers for ${actionType}`);
  }

  return result.results;
}

/**
 * Get current usage count for a company in the billing month
 * Does NOT include the current action (to be added)
 */
export async function getCurrentUsageCount(
  db: D1Database,
  companyId: string,
  actionType: string,
  billingMonth: string
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM usage_logs 
       WHERE company_id = ? 
         AND action_type = ? 
         AND billing_month = ?
         AND is_charged = 1`
    )
    .bind(companyId, actionType, billingMonth)
    .first<{ count: number }>();

  return result?.count || 0;
}

/**
 * Calculate price for the NEXT action based on current cumulative count
 * 
 * @param currentCount - Number of actions already completed this month
 * @param tiers - Pricing tiers (ordered by min_quantity)
 * @returns Price calculation with tier name and unit price
 * 
 * Example:
 * - currentCount = 99 → next action is #100 → 松プラン ¥100
 * - currentCount = 100 → next action is #101 → 竹プラン ¥50
 * - currentCount = 500 → next action is #501 → 梅プラン ¥25
 */
export function calculatePrice(
  currentCount: number,
  tiers: PricingTier[]
): PriceCalculation {
  const nextCount = currentCount + 1; // This will be the count AFTER the action

  // Find the appropriate tier for the next action
  for (const tier of tiers) {
    const isInRange =
      nextCount >= tier.min_quantity &&
      (tier.max_quantity === null || nextCount <= tier.max_quantity);

    if (isInRange) {
      return {
        tier_name: tier.tier_name,
        unit_price: tier.unit_price,
        quantity: nextCount,
      };
    }
  }

  // Fallback to the most expensive tier (should never happen)
  const defaultTier = tiers[0];
  return {
    tier_name: defaultTier.tier_name,
    unit_price: defaultTier.unit_price,
    quantity: nextCount,
  };
}

/**
 * Check if a company has a free account (無料テストプラン)
 */
export async function isFreeAccount(
  db: D1Database,
  companyId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT plan_type FROM account_plans 
       WHERE company_id = ? 
         AND status = 'active'`
    )
    .bind(companyId)
    .first<{ plan_type: string }>();

  return result?.plan_type === 'free';
}

/**
 * Log a usage action with calculated price
 * 
 * @param db - D1 Database instance
 * @param companyId - Company ID
 * @param userId - User ID (from Firebase auth)
 * @param actionType - 'sku_download' or 'ai_generation'
 * @param resourceId - SKU code or image ID
 * @returns The logged usage record
 */
export async function logUsage(
  db: D1Database,
  companyId: string,
  userId: number | null,
  actionType: string,
  resourceId: string | null = null
): Promise<UsageLog> {
  const billingMonth = getCurrentBillingMonth();

  // Check if this is a free account
  const isFree = await isFreeAccount(db, companyId);

  // Get current usage count (excludes current action)
  const currentCount = await getCurrentUsageCount(db, companyId, actionType, billingMonth);

  // Get pricing tiers
  const tiers = await getPricingTiers(db, actionType);

  // Calculate price for this action
  const priceCalc = calculatePrice(currentCount, tiers);

  // Insert usage log
  const result = await db
    .prepare(
      `INSERT INTO usage_logs 
       (company_id, user_id, action_type, resource_id, unit_price, tier_name, billing_month, is_charged, billed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       RETURNING *`
    )
    .bind(
      companyId,
      userId,
      actionType,
      resourceId,
      isFree ? 0 : priceCalc.unit_price, // Free accounts pay ¥0
      priceCalc.tier_name,
      billingMonth,
      isFree ? 0 : 1 // is_charged: 0 for free, 1 for paid
    )
    .first<UsageLog>();

  if (!result) {
    throw new Error('Failed to log usage');
  }

  console.log(`✅ Usage logged: ${actionType} - ¥${result.unit_price} (${result.tier_name}プラン) [${isFree ? '無料' : '課金'}]`);

  return result;
}

/**
 * Calculate total monthly bill breakdown
 * Returns aggregated amounts by action type
 */
export async function calculateMonthlyBill(
  db: D1Database,
  companyId: string,
  billingMonth: string
): Promise<{
  sku_download_count: number;
  sku_download_amount: number;
  ai_generation_count: number;
  ai_generation_amount: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}> {
  // Aggregate SKU downloads
  const skuResult = await db
    .prepare(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(unit_price), 0) as amount
       FROM usage_logs
       WHERE company_id = ?
         AND action_type = 'sku_download'
         AND billing_month = ?
         AND is_charged = 1
         AND billed = 0`
    )
    .bind(companyId, billingMonth)
    .first<{ count: number; amount: number }>();

  // Aggregate AI generation
  const aiResult = await db
    .prepare(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(unit_price), 0) as amount
       FROM usage_logs
       WHERE company_id = ?
         AND action_type = 'ai_generation'
         AND billing_month = ?
         AND is_charged = 1
         AND billed = 0`
    )
    .bind(companyId, billingMonth)
    .first<{ count: number; amount: number }>();

  const skuCount = skuResult?.count || 0;
  const skuAmount = skuResult?.amount || 0;
  const aiCount = aiResult?.count || 0;
  const aiAmount = aiResult?.amount || 0;

  const subtotal = skuAmount + aiAmount;
  const taxAmount = Math.round(subtotal * 0.1); // 10% consumption tax
  const totalAmount = subtotal + taxAmount;

  return {
    sku_download_count: skuCount,
    sku_download_amount: skuAmount,
    ai_generation_count: aiCount,
    ai_generation_amount: aiAmount,
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
  };
}

-- Billing Infrastructure Migration
-- Created: 2026-02-14
-- Purpose: Implement usage-based billing system

-- ============================================
-- 1. Account Plans Table
-- ============================================
-- Tracks which plan each company is on (free/paid)
CREATE TABLE IF NOT EXISTS account_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL UNIQUE,
  plan_type TEXT NOT NULL DEFAULT 'free', -- 'free' or 'paid'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  trial_end_date TEXT, -- ISO 8601 format: 2026-03-14T00:00:00Z
  stripe_customer_id TEXT, -- Stripe Customer ID (for Phase 4)
  stripe_subscription_id TEXT, -- Stripe Subscription ID (for Phase 4)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_plans_company_id ON account_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_account_plans_status ON account_plans(status);

-- ============================================
-- 2. Pricing Tiers Table
-- ============================================
-- Defines tiered pricing (松¥100, 竹¥50, 梅¥25)
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL, -- 'sku_download' or 'ai_generation'
  tier_name TEXT NOT NULL, -- '松', '竹', '梅'
  min_quantity INTEGER NOT NULL, -- Minimum count for this tier
  max_quantity INTEGER, -- Maximum count (NULL for unlimited)
  unit_price REAL NOT NULL, -- Price per unit in JPY
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_action_type ON pricing_tiers(action_type);

-- Insert initial pricing tiers for SKU downloads
INSERT INTO pricing_tiers (action_type, tier_name, min_quantity, max_quantity, unit_price) VALUES
  ('sku_download', '松', 0, 100, 100.0),
  ('sku_download', '竹', 101, 500, 50.0),
  ('sku_download', '梅', 501, NULL, 25.0);

-- Insert initial pricing tiers for AI generation (same pricing structure)
INSERT INTO pricing_tiers (action_type, tier_name, min_quantity, max_quantity, unit_price) VALUES
  ('ai_generation', '松', 0, 100, 100.0),
  ('ai_generation', '竹', 101, 500, 50.0),
  ('ai_generation', '梅', 501, NULL, 25.0);

-- ============================================
-- 3. Usage Logs Table
-- ============================================
-- Records every billable action with calculated price
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL,
  user_id INTEGER, -- Reference to users table
  action_type TEXT NOT NULL, -- 'sku_download' or 'ai_generation'
  resource_id TEXT, -- SKU code for downloads, image ID for AI
  unit_price REAL NOT NULL, -- Price charged for this action
  tier_name TEXT NOT NULL, -- Which tier was applied (松/竹/梅)
  billing_month TEXT NOT NULL, -- Format: 2026-02 (for monthly aggregation)
  is_charged INTEGER NOT NULL DEFAULT 1, -- 0=free account, 1=charged
  billed INTEGER DEFAULT 0, -- 0=not yet invoiced, 1=invoiced
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_company_id ON usage_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_billing_month ON usage_logs(billing_month);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_billed ON usage_logs(billed);

-- ============================================
-- 4. SKU Download Tracking Table
-- ============================================
-- Prevents duplicate charges for same SKU in same month
CREATE TABLE IF NOT EXISTS sku_download_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  billing_month TEXT NOT NULL, -- Format: 2026-02
  first_downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  download_count INTEGER DEFAULT 1,
  UNIQUE(company_id, sku, billing_month)
);

CREATE INDEX IF NOT EXISTS idx_sku_tracking_company_month ON sku_download_tracking(company_id, billing_month);

-- ============================================
-- 5. Monthly Invoices Table
-- ============================================
-- Aggregated monthly billing summary
CREATE TABLE IF NOT EXISTS monthly_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL,
  billing_month TEXT NOT NULL, -- Format: 2026-02
  sku_download_count INTEGER DEFAULT 0,
  sku_download_amount REAL DEFAULT 0, -- Subtotal for SKU downloads
  ai_generation_count INTEGER DEFAULT 0,
  ai_generation_amount REAL DEFAULT 0, -- Subtotal for AI generation
  subtotal REAL DEFAULT 0, -- Total before tax
  tax_amount REAL DEFAULT 0, -- 10% consumption tax
  total_amount REAL DEFAULT 0, -- Final amount (subtotal + tax)
  status TEXT DEFAULT 'draft', -- 'draft', 'pending', 'paid', 'failed'
  stripe_invoice_id TEXT, -- Stripe Invoice ID (for Phase 4)
  invoice_url TEXT, -- URL to Stripe invoice (for Phase 4)
  due_date TEXT, -- ISO 8601 format
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, billing_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_invoices_company_id ON monthly_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_billing_month ON monthly_invoices(billing_month);
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_status ON monthly_invoices(status);

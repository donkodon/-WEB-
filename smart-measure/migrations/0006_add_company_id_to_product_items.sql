-- Migration: Add company_id to product_items
-- Date: 2026-02-08
-- Description: Add company_id column to product_items for company-level data isolation

-- Add company_id column (nullable initially)
ALTER TABLE product_items ADD COLUMN company_id TEXT;

-- Update existing records to use test_company
UPDATE product_items SET company_id = 'test_company' WHERE company_id IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_product_items_company_id ON product_items(company_id);

-- Note: Foreign key constraint with product_master will be enforced at application level

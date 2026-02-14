-- Migration: Add updated_at column to product_items
-- Description: Track when product items are last updated
-- Date: 2026-02-08

ALTER TABLE product_items ADD COLUMN updated_at DATETIME;

-- Create index for updated_at queries
CREATE INDEX IF NOT EXISTS idx_product_items_updated_at ON product_items(updated_at);

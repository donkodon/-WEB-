-- Migration: Add mask_image_url_r2 column for background removal mask
-- Purpose: Separate background removal mask from measurement mask
-- mask_image_url     : Used for measurement mask (from Replicate AI)
-- mask_image_url_r2  : Used for background removal mask (from withoutBG / manual edit)

ALTER TABLE product_items ADD COLUMN mask_image_url_r2 TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_items_mask_url_r2 ON product_items(mask_image_url_r2);

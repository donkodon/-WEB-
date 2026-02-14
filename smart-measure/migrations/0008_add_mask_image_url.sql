-- Add mask_image_url column to product_items table
ALTER TABLE product_items ADD COLUMN mask_image_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_items_mask_url ON product_items(mask_image_url);

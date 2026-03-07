-- Add image adjustment columns to product_items
-- Stores brightness, white balance, and hue adjustment values

ALTER TABLE product_items 
ADD COLUMN brightness INTEGER DEFAULT 0;

ALTER TABLE product_items 
ADD COLUMN white_balance INTEGER DEFAULT 5500;

ALTER TABLE product_items 
ADD COLUMN hue INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_items_brightness ON product_items(brightness);
CREATE INDEX IF NOT EXISTS idx_product_items_white_balance ON product_items(white_balance);
CREATE INDEX IF NOT EXISTS idx_product_items_hue ON product_items(hue);

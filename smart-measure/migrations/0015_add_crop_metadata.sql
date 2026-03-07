-- Migration: Add crop metadata columns to product_items table
-- Date: 2026-03-07
-- Description: Store crop coordinates (cropX, cropY, cropSize) and crop enabled flag

-- Add crop coordinate columns
ALTER TABLE product_items ADD COLUMN crop_x INTEGER DEFAULT NULL;
ALTER TABLE product_items ADD COLUMN crop_y INTEGER DEFAULT NULL;
ALTER TABLE product_items ADD COLUMN crop_size INTEGER DEFAULT NULL;
ALTER TABLE product_items ADD COLUMN crop_enabled BOOLEAN DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_items_crop_enabled ON product_items(crop_enabled);

-- Comments:
-- crop_x: X coordinate of the crop rectangle (top-left corner)
-- crop_y: Y coordinate of the crop rectangle (top-left corner)
-- crop_size: Size of the square crop area (width and height)
-- crop_enabled: Boolean flag indicating if crop is active (0 = no crop, 1 = crop applied)

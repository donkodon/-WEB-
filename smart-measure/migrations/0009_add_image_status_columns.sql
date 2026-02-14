-- Migration: Add image status tracking columns
-- Purpose: Eliminate N+1 problem by storing image processing status in DB
-- Before: 100 images = 200 R2 API calls (check _f.png, then _p.png for each)
-- After: 0 R2 API calls (all status info in DB)

-- Add image_status column to track processing state
-- Values: 'original', 'processed', 'final'
-- 'original': Only original image exists
-- 'processed': White background removed (_p.png exists)
-- 'final': Final edited image (_f.png exists)
ALTER TABLE product_items ADD COLUMN image_status TEXT DEFAULT 'original';

-- Add processed_images JSON column to store which images have been processed
-- Format: ["uuid1", "uuid2", "uuid3"]
-- Stores filenames (without extension) that have _p.png files
ALTER TABLE product_items ADD COLUMN processed_images TEXT DEFAULT '[]';

-- Add final_images JSON column to store which images have been finalized
-- Format: ["uuid1", "uuid2", "uuid3"]
-- Stores filenames (without extension) that have _f.png files
ALTER TABLE product_items ADD COLUMN final_images TEXT DEFAULT '[]';

-- Create index for faster filtering by image_status
CREATE INDEX IF NOT EXISTS idx_product_items_image_status ON product_items(image_status);

-- Migration complete
-- Next steps:
-- 1. Update bg-removal API to set image_status when processing images
-- 2. Update dashboard to read image_status instead of checking R2
-- 3. Run migration: npx wrangler d1 migrations apply measure-master-db --local

-- Migration: Add measurement columns to product_items
-- Description: Add columns for AI-powered auto-measurement data
-- Date: 2026-01-25

-- Add measurement-related columns to product_items
ALTER TABLE product_items ADD COLUMN ai_landmarks TEXT;           -- JSON: AI detected landmarks
ALTER TABLE product_items ADD COLUMN manual_landmarks TEXT;       -- JSON: User adjusted landmarks
ALTER TABLE product_items ADD COLUMN reference_object TEXT;       -- JSON: pixelPerCm and reference info
ALTER TABLE product_items ADD COLUMN measurements TEXT;           -- JSON: Measurement values in cm
ALTER TABLE product_items ADD COLUMN annotated_image_url TEXT;    -- URL: Annotated image with landmarks
ALTER TABLE product_items ADD COLUMN measurement_status TEXT;     -- Status: 'not_measured' | 'auto' | 'manual_adjusted'
ALTER TABLE product_items ADD COLUMN measured_at DATETIME;        -- Timestamp: When measurement was performed
ALTER TABLE product_items ADD COLUMN measurement_category TEXT;   -- Category: garment_class (e.g., 'long sleeve top')

-- Create index for measurement queries
CREATE INDEX IF NOT EXISTS idx_product_items_measurement_status ON product_items(measurement_status);
CREATE INDEX IF NOT EXISTS idx_product_items_measured_at ON product_items(measured_at);

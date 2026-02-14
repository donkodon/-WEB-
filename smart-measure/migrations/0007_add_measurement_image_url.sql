-- Add measurement_image_url column to product_items
ALTER TABLE product_items ADD COLUMN measurement_image_url TEXT;

-- Note: This column stores the annotated measurement image URL from auto-measurement
-- It is separate from annotated_image_url for future flexibility

-- Rename products table to product_master
ALTER TABLE products RENAME TO product_master;

-- Drop old images table (not needed in new schema)
DROP TABLE IF EXISTS images;

-- Create new product_items table (individual items per SKU)
CREATE TABLE IF NOT EXISTS product_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  item_code TEXT UNIQUE NOT NULL,
  image_urls TEXT, -- JSON array of image URLs
  actual_measurements TEXT, -- JSON object with measurements
  condition TEXT, -- 商品状態
  material TEXT, -- 素材
  product_rank TEXT, -- ランク
  inspection_notes TEXT, -- 検品メモ
  photographed_at DATETIME, -- 撮影日時
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sku) REFERENCES product_master(sku)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_items_sku ON product_items(sku);
CREATE INDEX IF NOT EXISTS idx_product_items_item_code ON product_items(item_code);
CREATE INDEX IF NOT EXISTS idx_product_master_sku_renamed ON product_master(sku);

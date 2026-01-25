-- ==========================================
-- Multi-tenant Database Schema
-- This schema is for individual company databases
-- Each company has a dedicated database without company_id column
-- ==========================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product Master table (商品マスター)
CREATE TABLE IF NOT EXISTS product_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  brand_kana TEXT,
  size TEXT,
  color TEXT,
  category_sub TEXT,
  price_cost INTEGER DEFAULT 0,
  season TEXT,
  rank TEXT,
  release_date TEXT,
  buyer TEXT,
  store_name TEXT,
  price_ref INTEGER DEFAULT 0,
  price_sale INTEGER DEFAULT 0,
  price_list INTEGER DEFAULT 0,
  location TEXT,
  stock_quantity INTEGER DEFAULT 0,
  barcode TEXT,
  status TEXT DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Product Items table (個別商品アイテム)
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
  updated_at DATETIME,
  FOREIGN KEY (sku) REFERENCES product_master(sku)
);

-- Images table (legacy - for backward compatibility)
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  original_url TEXT NOT NULL,
  processed_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- ==========================================
-- Indexes for Performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
CREATE INDEX IF NOT EXISTS idx_product_items_sku ON product_items(sku);
CREATE INDEX IF NOT EXISTS idx_product_items_item_code ON product_items(item_code);
CREATE INDEX IF NOT EXISTS idx_images_product_id ON images(product_id);

-- ==========================================
-- Seed Data
-- ==========================================
INSERT OR IGNORE INTO users (email, name) VALUES ('user@example.com', 'Demo User');

INSERT OR IGNORE INTO settings (key, value) VALUES 
('naming_convention', '{SKU}_{DATE}_v1'),
('auto_upload', 'true'),
('auto_remove_bg', 'false'),
('output_format', 'jpg'),
('compression_rate', '85');

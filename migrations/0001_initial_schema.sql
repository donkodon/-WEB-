-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products table (SKU)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Images table
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  original_url TEXT NOT NULL,
  processed_url TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, completed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_images_product_id ON images(product_id);

-- Seed Data (Initial Data matching screenshots)
INSERT OR IGNORE INTO users (email, name) VALUES ('user@example.com', 'Kenji');

INSERT OR IGNORE INTO products (sku, name, category) VALUES 
('TSHIRT-001-WHT', 'ベーシックコットンTシャツ（ホワイト）', 'Tops'),
('DNM-JCKT-NAVY', 'ヴィンテージデニムジャケット（ネイビー）', 'Outerwear'),
('SHIRT-LINEN-BEG', 'リネンシャツ（ベージュ）', 'Tops');

INSERT OR IGNORE INTO settings (key, value) VALUES 
('naming_convention', '{SKU}_{DATE}_v1'),
('auto_upload', 'true'),
('auto_remove_bg', 'false'),
('output_format', 'jpg'),
('compression_rate', '85');

-- Seed Images (Placeholders)
-- We will use placeholder images from the internet or just empty strings if not available
INSERT OR IGNORE INTO images (product_id, original_url, processed_url, status) VALUES 
(1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Front', 'https://placehold.co/400x400/transparent/white?text=T-Shirt+Front+Processed', 'completed'),
(1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Back', NULL, 'pending'),
(1, 'https://placehold.co/400x400/orange/white?text=T-Shirt+Detail', NULL, 'pending'),
(2, 'https://placehold.co/400x400/brown/white?text=Jacket+Front', NULL, 'processing');

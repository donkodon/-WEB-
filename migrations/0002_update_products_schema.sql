-- Add new columns to products table to match CSV data
ALTER TABLE products ADD COLUMN brand TEXT;
ALTER TABLE products ADD COLUMN brand_kana TEXT;
ALTER TABLE products ADD COLUMN size TEXT;
ALTER TABLE products ADD COLUMN color TEXT;
ALTER TABLE products ADD COLUMN category_sub TEXT;
ALTER TABLE products ADD COLUMN price_cost INTEGER; -- 仕入単価
ALTER TABLE products ADD COLUMN season TEXT;
ALTER TABLE products ADD COLUMN rank TEXT; -- 商品ランク
ALTER TABLE products ADD COLUMN release_date TEXT;
ALTER TABLE products ADD COLUMN buyer TEXT; -- バイヤー
ALTER TABLE products ADD COLUMN store_name TEXT; -- 店舗名
ALTER TABLE products ADD COLUMN price_ref INTEGER; -- 参考上代
ALTER TABLE products ADD COLUMN price_sale INTEGER; -- 販売価格
ALTER TABLE products ADD COLUMN price_list INTEGER; -- 出品価格
ALTER TABLE products ADD COLUMN location TEXT; -- 保管場所
ALTER TABLE products ADD COLUMN stock_quantity INTEGER; -- 在数
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN status TEXT;

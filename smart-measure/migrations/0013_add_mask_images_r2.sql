-- Migration: mask_images_r2カラム追加
-- 背景削除マスクをSKU内複数画像分JSON配列で管理する
-- 旧: mask_image_url_r2 (TEXT, 単一URL) → 複数枚背景削除で上書きされる問題があった
-- 新: mask_images_r2 (TEXT, JSON配列) → 例: [{"filename":"front","url":"https://..."},...]

ALTER TABLE product_items ADD COLUMN mask_images_r2 TEXT DEFAULT '[]';

-- 既存データの移行: mask_image_url_r2 に値があれば mask_images_r2 に変換
-- ※ filenamePart が不明なので filename="unknown" として移行
UPDATE product_items
SET mask_images_r2 = json_array(json_object('filename', 'unknown', 'url', mask_image_url_r2))
WHERE mask_image_url_r2 IS NOT NULL;

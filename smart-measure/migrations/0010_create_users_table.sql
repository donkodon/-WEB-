-- Add Firebase Authentication columns to existing users table
-- Migration: 0010_create_users_table.sql
-- Date: 2026-02-14

-- Add new columns for Firebase authentication (without UNIQUE constraint in ALTER)
ALTER TABLE users ADD COLUMN firebase_uid TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'staff';
ALTER TABLE users ADD COLUMN company_id TEXT DEFAULT 'test_company';
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN metadata TEXT;

-- Indexes for performance (unique index for firebase_uid)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Set display_name for existing users (copy from name column)
UPDATE users SET display_name = name WHERE display_name IS NULL;

-- Initial admin user (Firebase UID will be updated on first login)
-- Password should be set in Firebase Console
INSERT OR IGNORE INTO users (firebase_uid, email, name, display_name, role, company_id, is_active) 
VALUES ('PENDING_ADMIN', 'admin@saisunsatsuei.com', '管理者', '管理者', 'admin', 'test_company', 1);

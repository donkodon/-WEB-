#!/bin/bash
# ==========================================
# Migrate company data from shared DB to dedicated DB
# Usage: ./migrate-company-data.sh <company_id>
# Example: ./migrate-company-data.sh test_company
# ==========================================

set -e

COMPANY_ID=${1:-test_company}
SOURCE_DB="measure-master-db"
TARGET_DB="measure-master-${COMPANY_ID}"

echo "🚀 Starting data migration for company: ${COMPANY_ID}"
echo "📊 Source DB: ${SOURCE_DB}"
echo "📊 Target DB: ${TARGET_DB}"

# Step 1: Export data from source DB
echo ""
echo "📤 Step 1: Exporting data from ${SOURCE_DB}..."
npx wrangler d1 execute ${SOURCE_DB} --remote \
  --command="SELECT sku, name, brand, brand_kana, size, color, category, category_sub, price_cost, season, rank, release_date, buyer, store_name, price_ref, price_sale, price_list, location, stock_quantity, barcode, status, created_at, updated_at FROM product_master WHERE company_id = '${COMPANY_ID}';" \
  --json > /tmp/${COMPANY_ID}_export.json

# Count records
RECORD_COUNT=$(cat /tmp/${COMPANY_ID}_export.json | grep -o "\"sku\":" | wc -l)
echo "✅ Exported ${RECORD_COUNT} records for ${COMPANY_ID}"

# Step 2: Generate INSERT statements
echo ""
echo "📝 Step 2: Generating INSERT statements..."

cat > /tmp/${COMPANY_ID}_insert.sql << 'EOF'
-- Migrated data for COMPANY_ID
-- Generated at: $(date)
EOF

# Parse JSON and create INSERT statements (simplified version)
# In production, use a proper JSON parser

echo ""
echo "✅ Migration preparation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review exported data: /tmp/${COMPANY_ID}_export.json"
echo "2. Verify target DB schema: npx wrangler d1 execute ${TARGET_DB} --remote --command=\"PRAGMA table_info(product_master);\""
echo "3. Import data to target DB (manual step required)"
echo ""
echo "💡 To complete migration, use the /api/admin/migrate-company-data endpoint"

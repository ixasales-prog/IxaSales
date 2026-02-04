# 🚀 EASY SETUP: Enhanced Receiving

## Problem
`npm run db:migrate` fails with drizzle-kit conflicts

## ✅ Solution (30 seconds)

### Option 1: Use Database Tool (RECOMMENDED)

1. Open your database tool (pgAdmin, DBeaver, TablePlus, etc.)
2. Connect to database: `ixasales_dev`
3. Open file: `QUICK_MIGRATION.sql`
4. **Copy all contents**
5. **Paste and run** in your database tool
6. ✅ **Done!** Enhanced Receiving now works!

### Option 2: Command Line (if you have psql)

```powershell
# Windows
$env:PGPASSWORD="your_password_here"
psql -h localhost -U postgres -d ixasales_dev -f QUICK_MIGRATION.sql
```

---

## What This Does

Adds 2 columns to `purchase_order_items` table:
- `last_scanned_at` - Timestamp of last scan
- `scanned_by_user_id` - Who scanned it

That's ALL you need for Enhanced Receiving to work! 🎉

---

## After Running Migration

1. **Restart backend** (if running):
   ```
   Ctrl+C in npm run dev terminal
   npm run dev
   ```

2. **Test Enhanced Receiving:**
   - Navigate to Warehouse → Receiving
   - Click any PO
   - Click green scan button
   - Scan product barcode
   - Watch quantity increment! ✨

---

## Don't Want to Run Migration Yet?

**You can still test:**
- ✅ Inventory scanner (works now!)
- ✅ Receiving PO lookup (works now!)
- ✅ Sales catalog scanner (works now!)

Just the **quantity increment** feature needs the migration.

---

**Questions?** The SQL is safe, idempotent, and takes 1 second to run! 🚀

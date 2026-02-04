-- =============================================================================
-- QUICK MIGRATION: Enhanced Receiving Barcode Workflow
-- =============================================================================
-- Just copy this entire file and run it in your database tool (pgAdmin, DBeaver, etc.)
-- This is all you need to enable Enhanced Receiving!

-- Step 1: Add columns to purchase_order_items
DO $$ BEGIN
    ALTER TABLE purchase_order_items 
        ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE purchase_order_items 
        ADD COLUMN IF NOT EXISTS scanned_by_user_id UUID;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Step 2: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);

-- Step 3: Add comments (optional)
COMMENT ON COLUMN purchase_order_items.last_scanned_at IS 'Last time this item was scanned during receiving';
COMMENT ON COLUMN purchase_order_items.scanned_by_user_id IS 'User who last scanned this item';

-- Done! Enhanced Receiving is now ready to use! ✅

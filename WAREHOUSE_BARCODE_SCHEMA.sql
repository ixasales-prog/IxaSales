-- ===========================================================================
-- 📦 WAREHOUSE BARCODE SYSTEM - Database Setup
-- ===========================================================================
-- Copy this entire file and run it in pgAdmin, DBeaver, or any DB tool
-- Connected to database: ixasales_dev
-- ===========================================================================

-- 1️⃣ CREATE ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE scan_action AS ENUM (
        'receiving', 'picking', 'packing', 'counting', 'search', 'verification'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_count_status AS ENUM ('in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE packing_status AS ENUM ('started', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2️⃣ CREATE SCAN_LOGS TABLE (Audit Trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID REFERENCES products(id),
    action scan_action NOT NULL,
    barcode VARCHAR(200),
    details JSONB,
    device_info VARCHAR(500),
    scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_tenant_id ON scan_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_user_id ON scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_product_id ON scan_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_action ON scan_logs(action);

-- 3️⃣ CREATE STOCK_COUNTS TABLES (For Phase 7D)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    status stock_count_status NOT NULL DEFAULT 'in_progress',
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant_id ON stock_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    expected_qty INTEGER NOT NULL,
    counted_qty INTEGER,
    variance INTEGER,
    scanned_at TIMESTAMP,
    counted_by_user_id UUID REFERENCES users(id),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_count_items_count_id ON stock_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_product_id ON stock_count_items(product_id);

-- 4️⃣ CREATE PACKING TABLES (For Phase 7C)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    order_id UUID NOT NULL,
    status packing_status NOT NULL DEFAULT 'started',
    packed_by_user_id UUID NOT NULL REFERENCES users(id),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    items_scanned INTEGER DEFAULT 0,
    total_items INTEGER NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_packing_sessions_tenant_id ON packing_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_order_id ON packing_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_packing_sessions_status ON packing_sessions(status);

CREATE TABLE IF NOT EXISTS packing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES packing_sessions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    qty_ordered INTEGER NOT NULL,
    qty_scanned INTEGER DEFAULT 0,
    scanned_at TIMESTAMP,
    is_verified INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_packing_items_session_id ON packing_items(session_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_product_id ON packing_items(product_id);

-- 5️⃣ ENHANCE PURCHASE_ORDER_ITEMS (For Enhanced Receiving)
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);

-- 6️⃣ ADD COMMENTS (Documentation)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE scan_logs IS 'Audit trail of all barcode scans';
COMMENT ON TABLE stock_counts IS 'Physical inventory count sessions';
COMMENT ON TABLE stock_count_items IS 'Individual items counted in a stock count session';
COMMENT ON TABLE packing_sessions IS 'Order packing sessions with scan verification';
COMMENT ON TABLE packing_items IS 'Individual items in a packing session';
COMMENT ON COLUMN purchase_order_items.last_scanned_at IS 'Last time this item was scanned during receiving';
COMMENT ON COLUMN purchase_order_items.scanned_by_user_id IS 'User who last scanned this item';

-- ===========================================================================
-- ✅ DONE! Enhanced Receiving is now ready to use!
-- ===========================================================================
-- Next steps:
-- 1. Restart your backend server (npm run dev)
-- 2. Navigate to Warehouse → Receiving → Select PO
-- 3. Click green scan button → Scan product
-- 4. Watch quantity increment! ✨
-- ===========================================================================

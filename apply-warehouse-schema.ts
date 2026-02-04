import { sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';

async function applyWarehouseSchema() {
    console.log('✨ Applying warehouse barcode schema changes...\n');

    try {
        // Step 1: Create enums
        console.log('1️⃣ Creating enums...');
        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE scan_action AS ENUM (
                    'receiving', 'picking', 'packing', 'counting', 'search', 'verification'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        `);

        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE stock_count_status AS ENUM ('in_progress', 'completed', 'cancelled');
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        `);

        await db.execute(sql`
            DO $$ BEGIN
                CREATE TYPE packing_status AS ENUM ('started', 'in_progress', 'completed', 'cancelled');
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        `);
        console.log('✅ Enums created\n');

        // Step 2: Create scan_logs table
        console.log('2️⃣ Creating scan_logs table...');
        await db.execute(sql`
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
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scan_logs_tenant_id ON scan_logs(tenant_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scan_logs_user_id ON scan_logs(user_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scan_logs_product_id ON scan_logs(product_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at DESC);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scan_logs_action ON scan_logs(action);`);
        console.log('✅ scan_logs table created\n');

        // Step 3: Create stock_counts tables
        console.log('3️⃣ Creating stock_counts tables...');
        await db.execute(sql`
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
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant_id ON stock_counts(tenant_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);`);

        await db.execute(sql`
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
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_stock_count_items_count_id ON stock_count_items(count_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_stock_count_items_product_id ON stock_count_items(product_id);`);
        console.log('✅ stock_counts tables created\n');

        // Step 4: Create packing tables
        console.log('4️⃣ Creating packing tables...');
        await db.execute(sql`
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
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_packing_sessions_tenant_id ON packing_sessions(tenant_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_packing_sessions_order_id ON packing_sessions(order_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_packing_sessions_status ON packing_sessions(status);`);

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS packing_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES packing_sessions(id) ON DELETE CASCADE,
                product_id UUID NOT NULL REFERENCES products(id),
                qty_ordered INTEGER NOT NULL,
                qty_scanned INTEGER DEFAULT 0,
                scanned_at TIMESTAMP,
                is_verified INTEGER DEFAULT 0
            );
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_packing_items_session_id ON packing_items(session_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_packing_items_product_id ON packing_items(product_id);`);
        console.log('✅ packing tables created\n');

        // Step 5: Add columns to purchase_order_items
        console.log('5️⃣ Adding columns to purchase_order_items...');
        await db.execute(sql`
            DO $$ BEGIN
                ALTER TABLE purchase_order_items 
                    ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP;
            EXCEPTION
                WHEN duplicate_column THEN NULL;
            END $$;
        `);

        await db.execute(sql`
            DO $$ BEGIN
                ALTER TABLE purchase_order_items 
                    ADD COLUMN IF NOT EXISTS scanned_by_user_id UUID;
            EXCEPTION
                WHEN duplicate_column THEN NULL;
            END $$;
        `);

        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);`);
        console.log('✅ purchase_order_items updated\n');

        console.log('🎉 All warehouse barcode schema changes applied successfully!');
        console.log('\n✨ Enhanced Receiving is now ready to use!\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error applying schema:', error);
        process.exit(1);
    }
}

applyWarehouseSchema();

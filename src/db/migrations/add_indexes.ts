import { sql } from 'drizzle-orm';
import { db } from '../index';

/**
 * Migration: Add performance indexes
 * Run with: npx tsx src/db/migrations/add_indexes.ts
 */
async function addIndexes() {
    console.log('Adding performance indexes...');

    const indexes = [
        // Orders indexes
        `CREATE INDEX IF NOT EXISTS idx_orders_sales_rep_id ON orders (sales_rep_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders (driver_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders (tenant_id)`,
        `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC)`,

        // Customers indexes
        `CREATE INDEX IF NOT EXISTS idx_customers_assigned_sales_rep_id ON customers (assigned_sales_rep_id)`,
        `CREATE INDEX IF NOT EXISTS idx_customers_territory_id ON customers (territory_id)`,
        `CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers (tenant_id)`,

        // Payments indexes
        `CREATE INDEX IF NOT EXISTS idx_payments_collected_by ON payments (collected_by)`,
        `CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id)`,
        `CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments (tenant_id)`,

        // Products indexes
        `CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products (brand_id)`,
        `CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id)`,
        `CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products (tenant_id)`,

        // Trips indexes
        `CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips (driver_id)`,
        `CREATE INDEX IF NOT EXISTS idx_trips_tenant_id ON trips (tenant_id)`,
        `CREATE INDEX IF NOT EXISTS idx_trips_planned_date ON trips (planned_date)`,

        // Returns indexes
        `CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns (order_id)`,
        `CREATE INDEX IF NOT EXISTS idx_returns_tenant_id ON returns (tenant_id)`,

        // User assignments indexes
        `CREATE INDEX IF NOT EXISTS idx_user_territories_user_id ON user_territories (user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_user_brands_user_id ON user_brands (user_id)`,

        // Stock movements indexes
        `CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements (product_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON stock_movements (tenant_id)`,
    ];

    for (const indexSql of indexes) {
        try {
            await db.execute(sql.raw(indexSql));
            console.log(`✓ ${indexSql.split(' ')[5]}`);
        } catch (error: any) {
            console.error(`✗ Failed: ${indexSql.split(' ')[5]} - ${error.message}`);
        }
    }

    console.log('Done adding indexes.');
}

addIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });

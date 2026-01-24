/**
 * Migration: Add GPS Tracking Support
 * 
 * Creates user_locations table and adds GPS tracking fields to users table.
 * Run with: npx tsx src/db/migrations/add_gps_tracking.ts
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx tsx src/db/migrations/add_gps_tracking.ts
 */

import 'dotenv/config';
import { db } from '../index';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Adding GPS tracking support...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL environment variable is not set');
        console.log('\nPlease set DATABASE_URL in your .env file or as an environment variable');
        console.log('Example: DATABASE_URL=postgres://user:password@localhost:5432/ixasales');
        process.exit(1);
    }

    try {
        // 1. Add GPS tracking fields to users table
        console.log('Adding GPS tracking fields to users table...');
        
        await db.execute(sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS gps_tracking_enabled BOOLEAN DEFAULT true
        `);

        await db.execute(sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_location_update_at TIMESTAMP
        `);

        await db.execute(sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_known_latitude DECIMAL(10, 8)
        `);

        await db.execute(sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_known_longitude DECIMAL(11, 8)
        `);

        console.log('✓ GPS fields added to users table');

        // 2. Create user_locations table
        console.log('Creating user_locations table...');

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_locations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                accuracy DECIMAL(8, 2),
                heading DECIMAL(6, 2),
                speed DECIMAL(8, 2),
                timestamp TIMESTAMP NOT NULL DEFAULT now(),
                created_at TIMESTAMP DEFAULT now()
            )
        `);

        console.log('✓ user_locations table created');

        // 3. Create indexes for performance
        console.log('Creating indexes...');

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_user_locations_user_id_timestamp 
            ON user_locations (user_id, timestamp DESC)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_user_locations_tenant_id_timestamp 
            ON user_locations (tenant_id, timestamp DESC)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_user_locations_user_id_created_at 
            ON user_locations (user_id, created_at DESC)
        `);

        console.log('✓ Indexes created');

        // 4. Add default GPS tracking settings to tenant_settings (optional - can be set via UI)
        console.log('Migration completed successfully');

    } catch (error: any) {
        console.error('Migration failed:', error.message);
        if (error.code === '28P01') {
            console.error('\n⚠️  Database authentication failed. Check your DATABASE_URL in .env');
            console.log('The database user should be "ixasales" (or check your .env file for the correct user)');
        } else if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
            console.log('\n✅ Some columns/tables already exist - migration may have already been run partially');
        }
        throw error;
    }

    console.log('✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your server');
    console.log('2. Configure GPS tracking in Admin Settings: /admin/gps-tracking');
    console.log('3. Enable tracking for specific users (sales reps and drivers)');
}

migrate()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

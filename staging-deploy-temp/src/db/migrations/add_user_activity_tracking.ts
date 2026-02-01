/**
 * Migration: Add User Activity Tracking Support
 * 
 * Creates user_sessions and user_activity_events tables for comprehensive user tracking.
 * Run with: npx tsx src/db/migrations/add_user_activity_tracking.ts
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx tsx src/db/migrations/add_user_activity_tracking.ts
 */

import 'dotenv/config';
import { db } from '../index';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Adding User Activity Tracking support...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL environment variable is not set');
        console.log('\nPlease set DATABASE_URL in your .env file or as an environment variable');
        console.log('Example: DATABASE_URL=postgres://user:password@localhost:5432/ixasales');
        process.exit(1);
    }

    try {
        // 1. Create user_sessions table
        console.log('Creating user_sessions table...');
        
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                started_at TIMESTAMP WITH TIME ZONE NOT NULL,
                ended_at TIMESTAMP WITH TIME ZONE,
                duration VARCHAR(50),
                page_visits INTEGER DEFAULT 0 NOT NULL,
                actions_count INTEGER DEFAULT 0 NOT NULL,
                idle_time VARCHAR(50),
                ip_address VARCHAR(45),
                user_agent TEXT,
                device_info TEXT,
                is_active BOOLEAN DEFAULT true NOT NULL,
                ended_reason TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            )
        `);

        console.log('✓ user_sessions table created');

        // 2. Create user_activity_events table
        console.log('Creating user_activity_events table...');

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS user_activity_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                url TEXT,
                page_title TEXT,
                metadata TEXT,
                load_time INTEGER,
                interaction_delay INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            )
        `);

        console.log('✓ user_activity_events table created');

        // 3. Create indexes for performance
        console.log('Creating indexes...');

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_sessions_tenant_id_idx ON user_sessions(tenant_id)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_sessions_started_at_idx ON user_sessions(started_at)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_sessions_active_idx ON user_sessions(is_active)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_activity_session_id_idx ON user_activity_events(session_id)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_activity_user_id_idx ON user_activity_events(user_id)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_activity_tenant_id_idx ON user_activity_events(tenant_id)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_activity_event_type_idx ON user_activity_events(event_type)
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS user_activity_timestamp_idx ON user_activity_events(timestamp)
        `);

        console.log('✓ Indexes created');

        console.log('Migration completed successfully');

    } catch (error: any) {
        console.error('Migration failed:', error.message);
        if (error.code === '28P01') {
            console.error('\n⚠️  Database authentication failed. Check your DATABASE_URL in .env');
            console.log('The database user should be "ixasales" (or check your .env file for the correct user)');
        } else if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
            console.log('\n✅ Some tables/indexes already exist - migration may have already been run partially');
        }
        throw error;
    }

    console.log('✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your server to load new routes');
    console.log('2. User activity tracking will start automatically in the frontend');
    console.log('3. Access analytics via new API endpoints');
}

migrate()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
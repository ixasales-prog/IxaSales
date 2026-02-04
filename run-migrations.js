// Quick script to apply SQL migrations
import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function runMigrations() {
    try {
        console.log('Applying migration 007...');
        const migration007 = fs.readFileSync('./migrations/007_warehouse_barcode.sql', 'utf-8');
        await db.execute(sql.raw(migration007));
        console.log('✅ Migration 007 applied');

        console.log('Applying migration 008...');
        const migration008 = fs.readFileSync('./migrations/008_enhanced_receiving.sql', 'utf-8');
        await db.execute(sql.raw(migration008));
        console.log('✅ Migration 008 applied');

        console.log('🎉 All migrations completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();

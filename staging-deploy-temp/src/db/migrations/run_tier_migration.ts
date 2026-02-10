import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

async function runMigration() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }

    const sql = postgres(dbUrl, { max: 1 });

    try {
        const migrationPath = resolve(__dirname, './20260210_add_tier_change_logs.sql');
        const migrationSql = readFileSync(migrationPath, 'utf-8');

        console.log('🔄 Running tier upgrade/downgrade migration...');
        await sql.unsafe(migrationSql);
        console.log('✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

runMigration();

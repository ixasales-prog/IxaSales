/**
 * Migration: Add OpenWeather API key to tenants table
 * 
 * This allows each tenant to configure their own weather API key
 * for the weather widget feature.
 */

import { db } from '../index';
import { sql } from 'drizzle-orm';

export async function up() {
    console.log('[Migration] Adding openWeatherApiKey to tenants table...');

    await db.execute(sql`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS open_weather_api_key VARCHAR(100)
    `);

    console.log('[Migration] openWeatherApiKey column added successfully');
}

export async function down() {
    console.log('[Migration] Removing openWeatherApiKey from tenants table...');
    
    await db.execute(sql`
        ALTER TABLE tenants
        DROP COLUMN IF EXISTS open_weather_api_key
    `);

    console.log('[Migration] openWeatherApiKey column removed');
}

// Run migration if called directly
// @ts-ignore - import.meta is available at runtime with tsx
if (typeof require !== 'undefined' && require.main === module) {
    up()
        .then(() => {
            console.log('✅ Migration complete');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

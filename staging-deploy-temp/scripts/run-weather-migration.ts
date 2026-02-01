/**
 * Run the OpenWeather API key migration
 * 
 * Usage:
 *   npx tsx scripts/run-weather-migration.ts
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx tsx scripts/run-weather-migration.ts
 */

import 'dotenv/config';
import { up } from '../src/db/migrations/add_openweather_api_key';

async function main() {
    console.log('🚀 Running OpenWeather API Key Migration\n');
    
    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL environment variable is not set');
        console.log('\nPlease set DATABASE_URL in your .env file or as an environment variable');
        console.log('Example: DATABASE_URL=postgres://user:password@localhost:5432/ixasales');
        process.exit(1);
    }

    try {
        await up();
        console.log('\n✅ Migration completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Restart your server');
        console.log('2. Configure API key in Business Settings: /admin/business-settings');
        console.log('3. Or set globally in .env: OPENWEATHER_API_KEY=your_key');
        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        if (error.code === '28P01') {
            console.error('\n⚠️  Database authentication failed. Check your DATABASE_URL in .env');
        } else if (error.message?.includes('column') && error.message?.includes('already exists')) {
            console.log('\n✅ Column already exists - migration may have already been run');
            process.exit(0);
        }
        process.exit(1);
    }
}

main();

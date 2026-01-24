# Run Weather API Migration

## Quick Run

```bash
npx tsx scripts/run-weather-migration.ts
```

This will:
1. Check for DATABASE_URL in your `.env` file
2. Add the `open_weather_api_key` column to the `tenants` table
3. Show success message

## Prerequisites

Make sure your `.env` file has:
```bash
DATABASE_URL=postgres://user:password@localhost:5432/ixasales
```

## Alternative: Direct Migration

If you prefer to run the migration directly:

```bash
npx tsx src/db/migrations/add_openweather_api_key.ts
```

## Verify Migration

After running, you can verify the column exists:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tenants' 
AND column_name = 'open_weather_api_key';
```

## After Migration

1. **Restart your server** (if running)
2. **Configure API key**:
   - Go to `/admin/business-settings`
   - Enter your OpenWeather API key
   - Save

The 500 error on `/api/tenant/settings` should be resolved after running the migration!

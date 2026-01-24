# Weather API Setup Guide

## ✅ Your API Key

Your OpenWeatherMap API key: `6cf242bf83585423984589cd7a3519d5`

## 🚀 Quick Setup (Choose One Method)

### Method 1: Configure in Business Settings (Recommended - Per Tenant)

1. **Run Migration First** (if not done):
   ```bash
   npx tsx src/db/migrations/add_openweather_api_key.ts
   ```

2. **Configure in UI**:
   - Navigate to `/admin/business-settings`
   - Find "OpenWeather API Key" field
   - Enter: `6cf242bf83585423984589cd7a3519d5`
   - Click "Save Settings"

3. **Verify**:
   - Go to `/sales/dashboard`
   - Weather widget should show real data

### Method 2: Set Global Environment Variable (All Tenants)

1. **Add to `.env` file**:
   ```bash
   OPENWEATHER_API_KEY=6cf242bf83585423984589cd7a3519d5
   ```

2. **Restart Server**:
   ```bash
   # If using systemd
   sudo systemctl restart ixasales-staging
   
   # Or if running manually
   npm start
   ```

3. **Note**: This applies to all tenants. Use Method 1 for per-tenant configuration.

## 🧪 Test Your API Key

Run the test script:
```bash
npx tsx scripts/test-weather-api.ts
```

This will verify your API key works correctly.

## 📋 Priority Order

The system checks API keys in this order:

1. **Tenant-specific key** (from Business Settings) - Highest priority
2. **Global env var** (`OPENWEATHER_API_KEY`) - Fallback
3. **Mock data** - If neither is set

## ✅ Verification Checklist

- [ ] Migration run successfully
- [ ] API key configured (UI or .env)
- [ ] Server restarted (if using .env)
- [ ] Weather widget shows real data
- [ ] No "Mock data" note in widget

## 🔧 Troubleshooting

### API Key Not Working?

1. **Test the key**:
   ```bash
   npx tsx scripts/test-weather-api.ts
   ```

2. **Check API key**:
   - Make sure it's correct (no extra spaces)
   - Verify it's activated in OpenWeatherMap dashboard

3. **Check logs**:
   - Look for weather API errors in server logs
   - Check browser console for frontend errors

### Still Showing Mock Data?

1. **Verify migration ran**:
   ```sql
   SELECT open_weather_api_key FROM tenants WHERE id = 'your-tenant-id';
   ```

2. **Check Business Settings**:
   - Make sure key is saved
   - Try refreshing the page

3. **Check .env**:
   - Verify `OPENWEATHER_API_KEY` is set
   - Restart server after adding

## 📊 API Usage

- **Free Tier**: 60 calls/minute, 1M calls/month
- **Dashboard**: ~1 call per page load
- **Typical Usage**: Very low, well within free tier

## 🎯 Next Steps

1. ✅ Test API key: `npx tsx scripts/test-weather-api.ts`
2. ✅ Run migration: `npx tsx src/db/migrations/add_openweather_api_key.ts`
3. ✅ Configure in Business Settings or .env
4. ✅ Verify on dashboard

**Your API key is ready to use!** 🎉

# Fix CORS Configuration

If you're seeing CORS errors like:
```
Access to fetch at 'https://dev-api.ixasales.uz/api/branding' from origin 'https://dev.ixasales.uz' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

This means the server's `.env` file doesn't have the correct `CORS_ORIGIN` value.

## Quick Fix

SSH into your server and update the `.env` file:

```bash
ssh ilhom1983@176.96.241.152
cd /var/www/ixasales/staging

# Backup the .env file first
cp .env .env.backup

# Edit the .env file
nano .env
```

Make sure you have this line in the `.env` file:

**For Staging:**
```bash
CORS_ORIGIN=https://dev.ixasales.uz
```

**For Production:**
```bash
CORS_ORIGIN=https://ixasales.uz
```

If you need to allow multiple origins (e.g., both frontend and admin panel):
```bash
CORS_ORIGIN=https://dev.ixasales.uz,https://admin.dev.ixasales.uz
```

After updating, restart the service:
```bash
sudo systemctl restart ixasales-staging
# or for production:
sudo systemctl restart ixasales-production
```

## Verify

Check the service logs to ensure it started correctly:
```bash
sudo systemctl status ixasales-staging --no-pager
journalctl -u ixasales-staging -f
```

## Using the Fix Script

From your local machine (Git Bash):
```bash
./scripts/fix-cors.sh staging
```

This script will:
1. Backup your `.env` file
2. Update `CORS_ORIGIN` to the correct value
3. Restart the service
4. Show the service status


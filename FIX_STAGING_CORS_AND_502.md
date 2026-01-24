# Fix Staging CORS and 502 Error - Manual Steps

The 502 Bad Gateway error means the service is either not running or crashing. Follow these steps:

## Step 1: SSH into the server
```bash
ssh ilhom1983@176.96.241.152
```

## Step 2: Check service status
```bash
sudo systemctl status ixasales-staging
```

## Step 3: Check recent logs for errors
```bash
journalctl -u ixasales-staging -n 50 --no-pager
```

Look for errors like:
- Database connection failures
- Missing environment variables
- Port already in use
- Module not found errors

## Step 4: Navigate to staging directory
```bash
cd /var/www/ixasales/staging
```

## Step 5: Fix CORS_ORIGIN in .env
```bash
# Backup .env first
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Check current CORS_ORIGIN
grep CORS_ORIGIN .env

# Update or add CORS_ORIGIN
if grep -q "^CORS_ORIGIN=" .env; then
    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env
    echo "Updated CORS_ORIGIN"
else
    echo "" >> .env
    echo "# CORS Configuration" >> .env
    echo "CORS_ORIGIN=https://dev.ixasales.uz" >> .env
    echo "Added CORS_ORIGIN"
fi

# Verify it was set correctly
grep CORS_ORIGIN .env
```

## Step 6: Check if build files exist
```bash
# Check backend build
ls -la dist/index-fastify.js

# Check frontend build
ls -la client/dist/index.html
```

If either is missing, the deployment didn't complete properly.

## Step 7: Check if port is in use
```bash
# Check what's running on port 3001 (staging port)
sudo netstat -tlnp | grep 3001
# or
sudo ss -tlnp | grep 3001
```

If something else is using the port, you may need to kill it or change the port.

## Step 8: Test the service manually
```bash
# Try running the service manually to see errors
cd /var/www/ixasales/staging
node dist/index-fastify.js
```

Press Ctrl+C after checking for errors.

## Step 9: Restart the service
```bash
sudo systemctl restart ixasales-staging
sleep 3
sudo systemctl status ixasales-staging --no-pager
```

## Step 10: Check if it's working
```bash
# Test the health endpoint
curl http://localhost:3001/api/health

# Check nginx is proxying correctly
curl https://dev-api.ixasales.uz/api/health
```

## Step 11: Check nginx configuration
```bash
# Check nginx error logs
sudo tail -n 50 /var/log/nginx/error.log

# Test nginx config
sudo nginx -t

# Reload nginx if needed
sudo systemctl reload nginx
```

## Common Issues and Solutions

### Issue: Service crashes immediately
**Solution:** Check the logs for the specific error:
```bash
journalctl -u ixasales-staging -f
```

### Issue: Database connection error
**Solution:** Verify database credentials in `.env`:
```bash
grep DATABASE_URL .env
```

### Issue: Port already in use
**Solution:** Find and kill the process:
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
sudo systemctl restart ixasales-staging
```

### Issue: Missing node_modules
**Solution:** Reinstall dependencies:
```bash
cd /var/www/ixasales/staging
npm install --omit=dev
```

### Issue: CORS still not working after fix
**Solution:** Make sure the service restarted and check logs:
```bash
# Verify CORS_ORIGIN is loaded
journalctl -u ixasales-staging | grep CORS

# Restart again
sudo systemctl restart ixasales-staging
```

## Quick All-in-One Fix Command

If you want to do everything at once:

```bash
ssh ilhom1983@176.96.241.152 "cd /var/www/ixasales/staging && \
cp .env .env.backup.\$(date +%Y%m%d_%H%M%S) && \
(grep -q '^CORS_ORIGIN=' .env && sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env || \
(echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://dev.ixasales.uz' >> .env)) && \
echo 'CORS_ORIGIN updated:' && grep '^CORS_ORIGIN=' .env && \
sudo systemctl restart ixasales-staging && \
sleep 3 && \
sudo systemctl status ixasales-staging --no-pager | head -20"
```

Then check logs:
```bash
ssh ilhom1983@176.96.241.152 'journalctl -u ixasales-staging -n 30 --no-pager'
```

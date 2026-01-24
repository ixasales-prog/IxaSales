# Manual CORS Fix for Staging

Since the automated script requires password input, run these commands manually in your terminal:

## Step 1: Connect to the server
```powershell
ssh ilhom1983@176.96.241.152
```

## Step 2: Navigate to staging directory
```bash
cd /var/www/ixasales/staging
```

## Step 3: Backup the .env file
```bash
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "Backed up .env file"
```

## Step 4: Update CORS_ORIGIN
```bash
# Check if CORS_ORIGIN exists
if grep -q "^CORS_ORIGIN=" .env; then
    sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env
    echo "Updated existing CORS_ORIGIN"
else
    echo "" >> .env
    echo "# CORS Configuration" >> .env
    echo "CORS_ORIGIN=https://dev.ixasales.uz" >> .env
    echo "Added CORS_ORIGIN"
fi
```

## Step 5: Verify the change
```bash
echo "Current CORS_ORIGIN value:"
grep "^CORS_ORIGIN=" .env
```

## Step 6: Restart the service (will ask for password: HelpMe11)
```bash
sudo systemctl restart ixasales-staging
```

## Step 7: Check service status
```bash
sudo systemctl status ixasales-staging --no-pager
```

## Step 8: Exit SSH
```bash
exit
```

---

## Alternative: All-in-one command (copy and paste)

If you want to do it all at once, you can SSH with this command:

```powershell
ssh ilhom1983@176.96.241.152 "cd /var/www/ixasales/staging && cp .env .env.backup.$(date +%Y%m%d_%H%M%S) && (grep -q '^CORS_ORIGIN=' .env && sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://dev.ixasales.uz|' .env || (echo '' >> .env && echo '# CORS Configuration' >> .env && echo 'CORS_ORIGIN=https://dev.ixasales.uz' >> .env)) && echo 'CORS_ORIGIN updated:' && grep '^CORS_ORIGIN=' .env"
```

Then restart the service (this will prompt for password):
```powershell
ssh -tt ilhom1983@176.96.241.152 "sudo systemctl restart ixasales-staging && sudo systemctl status ixasales-staging --no-pager | head -20"
```

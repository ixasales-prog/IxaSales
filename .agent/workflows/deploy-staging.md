---
description: How to deploy IxaSales to staging server
---

# Deploy to Staging Server

// turbo-all

## Prerequisites
- SSH access to `ilhom1983@176.96.241.152`
- Git Bash or WSL installed on Windows
- DNS records configured for `dev.ixasales.uz` and `dev-api.ixasales.uz`

## First-Time Server Setup

1. Copy `server-setup.sh` to server:
```bash
scp scripts/server-setup.sh ilhom1983@176.96.241.152:~/
```

2. SSH into server and run setup:
```bash
ssh ilhom1983@176.96.241.152
chmod +x ~/server-setup.sh
sudo ./server-setup.sh
```

3. **SAVE the generated credentials** (database password, JWT secret)

4. After DNS propagates, install SSL:
```bash
sudo certbot --nginx -d dev.ixasales.uz -d dev-api.ixasales.uz
```

## Manual Deployment

From project root on your local Windows machine:

```bash
# Using Git Bash or WSL
./scripts/deploy.sh staging
```

## Automatic Deployment (GitHub Actions)

1. Push your code to GitHub:
```bash
git add .
git commit -m "Deploy to staging"
git push origin main
```

2. Add SSH key to GitHub Secrets:
   - Go to your GitHub repo → Settings → Secrets → Actions
   - Add `SSH_PRIVATE_KEY` with your private key content

3. Deployments happen automatically on push to `main` or `develop` branches

## Check Logs

```bash
ssh ilhom1983@176.96.241.152 'journalctl -u ixasales-staging -f'
```

## Restart Service

```bash
ssh ilhom1983@176.96.241.152 'sudo systemctl restart ixasales-staging'
```

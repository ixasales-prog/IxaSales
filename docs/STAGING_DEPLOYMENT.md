# Staging Deployment

The staging deployment flow is designed around immutable release artifacts, a gated CI trigger, and atomic switching.

## Design

- CI deploys only after `Test & Deploy Pipeline` succeeds on `staging`, unless manually dispatched.
- CI builds backend and frontend once for the deploy ref.
- CI uploads a single `staging-release-<sha>.tgz` artifact to the server.
- The server deploy script extracts into `/var/www/ixasales/staging/releases/<timestamp>`.
- Backend runs blue/green via `ixasales-staging@blue.service` and `ixasales-staging@green.service`.
- Nginx serves frontend from `/var/www/ixasales/staging/current/client/dist`.
- Nginx proxies `dev-api.ixasales.uz` through `/etc/nginx/snippets/ixasales-staging-api-upstream.conf`.
- SSH host trust is pinned via `scripts/ssh/known_hosts.staging`.
- Deploy switches the inactive backend slot first, health-checks it, then atomically flips:
  - backend upstream port
  - `current` symlink
- Database changes are applied with committed Drizzle migrations before cutover.
- If smoke checks fail after the switch, the script restores:
  - previous backend upstream
  - previous `current` symlink
  - previous active backend slot

## One-time bootstrap

Run on the staging server as `root`:

```bash
bash scripts/staging-bootstrap-bluegreen.sh
```

This only touches the staging app:

- `/var/www/ixasales/staging`
- `/etc/systemd/system/ixasales-staging@.service`
- `/etc/nginx/sites-available/ixasales-staging`
- `/etc/nginx/snippets/ixasales-staging-api-upstream.conf`
- `/usr/local/bin/ixasales-staging-deploy`
- `/etc/sudoers.d/ixasales-staging-deploy`

It does not modify the other server projects.

## One-command deploy

From a workstation with GitHub CLI authenticated:

```powershell
npm run deploy:staging
```

This dispatches `.github/workflows/deploy-staging.yml` for the current branch.

You can deploy a specific ref:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-staging.ps1 -Ref staging
```

## Required GitHub secrets

- `STAGING_DEPLOY_KEY`

No sudo password secret is required. The deploy user is limited to the root-owned wrapper command in `/usr/local/bin/ixasales-staging-deploy`.

## Staging frontend caching

The staging workflow sets `VITE_ENABLE_PWA=false`, so the service worker is not generated for staging builds. That removes the stale-bundle problem that was masking successful deploys.

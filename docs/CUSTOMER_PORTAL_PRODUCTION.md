# Customer Portal - Production Deployment Guide

This guide covers deploying the Customer Portal to production with all security and performance features enabled.

---

## Prerequisites

- **Node.js 20+**
- **PostgreSQL 14+** database
- **Redis 6+** (recommended for scaling)
- **HTTPS certificate** (required for production)

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Critical Security Settings

```bash
# MUST change in production
JWT_SECRET=your-random-32-char-secret-here

# Set to production
NODE_ENV=production

# Your actual domain
CORS_ORIGIN=https://yourapp.com
API_URL=https://api.yourapp.com
```

### Redis (Recommended)

For production rate limiting, configure Redis:

```bash
REDIS_URL=redis://localhost:6379
# Or with auth:
REDIS_URL=redis://:password@localhost:6379
```

If `REDIS_URL` is not set, the system falls back to in-memory rate limiting (not suitable for multi-instance deployments).

### Telegram Notifications

```bash
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_DEFAULT_CHAT_ID=your-chat-id
TELEGRAM_WEBHOOK_SECRET=random-secret-for-webhook-validation
```

---

## Security Features

### Enabled by Default in Production

1. **HTTPS Enforcement** - Automatically redirects HTTP to HTTPS
2. **Security Headers** - X-Frame-Options, X-Content-Type-Options, HSTS
3. **Rate Limiting** - OTP: 5/hour, API: 100/minute
4. **JWT Authentication** - 7-day expiry with HS256 signing
5. **HTML Escaping** - All user content in Telegram messages is escaped
6. **Request Logging** - Audit trails for sensitive endpoints

### Disabling HTTPS Redirect (Not Recommended)

If running behind a proxy that handles HTTPS:

```bash
DISABLE_HTTPS_REDIRECT=true
```

---

## Service Worker (PWA)

The Customer Portal is a Progressive Web App with:

- **Offline Support** - Cached static assets & API responses
- **Background Sync** - Cart and favorites sync when back online
- **Push Notifications** - Order status updates (requires VAPID keys)
- **Install Prompt** - Can be installed on mobile home screen

### Enabling Push Notifications

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```

2. Add to `.env`:
   ```bash
   VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_SUBJECT=mailto:admin@yourcompany.com
   ```

3. Users can subscribe via the profile settings

---

## Rate Limiting

| Endpoint Type | Limit | Window | Block Duration |
|--------------|-------|--------|----------------|
| OTP Request  | 5 attempts | 1 hour | 1 hour |
| OTP Verify   | 5 attempts | 15 min | 15 min |
| General API  | 100 requests | 1 min | 1 min |

Rate limiting uses Redis when `REDIS_URL` is configured, otherwise falls back to in-memory.

---

## Monitoring & Logging

### Request Logging

All requests are logged with:
- HTTP method and path
- Response status and timing
- User/customer identification
- IP address (from X-Forwarded-For)

Sensitive paths (auth, payments) are logged at INFO level.
Slow requests (>1s) are logged as warnings.

### Log Levels

Configure via environment:
```bash
LOG_LEVEL=info  # Options: debug, info, warn, error
```

---

## Health Checks

- **`GET /health`** - Returns `{ status: 'ok', timestamp: ... }`

Use this for load balancer health checks and monitoring.

---

## Database Migrations

Run database migrations before starting:

```bash
npm run db:push
# Or for more control:
npm run db:migrate
```

---

## Build Commands

```bash
# Install dependencies
npm install
cd client && npm install

# Build frontend
cd client && npm run build

# Start production server
NODE_ENV=production npm run build && npm run start
```

---

## Scaling Considerations

### Horizontal Scaling

When running multiple instances:

1. **Use Redis** for rate limiting (shared state)
2. **Configure sticky sessions** for WebSocket connections (if used)
3. **Use shared session store** for JWT refresh tokens

### Database Connection Pooling

Configure max connections in `DATABASE_URL`:
```
postgres://user:pass@host:5432/db?connection_limit=10
```

---

## Security Checklist

- [ ] JWT_SECRET is at least 32 characters
- [ ] NODE_ENV is set to 'production'
- [ ] CORS_ORIGIN is set to your actual domain
- [ ] HTTPS is enabled (via reverse proxy or cloud provider)
- [ ] Redis is configured for rate limiting
- [ ] Telegram webhook secret is set
- [ ] Database password is strong
- [ ] Backups are configured

---

## Troubleshooting

### Rate Limit Issues
- Check if Redis is connected (logs show "[RateLimit] Redis connected successfully")
- Clear rate limits: restart Redis or wait for timeout

### Service Worker Not Registering
- Ensure HTTPS is enabled (required for service workers)
- Check browser console for registration errors
- Clear service worker: DevTools > Application > Service Workers > Unregister

### Push Notifications Not Working
- Verify VAPID keys are configured
- Check browser notification permissions
- Ensure service worker is active

# Elysia to Fastify Migration Plan

## Overview
Migration from Elysia (with Node.js adapter) to Fastify for the IxaSales backend.

**Estimated Time**: 70-100 hours
**Risk Level**: Medium-High
**Rollback Strategy**: Keep Elysia code in separate branch until fully tested

---

## Phase 1: Setup & Dependencies (2-4 hours)

### 1.1 Install Fastify Dependencies
```bash
npm install fastify @fastify/cors @fastify/static @fastify/jwt @fastify/multipart @fastify/formbody @sinclair/typebox
npm uninstall elysia @elysiajs/cors @elysiajs/jwt @elysiajs/node @elysiajs/static
```

### 1.2 New Dependencies Mapping
| Elysia | Fastify |
|--------|---------|
| `elysia` | `fastify` |
| `@elysiajs/cors` | `@fastify/cors` |
| `@elysiajs/jwt` | `@fastify/jwt` |
| `@elysiajs/static` | `@fastify/static` |
| `@elysiajs/node` | *(not needed - native)* |
| Built-in `t.Object` | `@sinclair/typebox` |

---

## Phase 2: Core Infrastructure (6-8 hours)

### 2.1 Create New Entry Point (`src/index-fastify.ts`)
- Initialize Fastify instance
- Register plugins (CORS, static, JWT)
- Setup error handlers
- Register route modules

### 2.2 Auth Plugin Migration (`src/lib/auth-fastify.ts`)
- Convert Elysia's `.derive()` to Fastify's `preHandler` hook
- JWT verification logic
- User context attachment to request

### 2.3 Security & Middleware
- Convert security headers plugin
- Convert request logger
- Convert rate limiter

---

## Phase 3: Route Migration (40-60 hours)

### Route Files to Migrate (22 files):
| File | Lines | Priority |
|------|-------|----------|
| `auth.ts` | ~500 | 1 - Critical |
| `orders.ts` | ~965 | 2 - Core |
| `products.ts` | ~900+ | 3 - Core |
| `customers.ts` | ~409 | 4 - Core |
| `visits.ts` | ~665 | 5 - Core |
| `users.ts` | ~400+ | 6 |
| `payments.ts` | ~500+ | 7 |
| `delivery.ts` | ~400+ | 8 |
| `discounts.ts` | ~300+ | 9 |
| `inventory.ts` | ~200+ | 10 |
| `procurement.ts` | ~400+ | 11 |
| `returns.ts` | ~300+ | 12 |
| `reports.ts` | ~200+ | 13 |
| `notifications.ts` | ~400+ | 14 |
| `tenants.ts` | ~400+ | 15 |
| `tenant-self.ts` | ~450+ | 16 |
| `super.ts` | ~400+ | 17 |
| `uploads.ts` | ~200+ | 18 |
| `images.ts` | ~100+ | 19 |
| `telegram-webhook.ts` | ~900+ | 20 |
| `payment-gateway.ts` | ~550+ | 21 |
| `customer-portal/*.ts` | ~1000+ | 22 |

### Conversion Pattern

**Elysia Style:**
```typescript
export const orderRoutes = new Elysia({ prefix: '/orders' })
    .use(authPlugin)
    .get('/', async (ctx) => {
        const { user, isAuthenticated, query, set } = ctx as any;
        if (!isAuthenticated) { 
            set.status = 401; 
            return { success: false, error: { code: 'UNAUTHORIZED' } }; 
        }
        // ... logic
        return { success: true, data };
    }, {
        query: t.Object({
            page: t.Optional(t.String()),
            limit: t.Optional(t.String()),
        })
    });
```

**Fastify Style:**
```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const QuerySchema = Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
});

export const orderRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/', {
        preHandler: [fastify.authenticate],
        schema: {
            querystring: QuerySchema
        }
    }, async (request, reply) => {
        const user = request.user;
        const query = request.query as Static<typeof QuerySchema>;
        // ... logic
        return { success: true, data };
    });
};
```

---

## Phase 4: Testing & Validation (20-30 hours)

### 4.1 Unit Testing
- Test each route after migration
- Verify authentication flows
- Check validation schemas

### 4.2 Integration Testing
- Test frontend ↔ backend communication
- Verify all API endpoints return expected format
- Check error handling

### 4.3 Performance Testing
- Compare response times
- Load testing with same parameters

---

## Phase 5: Cleanup & Deployment (4-6 hours)

### 5.1 Remove Elysia Code
- Delete Elysia-specific files
- Update package.json
- Clean up imports

### 5.2 Update Documentation
- API documentation
- Deployment scripts
- README updates

### 5.3 Deploy
- Stage deployment
- Production deployment

---

## Migration Order (Recommended)

1. **Core Setup** - Entry point, auth plugin
2. **Auth Routes** - Login, logout, token refresh
3. **Simple CRUD** - Products, Categories, Brands
4. **Core Business** - Orders, Customers, Visits
5. **Supporting** - Payments, Deliveries, Returns
6. **Admin** - Users, Tenants, Settings
7. **Integrations** - Telegram, Payment Gateways
8. **Portal** - Customer Portal routes

---

## Key Differences Cheat Sheet

| Aspect | Elysia | Fastify |
|--------|--------|---------|
| Context | `ctx.user`, `ctx.query` | `request.user`, `request.query` |
| Set status | `set.status = 401` | `reply.code(401)` |
| Body | `ctx.body` | `request.body` |
| Params | `ctx.params` | `request.params` |
| Headers | `ctx.headers` | `request.headers` |
| Return | `return data` | `return data` or `reply.send(data)` |
| Plugin | `.use(plugin)` | `fastify.register(plugin)` |
| Prefix | `new Elysia({ prefix: '/x' })` | `fastify.register(routes, { prefix: '/x' })` |
| Validation | `t.Object({...})` | `Type.Object({...})` |
| Hooks | `.derive()`, `.onBeforeHandle()` | `preHandler`, `onRequest` |

---

## Rollback Plan

1. Keep `main` branch with Elysia code
2. Create `feature/fastify-migration` branch
3. Migrate incrementally
4. Test thoroughly before merging
5. If issues arise, revert to main branch

---

## Files to Create

1. `src/index-fastify.ts` - New entry point
2. `src/lib/auth-fastify.ts` - Auth plugin for Fastify
3. `src/lib/fastify-plugins/` - Directory for custom plugins
4. `src/types/fastify.d.ts` - Type declarations

## Files to Modify

1. `package.json` - Update dependencies
2. All route files in `src/routes/`
3. `tsconfig.json` - May need adjustment

---

## Status Tracking

- [x] Phase 1: Setup ✅
- [x] Phase 2: Core Infrastructure ✅
- [x] Phase 3: Route Migration ✅ (ALL ROUTES COMPLETE)
  - [x] auth.ts
  - [x] orders.ts
  - [x] products.ts
  - [x] customers.ts
  - [x] visits.ts
  - [x] users.ts
  - [x] payments.ts
  - [x] delivery.ts
  - [x] discounts.ts
  - [x] inventory.ts
  - [x] procurement.ts
  - [x] returns.ts
  - [x] reports.ts
  - [x] notifications.ts
  - [x] tenants.ts
  - [x] tenant-self.ts
  - [x] uploads.ts
  - [x] images.ts
  - [x] super.ts
  - [x] payment-gateway.ts
  - [x] telegram-webhook.ts
  - [x] customer-portal/* (15 files - ALL MIGRATED)
    - [x] types.ts
    - [x] middleware.ts
    - [x] auth.ts
    - [x] profile.ts
    - [x] branding.ts
    - [x] products.ts
    - [x] favorites.ts
    - [x] addresses.ts
    - [x] cart.ts
    - [x] payments.ts
    - [x] reorder.ts
    - [x] discounts.ts
    - [x] reviews.ts
    - [x] orders.ts
    - [x] index.ts
- [x] Phase 4: Testing
  - [x] Type Check (Passed)
  - [x] Smoke Tests (Passed)
  - [ ] Integration Tests (Existing tests are for Elysia, need migration if needed)
- [ ] Phase 5: Cleanup & Deploy
  - [x] Staging Deployment (Files synced, manual restart required)

**Last Updated**: 2026-01-22 22:45


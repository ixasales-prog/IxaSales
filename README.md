# IxaSales - Distribution ERP

Multi-tenant Distribution ERP built with Bun + ElysiaJS + SolidJS + PostgreSQL + Drizzle ORM.

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) v1.0+
- PostgreSQL 15+

### Setup

1. **Install dependencies**
```bash
bun install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Push database schema**
```bash
bun run db:push
```

4. **Start development server**
```bash
bun run dev
```

Server runs at http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot reload |
| `bun run start` | Start production server |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run pending migrations |
| `bun run db:push` | Push schema directly (dev only) |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run typecheck` | Run TypeScript type checking |
| `bun test` | Run tests |

## API Endpoints

### Auth
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Users (Tenant Admin)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/users/:id` - Get user
- `PATCH /api/users/:id` - Update user
- `PUT /api/users/:id/territories` - Assign territories
- `PUT /api/users/:id/brands` - Assign brands

### Tenants (Super Admin)
- `GET /api/super/tenants` - List tenants
- `POST /api/super/tenants` - Create tenant
- `GET /api/super/tenants/:id` - Get tenant
- `PATCH /api/super/tenants/:id` - Update tenant

## Project Structure

```
src/
├── db/
│   ├── index.ts          # Database connection
│   └── schema/           # Drizzle schema files
├── lib/
│   ├── auth.ts           # Auth middleware
│   └── password.ts       # Password utilities
├── routes/
│   ├── auth.ts           # Auth endpoints
│   ├── users.ts          # User management
│   └── tenants.ts        # Tenant management
└── index.ts              # App entry point
```

## License

Private - All rights reserved

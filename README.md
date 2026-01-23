# IxaSales - Distribution ERP

Multi-tenant Distribution ERP built with Node.js + ElysiaJS + SolidJS + PostgreSQL + Drizzle ORM.

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+

### Setup

1. **Install dependencies**
```bash
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Push database schema**
```bash
npm run db:push
```

4. **Start development server**
```bash
npm run dev
```

Server runs at http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build the server for production |
| `npm run start` | Start production server |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run tests |

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

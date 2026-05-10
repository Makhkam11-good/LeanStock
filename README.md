# LeanStock — Inventory Management System API

Production-grade backend for multi-tenant inventory management with atomic stock transfers, dead stock decay automation, and role-based access control.

## Tech Stack

| Component | Choice | Purpose |
|-----------|--------|---------|
| Runtime | Node.js 20+ | Async I/O for concurrent inventory ops |
| Framework | Express.js 4.18 | REST API with middleware ecosystem |
| Database | PostgreSQL 15+ | ACID transactions and durable persistence |
| ORM | Prisma 5.x | Type-safe queries, migrations |
| Auth | JWT + bcrypt | Email verification, password reset, refresh rotation |
| Queue | Redis | Async email delivery and dead-stock decay jobs |
| Validation | Zod | Runtime request/response validation |
| Docs | Swagger UI | Interactive API documentation |
| Testing | Jest + Supertest | Unit + integration tests |
| CI/CD | GitHub Actions | Lint, test, Docker build on push |

## Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/Makhkam11-good/LeanStock.git && cd LeanStock

# Start everything (API + worker + PostgreSQL + Redis)
docker compose up --build

# The API will:
# 1. Wait for PostgreSQL to be healthy
# 2. Run Prisma migrations automatically
# 3. Start on http://localhost:3000
```

**Endpoints after startup:**
- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs` or `http://localhost:3000/api-docs`
- Health check: `http://localhost:3000/health`
- PostgreSQL from host tools/tests: `localhost:5433` (inside Docker network it remains `postgres:5432`)

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Start PostgreSQL and Redis (via Docker or local install)
docker compose up postgres redis -d

# 4. Generate Prisma client
npx prisma generate

# 5. Run migrations
npx prisma migrate deploy

# 6. (Optional) Seed test data
npm run db:seed

# 7. Start the server
npm run dev

# 8. In a second terminal, process async email/decay jobs
npm run worker
```

## Seed Accounts

After running `npm run db:seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@leanstock.com | Admin123 |
| Manager | manager@leanstock.com | Manager123 |
| Operator | operator@leanstock.com | Operator123 |
| Auditor | auditor@leanstock.com | Auditor123 |

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/v1/auth/signup | - | Public signup, queues verification email |
| POST | /api/v1/auth/register | Bearer (SYSTEM_ADMIN) | Create user and assign role |
| POST | /api/v1/auth/login | - | Get JWT tokens |
| POST | /api/v1/auth/refresh-token | - | Rotate refresh token and issue access token |
| POST | /api/v1/auth/logout | - | Revoke refresh token |
| POST/GET | /api/v1/auth/verify-email | - | Verify signup email token |
| POST | /api/v1/auth/request-password-reset | - | Queue password reset email |
| POST | /api/v1/auth/reset-password | - | Reset password with email token |
| POST | /api/v1/auth/change-password | Bearer | Change password |
| GET | /api/v1/auth/me | Bearer | Current user profile |

### Products (MANAGER can write, all roles can read)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/v1/products | Bearer | List (cursor-paginated) |
| POST | /api/v1/products | Bearer (MANAGER) | Create product |
| GET | /api/v1/products/:id | Bearer | Get by ID |
| PATCH | /api/v1/products/:id | Bearer (MANAGER) | Update |
| POST | /api/v1/products/:id/discontinue | Bearer (MANAGER) | Discontinue |

### Inventory (atomicity)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/v1/inventory | Bearer | List (cursor-paginated) |
| GET | /api/v1/inventory/:id | Bearer | Get with lots |
| POST | /api/v1/inventory/transfer | Bearer (OPERATOR+) | **Atomic transfer** |
| POST | /api/v1/inventory/receive | Bearer (OPERATOR+) | Receive stock |
| POST | /api/v1/inventory/:id/reserve | Bearer (OPERATOR+) | Reserve stock |
| POST | /api/v1/inventory/:id/release-reservation | Bearer (OPERATOR+) | Release reservation |

### Warehouses & Locations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | /api/v1/warehouses | Bearer | List / Create |
| GET/PATCH | /api/v1/warehouses/:id | Bearer | Get / Update |
| POST | /api/v1/warehouses/:id/close | Bearer (MANAGER) | Close warehouse |
| GET/POST | /api/v1/locations | Bearer | List / Create |
| GET/PATCH/DELETE | /api/v1/locations/:id | Bearer | CRUD |

### Reports & Decay
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/v1/reports/dead-stock | Bearer | Dead stock lots |
| GET | /api/v1/reports/decay-history | Bearer | Decay audit trail |
| GET | /api/v1/reports/low-stock | Bearer | Low stock alerts |
| POST | /api/v1/reports/trigger-decay | Bearer (MANAGER) | Queue manual decay job |
| GET | /api/v1/jobs/:id | Bearer (MANAGER) | Inspect queued/completed/failed job |

## Architecture Decisions

### Atomic Stock Transfer
All inventory transfers run inside a serializable Prisma `$transaction` with optimistic conditional updates. This prevents:
- Overselling (two concurrent transfers depleting same stock)
- Data inconsistency between aggregate inventory and lot-level records
- FIFO lineage breaks during concurrent lot consumption

### Email and Background Jobs
Signup verification, password reset, stock receipt, stock transfer, and dead-stock decay alerts are enqueued through Redis. The API returns quickly, while `npm run worker` delivers emails through the configured provider. Local development uses `EMAIL_PROVIDER=mock`; production should use `EMAIL_PROVIDER=sendgrid` with `SENDGRID_API_KEY`.

### Dead Stock Decay (Lot-Level)
Decay targets individual inventory lots, not products. A product can be "fresh" in one warehouse and "stale" in another. The cron runs daily at 02:00 UTC and:
1. Finds lots older than 30 days (configurable)
2. Adds 10% discount per cycle (configurable), capped at 50%
3. Creates immutable PriceHistory and DecayAudit records
4. Skips lots already decayed within 72 hours

### RBAC Roles
| Role | Can Write | Can Read | Special |
|------|-----------|----------|---------|
| SYSTEM_ADMIN | Everything | Everything | User management |
| MANAGER | Products, inventory, warehouses | Everything | Approve transfers, trigger decay |
| WAREHOUSE_OPERATOR | Stock movements, reservations | Most entities | Day-to-day operations |
| AUDITOR | Nothing | Everything | Compliance read-only |

## Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires PostgreSQL and migrated leanstock_test)
npm run test:integration

# With coverage
npm run test:coverage
```

For local integration tests, the Docker Postgres init script creates `leanstock_test` on a fresh volume. Apply migrations to that database before running the full suite:

```bash
docker compose up -d postgres redis
$env:DATABASE_URL="postgresql://leanstock:leanstock_pass@localhost:5433/leanstock_test"
npx prisma migrate deploy
npm test
```

## Environment Variables

See `.env.example` for all variables. Critical ones that **must** be set:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Access token signing key (min 32 chars)
- `JWT_REFRESH_SECRET` — Refresh token signing key (min 32 chars)
- `NODE_ENV` — development | test | production
- `REDIS_URL` - Redis connection for background jobs
- `APP_BASE_URL` - Public API base URL used in email links
- `EMAIL_FROM` / `SENDGRID_API_KEY` - real email delivery configuration

The app **refuses to start** if critical secrets are missing.

## Project Structure

```
LeanStock/
├── prisma/              # Schema & migrations (source of truth)
│   ├── schema.prisma
│   ├── seed.js
│   └── migrations/
├── src/
│   ├── config/          # Environment validation, Prisma singleton
│   ├── controllers/     # HTTP request/response handlers
│   ├── middleware/       # Auth, RBAC, validation, error handler, rate limiter
│   ├── routes/          # Express Router definitions
│   ├── services/        # Business logic & database transactions
│   ├── utils/           # JWT, bcrypt, pagination, error classes, Zod schemas
│   ├── jobs/            # Dead stock decay cron
│   └── app.js           # Express app setup
├── tests/
│   ├── unit/            # Pure business logic tests
│   └── integration/     # Auth flow, RBAC, transfer atomicity
├── docs/
│   └── openapi.yaml     # OpenAPI 3.0 spec → Swagger UI
├── docker-compose.yml   # API + PostgreSQL
├── Dockerfile           # Multi-stage production build
├── .github/workflows/   # CI: lint + test + Docker build
├── CHANGELOG.md         # Deviations from blueprint documented
└── README.md
```

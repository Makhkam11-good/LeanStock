# Changelog

## v1.0.0 — Sprint 1 (2026-04-27)

### Added
- **Authentication & Authorization (100%)**
  - User registration with validated input (unique email, password strength)
  - Login with JWT access token (15min) + refresh token (7 days)
  - Logout with refresh token revocation
  - Token refresh endpoint
  - Password change with re-authentication
  - bcrypt password hashing (configurable rounds)
  - RBAC middleware with 5 roles: COMPANY_ADMIN, MANAGER, WAREHOUSE_OPERATOR, AUDITOR, SYSTEM_ADMIN
  - Rate limiting on /auth/login and /auth/register (5 attempts/min/IP)
  - CORS configured — no wildcard origins in production

- **Project Infrastructure**
  - Environment validation at startup (fails fast on missing secrets)
  - Prisma ORM with PostgreSQL 15+ (zero raw SQL except SELECT FOR UPDATE)
  - Docker Compose (API + PostgreSQL) — runnable with `docker compose up`
  - Swagger UI at /api-docs
  - Winston structured logging
  - Health check endpoint at /health
  - Graceful shutdown with SIGTERM/SIGINT handling

- **Core Business Logic: LeanStock**
  - Multi-tenant product catalog CRUD
  - **Atomic inventory transfer** between locations using `SELECT FOR UPDATE` — prevents race conditions and overselling
  - FIFO lot lineage preserved during transfers (parent_lot_id tracking)
  - Inventory lot receiving with unit cost tracking
  - Inventory reservation and release with row-level locking
  - **Dead stock decay cron job** — configurable threshold (30 days), decay % (10%), max cap (50%)
  - Decay operates at lot level (not product level) for accurate aging
  - DecayAudit immutable records for compliance
  - PriceHistory location-scoped overrides (global catalog stays clean)
  - Reports: dead stock, decay history, low stock
  - Manual decay trigger endpoint for company admins and managers

- **API Documentation**
  - OpenAPI 3.0 spec with all endpoints documented
  - Swagger UI with realistic request/response examples
  - Standardized error responses (400, 401, 403, 404, 409, 422, 500)
  - Cursor-based pagination on all list endpoints

- **Testing**
  - Unit tests: decay formula, cursor pagination, password validation, JWT utils, error classes
  - Integration tests: full auth flow (register → login → refresh → logout), RBAC 403, inventory transfer atomicity, product CRUD
  - CI/CD: GitHub Actions (lint + test + Docker build)

### Deviations from Blueprint
- Added `RefreshToken` model to database schema (not in original spec) — required for token revocation
- Inventory receive endpoint uses `createMovementSchema` validation instead of separate schema — simplifies the API
- `inventory_lot.received_at` check constraint (`CHECK (received_at <= NOW())`) not enforced at DB level via Prisma — enforced at application level instead

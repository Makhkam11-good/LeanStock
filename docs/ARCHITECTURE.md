# ARCHITECTURE.md - LeanStock

## Overselling Prevention Strategy

LeanStock keeps all database access inside Prisma. Inventory transfers, reservations, and receipts run in Prisma transactions with optimistic conditional updates on the aggregate inventory rows and contributing FIFO lots.

### Why Optimistic Conditional Updates

The pre-defense requirement forbids raw SQL in application code. To preserve correctness without leaving Prisma, each mutation:
- reads the current inventory and lot state,
- validates available quantity and capacity,
- updates rows only when the previously observed quantities still match,
- aborts with a conflict if another transaction changed the same stock first.

This keeps the ORM boundary intact and still protects against overselling under concurrent requests. The API returns a retryable conflict for the caller when a race is detected.

### Transfer Flow

```
Transaction begins
  -> Read source inventory and FIFO lots
  -> Validate available quantity and destination capacity
  -> Conditionally decrement source inventory
  -> Conditionally decrement contributing lots
  -> Create destination child lots preserving lineage
  -> Increment destination inventory and update location volumes
  -> Create stock movement and audit log
Transaction commits
```

### Dead Stock Decay - Price Methodology

Decay creates location-scoped price overrides via `PriceHistory` records rather than modifying the global `Product.discount_percentage`. This means:
- The catalog price stays clean and globally consistent
- Location A can have 20% decay while Location B is at 0%
- The price audit trail is immutable and append-only

### Email and Background Jobs

Email verification, password reset, stock received, transfer completed, and dead-stock decay notifications are queued through Redis. The HTTP API only enqueues jobs; `npm run worker` processes delivery and retry state. This keeps user-facing requests fast and makes job status observable through `/api/v1/jobs/:id`.

### Tenant Isolation (Current Scope)

Sprint 1 uses a single-tenant deployment. The `UserWarehouse` junction table provides warehouse-level access control. Full multi-tenancy can be introduced later without changing the core inventory model.

### Inventory Lot Lineage

When stock transfers between locations, child lots are created at the destination with `parent_lot_id` pointing to the source lot. This preserves:
- FIFO valuation accuracy
- Original `received_at` date for decay calculations
- `unit_cost` from the original receipt
- Full transfer traceability via lot codes such as `LOT-001-XFER-abc12345`

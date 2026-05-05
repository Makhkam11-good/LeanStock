# ARCHITECTURE.md — LeanStock

## Overselling Prevention Strategy

**Chosen approach:** PostgreSQL `SELECT FOR UPDATE` (database-level locks)

### Why Database Locks, Not Redis

For LeanStock's inventory operations (transfers, reservations, sales deductions), correctness outweighs throughput. A Redis distributed lock (Redlock) introduces complexity around:
- Clock drift across nodes
- Split-brain scenarios
- Reconciliation jobs when Redis and PostgreSQL diverge

Since all inventory mutations already run inside PostgreSQL transactions, `SELECT FOR UPDATE` is the natural choice — the lock lives in the same ACID transaction as the data modification. No external coordination needed.

### SELECT FOR UPDATE Implementation

```
Transaction begins
  → Lock aggregate inventory row (SELECT FOR UPDATE)
  → Lock contributing lots in FIFO order (SELECT FOR UPDATE)
  → Validate available quantity >= requested
  → Consume lots in FIFO order
  → Update aggregate inventory bucket
  → Create audit log
Transaction commits (all locks released)
```

If another concurrent transaction attempts the same inventory row, it **waits** until the first transaction commits or rolls back.

### Dead Stock Decay — Price Methodology

Decay creates **location-scoped price overrides** via `PriceHistory` records rather than modifying the global `Product.discount_percentage`. This means:
- The catalog price stays clean and globally consistent
- Location A can have 20% decay while Location B is at 0%
- The price audit trail is fully immutable (append-only)

### Tenant Isolation (Current Scope)

Sprint 1 uses a single-tenant deployment. The `UserWarehouse` junction table provides warehouse-level access control. Full multi-tenancy (schema-per-tenant) is documented in the architecture spec for future sprints.

### Inventory Lot Lineage

When stock transfers between locations, child lots are created at the destination with `parent_lot_id` pointing to the source lot. This preserves:
- FIFO/LIFO valuation accuracy
- Original `received_at` date (for decay calculations)
- `unit_cost` from the original receipt
- Full transfer traceability via lot codes (e.g., `LOT-001-XFER-abc12345`)

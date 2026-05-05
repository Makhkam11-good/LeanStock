'use strict';

const { z } = require('zod');

// ── Auth ──────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR', 'SYSTEM_ADMIN']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

// ── Warehouse ─────────────────────────────────────────────────────────────────

const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
});

// ── Location ──────────────────────────────────────────────────────────────────

const createLocationSchema = z.object({
  warehouse_id: z.string().min(1),
  name: z.string().min(1).max(200),
  address: z.string().optional(),
  capacity_units: z.number().int().positive().default(1000),
});

// ── Product ───────────────────────────────────────────────────────────────────

const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.string().min(1).max(100),
  base_price: z.number().positive(),
  discount_percentage: z.number().int().min(0).max(100).default(0),
});

const updateProductSchema = createProductSchema.partial().omit({ sku: true });

// ── Stock Movement ────────────────────────────────────────────────────────────

const transferStockSchema = z.object({
  product_id: z.string().min(1),
  from_location_id: z.string().min(1),
  to_location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

const createMovementSchema = z.object({
  product_id: z.string().min(1),
  movement_type: z.enum(['INCOMING', 'OUTGOING', 'TRANSFER', 'ADJUSTMENT', 'WRITE_OFF']),
  quantity: z.number().int().positive(),
  from_location_id: z.string().optional(),
  to_location_id: z.string().optional(),
  reason: z.string().optional(),
  lot_code: z.string().optional(),
  unit_cost: z.number().positive().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  createWarehouseSchema,
  createLocationSchema,
  createProductSchema,
  updateProductSchema,
  transferStockSchema,
  createMovementSchema,
};

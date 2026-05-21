'use strict';

const { z } = require('zod');

// ── Auth ──────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR']).optional(),
  tenant_id: z.string().min(1).optional(),
});

const signupSchema = z.object({
  company_name: z.string().min(1).max(200),
  company_slug: z.string().min(2).max(80).regex(/^[a-zA-Z0-9-]+$/).optional(),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone: z.string().optional(),
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

const verifyEmailSchema = z.object({
  token: z.string().min(20),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  new_password: z.string().min(8),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

// ── Warehouse ─────────────────────────────────────────────────────────────────

const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
});

const updateWarehouseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  country: z.string().min(1).max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'MAINTENANCE']).optional(),
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
  location_id: z.string().min(1),
  movement_type: z.literal('INCOMING'),
  quantity: z.number().int().positive(),
  from_location_id: z.string().optional(),
  to_location_id: z.string().optional(),
  reason: z.string().optional(),
  lot_code: z.string().optional(),
  unit_cost: z.number().positive(),
});

const sellStockSchema = z.object({
  product_id: z.string().min(1),
  location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  contact_email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  lead_time_days: z.number().int().positive().max(365).default(7),
  products: z.array(z.object({
    product_id: z.string().min(1),
    supplier_sku: z.string().max(100).optional(),
    unit_cost: z.number().positive(),
    min_order_quantity: z.number().int().positive().default(1),
  })).optional(),
});

const updateSupplierSchema = createSupplierSchema.partial();

const createPurchaseOrderSchema = z.object({
  supplier_id: z.string().min(1),
  expected_at: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    product_id: z.string().min(1),
    location_id: z.string().min(1),
    quantity_ordered: z.number().int().positive(),
    unit_cost: z.number().positive(),
  })).min(1),
});

const updatePurchaseOrderSchema = z.object({
  expected_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const receivePurchaseOrderSchema = z.object({
  lines: z.array(z.object({
    line_id: z.string().min(1),
    quantity_received: z.number().int().positive(),
    lot_code: z.string().max(100).optional(),
  })).min(1),
});

module.exports = {
  registerSchema,
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  createLocationSchema,
  createProductSchema,
  updateProductSchema,
  transferStockSchema,
  createMovementSchema,
  sellStockSchema,
  createSupplierSchema,
  updateSupplierSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
};

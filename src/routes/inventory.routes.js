'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { authenticate } = require('../middleware/auth.middleware');
const { isOperator, isAuditor } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const { z } = require('zod');
const { transferStockSchema, createMovementSchema, sellStockSchema } = require('../utils/validators');

const reserveSchema = z.object({
  quantity: z.number().int().positive(),
  ttl_minutes: z.number().int().positive().max(1440).optional(),
  reason: z.string().max(300).optional(),
});
const releaseReservationSchema = z.object({
  quantity: z.number().int().positive(),
  reservation_id: z.string().min(1).optional(),
});

// All routes require authentication
router.use(authenticate);

// GET /inventory - List all inventory (all authenticated users)
router.get('/', isAuditor, ctrl.listInventory);

// GET /inventory/:id - Get single inventory record
router.get('/:id', isAuditor, ctrl.getInventory);

// POST /inventory/transfer - Transfer stock between locations atomically
router.post('/transfer', isOperator, validate(transferStockSchema), ctrl.transferStock);

// POST /inventory/receive - Receive new stock
router.post('/receive', isOperator, validate(createMovementSchema), ctrl.receiveStock);

// POST /inventory/sell - Sell stock from a location
router.post('/sell', isOperator, validate(sellStockSchema), ctrl.sellStock);

// POST /inventory/:id/reserve - Reserve inventory
router.post('/:id/reserve', isOperator, validate(reserveSchema), ctrl.reserveInventory);

// POST /inventory/:id/release-reservation - Release reservation
router.post('/:id/release-reservation', isOperator, validate(releaseReservationSchema), ctrl.releaseReservation);

module.exports = router;

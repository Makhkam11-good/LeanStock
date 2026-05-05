'use strict';

const express = require('express');
const warehouseRouter = express.Router();
const locationRouter = express.Router();
const ctrl = require('../controllers/warehouseController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager, isAuditor } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const { createWarehouseSchema, createLocationSchema } = require('../utils/validators');

// ── Warehouses ─────────────────────────────────────────────────────────────────
warehouseRouter.use(authenticate);

warehouseRouter.get('/', isAuditor, ctrl.listWarehouses);
warehouseRouter.get('/:id', isAuditor, ctrl.getWarehouse);
warehouseRouter.post('/', isManager, validate(createWarehouseSchema), ctrl.createWarehouse);
warehouseRouter.patch('/:id', isManager, ctrl.updateWarehouse);
warehouseRouter.post('/:id/close', isManager, ctrl.closeWarehouse);

// ── Locations ──────────────────────────────────────────────────────────────────
locationRouter.use(authenticate);

locationRouter.get('/', isAuditor, ctrl.listLocations);
locationRouter.get('/:id', isAuditor, ctrl.getLocation);
locationRouter.post('/', isManager, validate(createLocationSchema), ctrl.createLocation);
locationRouter.patch('/:id', isManager, ctrl.updateLocation);
locationRouter.delete('/:id', isManager, ctrl.deleteLocation);

module.exports = { warehouseRouter, locationRouter };

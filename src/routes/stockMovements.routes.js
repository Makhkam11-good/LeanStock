'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stockMovementController');
const { authenticate } = require('../middleware/auth.middleware');
const { isAuditor } = require('../middleware/rbac.middleware');

router.use(authenticate);

router.get('/', isAuditor, ctrl.listStockMovements);
router.get('/:id', isAuditor, ctrl.getStockMovement);

module.exports = router;

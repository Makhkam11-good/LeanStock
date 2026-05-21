'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager, isAuditor } = require('../middleware/rbac.middleware');

router.use(authenticate);

// GET /reports/dead-stock
router.get('/dead-stock', isAuditor, ctrl.getDeadStockReport);

// GET /reports/decay-history
router.get('/decay-history', isAuditor, ctrl.getDecayHistory);

// GET /reports/low-stock
router.get('/low-stock', isAuditor, ctrl.getLowStockReport);

// GET /reports/reorder-forecast
router.get('/reorder-forecast', isAuditor, ctrl.getReorderForecast);

// POST /reports/trigger-decay (manual trigger, company admin / manager)
router.post('/trigger-decay', isManager, ctrl.triggerDecayManually);

module.exports = router;

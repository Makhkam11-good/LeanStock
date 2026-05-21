'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchaseOrderController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager, isAuditor } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
} = require('../utils/validators');

router.use(authenticate);

router.get('/', isAuditor, ctrl.listPurchaseOrders);
router.get('/:id', isAuditor, ctrl.getPurchaseOrder);
router.post('/', isManager, validate(createPurchaseOrderSchema), ctrl.createPurchaseOrder);
router.patch('/:id', isManager, validate(updatePurchaseOrderSchema), ctrl.updatePurchaseOrder);
router.post('/:id/submit', isManager, ctrl.submitPurchaseOrder);
router.post('/:id/approve', isManager, ctrl.approvePurchaseOrder);
router.post('/:id/receive', isManager, validate(receivePurchaseOrderSchema), ctrl.receivePurchaseOrder);
router.post('/:id/cancel', isManager, ctrl.cancelPurchaseOrder);

module.exports = router;

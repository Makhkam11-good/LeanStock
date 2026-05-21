'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/supplierController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager, isAuditor } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const { createSupplierSchema, updateSupplierSchema } = require('../utils/validators');

router.use(authenticate);

router.get('/', isAuditor, ctrl.listSuppliers);
router.get('/:id', isAuditor, ctrl.getSupplier);
router.post('/', isManager, validate(createSupplierSchema), ctrl.createSupplier);
router.patch('/:id', isManager, validate(updateSupplierSchema), ctrl.updateSupplier);
router.delete('/:id', isManager, ctrl.deactivateSupplier);

module.exports = router;

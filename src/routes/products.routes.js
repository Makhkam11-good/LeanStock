'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager, isAuditor } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const { createProductSchema, updateProductSchema } = require('../utils/validators');

router.use(authenticate);

// GET /products - List products with pagination
router.get('/', isAuditor, ctrl.listProducts);

// GET /products/:id
router.get('/:id', isAuditor, ctrl.getProduct);

// POST /products - Create product (Manager only)
router.post('/', isManager, validate(createProductSchema), ctrl.createProduct);

// PATCH /products/:id - Update product
router.patch('/:id', isManager, validate(updateProductSchema), ctrl.updateProduct);

// DELETE /products/:id/discontinue
router.post('/:id/discontinue', isManager, ctrl.discontinueProduct);

module.exports = router;

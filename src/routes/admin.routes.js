'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/rbac.middleware');

router.use(authenticate);
router.use(isAdmin);

router.get('/tenants', ctrl.listTenants);
router.get('/tenants/:id', ctrl.getTenant);
router.patch('/tenants/:id/activate', ctrl.activateTenant);
router.patch('/tenants/:id/deactivate', ctrl.deactivateTenant);

module.exports = router;

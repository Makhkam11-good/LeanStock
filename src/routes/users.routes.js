'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { authenticate } = require('../middleware/auth.middleware');
const { isCompanyAdmin } = require('../middleware/rbac.middleware');

router.use(authenticate);

router.get('/', isCompanyAdmin, ctrl.listUsers);

module.exports = router;

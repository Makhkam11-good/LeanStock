'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/jobController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager } = require('../middleware/rbac.middleware');

router.use(authenticate);

router.get('/:id', isManager, ctrl.getJobStatus);

module.exports = router;

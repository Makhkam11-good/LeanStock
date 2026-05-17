'use strict';

const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const inventoryRoutes = require('./inventory.routes');
const productRoutes = require('./products.routes');
const { warehouseRouter, locationRouter } = require('./warehouses.routes');
const reportRoutes = require('./reports.routes');
const jobRoutes = require('./jobs.routes');
const adminRoutes = require('./admin.routes');

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/products', productRoutes);
router.use('/warehouses', warehouseRouter);
router.use('/locations', locationRouter);
router.use('/reports', reportRoutes);
router.use('/jobs', jobRoutes);

module.exports = router;

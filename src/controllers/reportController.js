'use strict';

const decaySvc = require('../services/decayService');
const { success } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getPrismaClient } = require('../config/database');
const { enqueueJob } = require('../jobs/redisQueue');
const { QUEUE_DECAY_NAME } = require('../config/env');

const prisma = getPrismaClient();

const getDeadStockReport = asyncHandler(async (req, res) => {
  const thresholdDays = parseInt(req.query.threshold_days || '30', 10);
  const report = await decaySvc.getDeadStockReport(thresholdDays);
  return success(res, { dead_stock_lots: report, count: report.length });
});

const getDecayHistory = asyncHandler(async (req, res) => {
  const { product_id, location_id } = req.query;
  const where = {};
  if (product_id) where.product_id = product_id;
  if (location_id) where.location_id = location_id;

  const history = await prisma.decayAudit.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
    include: {
      product: { select: { sku: true, name: true } },
      inventory_lot: { select: { lot_code: true } },
    },
  });
  return success(res, history);
});

const getLowStockReport = asyncHandler(async (req, res) => {
  const items = await prisma.inventory.findMany({
    where: {
      location: { is: { warehouse: { is: { is_hidden: false } } } },
    },
    include: {
      product: { select: { sku: true, name: true, category: true } },
      location: { select: { name: true, warehouse: { select: { name: true } } } },
    },
    take: 200,
  });
  // filter in JS since Prisma can't easily compare two columns
  const lowStock = items.filter(i => i.quantity_on_hand <= i.reorder_point);
  return success(res, { low_stock_items: lowStock, count: lowStock.length });
});

const triggerDecayManually = asyncHandler(async (req, res) => {
  if (req.query.mode === 'sync') {
    const result = await decaySvc.applyDeadStockDecay();
    return success(res, { message: 'Dead stock decay applied', ...result });
  }

  const job = await enqueueJob(QUEUE_DECAY_NAME, 'dead-stock.decay', {
    requested_by: req.user.sub,
    thresholdDays: Number(req.body?.threshold_days || req.query.threshold_days || 30),
  });
  return success(res, { message: 'Dead stock decay job queued', job });
});

module.exports = { getDeadStockReport, getDecayHistory, getLowStockReport, triggerDecayManually };

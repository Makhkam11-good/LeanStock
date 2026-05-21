'use strict';

const decaySvc = require('../services/decayService');
const { success } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getPrismaClient } = require('../config/database');
const { enqueueJob } = require('../jobs/redisQueue');
const { QUEUE_DECAY_NAME } = require('../config/env');
const { getTenantId, isSystemAdmin, requireTenantId } = require('../utils/tenantScope');
const forecastService = require('../services/forecastService');
const { enqueueEmail } = require('../services/emailService');

const prisma = getPrismaClient();

function requestTenantId(user) {
  if (isSystemAdmin(user) && !getTenantId(user)) return undefined;
  return requireTenantId(user);
}

function requestTenantWhere(user) {
  const tenantId = requestTenantId(user);
  return tenantId ? { tenant_id: tenantId } : {};
}

const getDeadStockReport = asyncHandler(async (req, res) => {
  const thresholdDays = parseInt(req.query.threshold_days || '30', 10);
  const report = await decaySvc.getDeadStockReport(thresholdDays, { tenantId: requestTenantId(req.user) });
  return success(res, { dead_stock_lots: report, count: report.length });
});

const getDecayHistory = asyncHandler(async (req, res) => {
  const { product_id, location_id } = req.query;
  const where = { product: { is: requestTenantWhere(req.user) } };
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
      product: { is: requestTenantWhere(req.user) },
      location: { is: { warehouse: { is: { is_hidden: false, ...requestTenantWhere(req.user) } } } },
    },
    include: {
      product: { select: { sku: true, name: true, category: true } },
      location: { select: { name: true, warehouse: { select: { name: true } } } },
    },
    take: 200,
  });
  // filter in JS since Prisma can't easily compare two columns
  const lowStock = items.filter(i => i.quantity_on_hand <= i.reorder_point);
  if (lowStock.length > 0 && req.query.notify === 'true') {
    const managers = await prisma.user.findMany({
      where: {
        ...requestTenantWhere(req.user),
        role: { in: ['COMPANY_ADMIN', 'MANAGER'] },
        is_active: true,
        is_email_verified: true,
      },
      select: { email: true },
      take: 20,
    });
    await Promise.all(managers.map(manager => enqueueEmail({
      to: manager.email,
      event_type: 'inventory.low_stock_alert',
      subject: 'LeanStock low stock alert',
      text: `${lowStock.length} inventory item(s) are at or below reorder point.`,
      html: `<p>${lowStock.length} inventory item(s) are at or below reorder point.</p>`,
    })));
  }
  return success(res, { low_stock_items: lowStock, count: lowStock.length });
});

const getReorderForecast = asyncHandler(async (req, res) => {
  const forecast = await forecastService.getReorderForecast(req.query, req.user);
  return success(res, { suggestions: forecast, count: forecast.length });
});

const triggerDecayManually = asyncHandler(async (req, res) => {
  const tenantId = requestTenantId(req.user);
  if (req.query.mode === 'sync') {
    const result = await decaySvc.applyDeadStockDecay({ tenantId });
    return success(res, { message: 'Dead stock decay applied', ...result });
  }

  const job = await enqueueJob(QUEUE_DECAY_NAME, 'dead-stock.decay', {
    requested_by: req.user.sub,
    tenantId,
    thresholdDays: Number(req.body?.threshold_days || req.query.threshold_days || 30),
  });
  return success(res, { message: 'Dead stock decay job queued', job });
});

module.exports = { getDeadStockReport, getDecayHistory, getLowStockReport, getReorderForecast, triggerDecayManually };

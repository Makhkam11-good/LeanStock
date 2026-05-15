'use strict';

const { getPrismaClient } = require('../config/database');
const { DEAD_STOCK_THRESHOLD_DAYS, DEAD_STOCK_DECAY_PERCENT, DEAD_STOCK_DECAY_MAX_PERCENT, SYSTEM_USER_ID } = require('../config/env');
const { enqueueEmail } = require('./emailService');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

function daysBetween(start, end = new Date()) {
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function tenantFilter(tenantId) {
  return tenantId ? { tenant_id: tenantId } : {};
}

function toDeadStockCandidate(lot) {
  return {
    inventory_lot_id: lot.id,
    lot_code: lot.lot_code,
    received_at: lot.received_at,
    quantity_on_hand: lot.quantity_on_hand,
    last_decay_applied_at: lot.last_decay_applied_at,
    inventory_id: lot.inventory_id,
    location_id: lot.inventory.location_id,
    product_id: lot.inventory.product.id,
    tenant_id: lot.inventory.product.tenant_id,
    sku: lot.inventory.product.sku,
    name: lot.inventory.product.name,
    base_price: Number(lot.inventory.product.base_price),
    catalog_discount: lot.inventory.product.discount_percentage,
    days_in_stock: daysBetween(lot.received_at),
  };
}

async function findDeadStockCandidates(thresholdDays = DEAD_STOCK_THRESHOLD_DAYS, options = {}) {
  const { tenantId } = options;
  const thresholdDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const decayWindowStart = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const lots = await prisma.inventoryLot.findMany({
    where: {
      quantity_on_hand: { gt: 0 },
      received_at: { lte: thresholdDate },
      OR: [
        { last_decay_applied_at: null },
        { last_decay_applied_at: { lte: decayWindowStart } },
      ],
      inventory: {
        product: { is: { is_discontinued: false, ...tenantFilter(tenantId) } },
        location: {
          is: {
            warehouse: {
              is: {
                is_hidden: false,
                status: 'ACTIVE',
                ...tenantFilter(tenantId),
              },
            },
          },
        },
      },
    },
    orderBy: [{ received_at: 'asc' }, { created_at: 'asc' }],
    take: 100,
    include: {
      inventory: {
        include: {
          product: true,
          location: { include: { warehouse: true } },
        },
      },
    },
  });

  return lots.map(toDeadStockCandidate);
}

async function queueDecaySummaryEmail(result, tenantId) {
  if (!result.processed) return;

  const managers = await prisma.user.findMany({
    where: {
      role: tenantId ? 'MANAGER' : { in: ['MANAGER', 'SYSTEM_ADMIN'] },
      ...(tenantId ? { tenant_id: tenantId } : {}),
      is_active: true,
      is_email_verified: true,
    },
    select: { email: true },
    take: 20,
  });

  await Promise.all(managers.map(manager => enqueueEmail({
    to: manager.email,
    event_type: 'inventory.dead_stock_decay',
    subject: 'LeanStock dead stock decay completed',
    text: `Dead stock decay completed. Processed ${result.processed} lots, skipped ${result.skipped}.`,
    html: `<p>Dead stock decay completed.</p><p>Processed ${result.processed} lots, skipped ${result.skipped}.</p>`,
  })));
}

async function applyDeadStockDecay(options = {}) {
  const decayPercent = options.decayPercent || DEAD_STOCK_DECAY_PERCENT;
  const maxDiscount = options.maxDiscount || DEAD_STOCK_DECAY_MAX_PERCENT;
  const thresholdDays = options.thresholdDays || DEAD_STOCK_THRESHOLD_DAYS;
  const systemUserId = options.systemUserId || SYSTEM_USER_ID;
  const tenantId = options.tenantId;

  logger.info(`[DecayJob] Starting dead stock decay (threshold: ${thresholdDays} days, decay: ${decayPercent}%, max: ${maxDiscount}%)`);

  const candidates = await findDeadStockCandidates(thresholdDays, { tenantId });

  if (candidates.length === 0) {
    logger.info('[DecayJob] No dead stock candidates found');
    return { processed: 0, skipped: 0, total: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const lot of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        const oldDiscount = lot.catalog_discount;
        const newDiscount = Math.min(oldDiscount + decayPercent, maxDiscount);

        if (oldDiscount >= maxDiscount) {
          skipped++;
          return;
        }

        await tx.priceHistory.create({
          data: {
            product_id: lot.product_id,
            location_id: lot.location_id,
            user_id: systemUserId,
            price: lot.base_price,
            discount_percentage: newDiscount,
            reason: 'DEAD_STOCK_DECAY',
            effective_from: new Date(),
          },
        });

        const lotUpdate = await tx.inventoryLot.updateMany({
          where: {
            id: lot.inventory_lot_id,
            last_decay_applied_at: lot.last_decay_applied_at,
          },
          data: { last_decay_applied_at: new Date() },
        });

        if (lotUpdate.count !== 1) {
          skipped++;
          return;
        }

        await tx.decayAudit.create({
          data: {
            inventory_lot_id: lot.inventory_lot_id,
            product_id: lot.product_id,
            location_id: lot.location_id,
            old_discount_pct: oldDiscount,
            new_discount_pct: newDiscount,
            days_in_inventory: lot.days_in_stock,
            automatic_trigger_at: new Date(),
          },
        });

        processed++;
      });
    } catch (err) {
      logger.error(`[DecayJob] Failed to process lot ${lot.inventory_lot_id}: ${err.message}`);
      skipped++;
    }
  }

  const result = { processed, skipped, total: candidates.length };
  await queueDecaySummaryEmail(result, tenantId);
  logger.info(`[DecayJob] Decay complete. Processed: ${processed}, Skipped: ${skipped}`);
  return result;
}

async function getDeadStockReport(thresholdDays = DEAD_STOCK_THRESHOLD_DAYS, options = {}) {
  return findDeadStockCandidates(thresholdDays, options);
}

module.exports = { findDeadStockCandidates, applyDeadStockDecay, getDeadStockReport, daysBetween };

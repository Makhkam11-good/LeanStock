'use strict';

const { getPrismaClient } = require('../config/database');
const { DEAD_STOCK_THRESHOLD_DAYS, DEAD_STOCK_DECAY_PERCENT, DEAD_STOCK_DECAY_MAX_PERCENT, SYSTEM_USER_ID } = require('../config/env');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * Find all inventory lots that qualify for dead stock decay:
 *  - Older than threshold days
 *  - Still have stock
 *  - Not decayed in the last 72 hours
 */
async function findDeadStockCandidates(thresholdDays = DEAD_STOCK_THRESHOLD_DAYS) {
  const thresholdDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const decayWindowStart = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const candidates = await prisma.$queryRaw`
    SELECT
      il.id          AS inventory_lot_id,
      il.lot_code,
      il.received_at,
      il.quantity_on_hand,
      il.last_decay_applied_at,
      i.id           AS inventory_id,
      i.location_id,
      p.id           AS product_id,
      p.sku,
      p.name,
      CAST(p.base_price AS FLOAT)           AS base_price,
      p.discount_percentage                 AS catalog_discount,
      EXTRACT(DAY FROM NOW() - il.received_at)::INT AS days_in_stock
    FROM "InventoryLot" il
    JOIN "Inventory" i  ON i.id = il.inventory_id
    JOIN "Product"   p  ON p.id = i.product_id
    WHERE p.is_discontinued = false
      AND il.quantity_on_hand > 0
      AND il.received_at <= ${thresholdDate}
      AND (
        il.last_decay_applied_at IS NULL
        OR il.last_decay_applied_at <= ${decayWindowStart}
      )
    ORDER BY il.received_at ASC
    LIMIT 100
  `;

  return candidates;
}

/**
 * Apply dead stock decay to all qualifying lots.
 * Configurable: decay % and max % from environment variables.
 * Returns stats about what was processed.
 */
async function applyDeadStockDecay(options = {}) {
  const decayPercent = options.decayPercent || DEAD_STOCK_DECAY_PERCENT;
  const maxDiscount = options.maxDiscount || DEAD_STOCK_DECAY_MAX_PERCENT;
  const thresholdDays = options.thresholdDays || DEAD_STOCK_THRESHOLD_DAYS;
  const systemUserId = options.systemUserId || SYSTEM_USER_ID;

  logger.info(`[DecayJob] Starting dead stock decay (threshold: ${thresholdDays} days, decay: ${decayPercent}%, max: ${maxDiscount}%)`);

  const candidates = await findDeadStockCandidates(thresholdDays);

  if (candidates.length === 0) {
    logger.info('[DecayJob] No dead stock candidates found');
    return { processed: 0, skipped: 0 };
  }

  logger.info(`[DecayJob] Found ${candidates.length} lots to process`);

  let processed = 0;
  let skipped = 0;

  for (const lot of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        const oldDiscount = lot.catalog_discount;
        const newDiscount = Math.min(oldDiscount + decayPercent, maxDiscount);

        if (oldDiscount >= maxDiscount) {
          skipped++;
          return; // Already at max discount, skip
        }

        // Create location-scoped price override (keeps global catalog clean)
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

        // Mark lot as decayed
        await tx.inventoryLot.update({
          where: { id: lot.inventory_lot_id },
          data: { last_decay_applied_at: new Date() },
        });

        // Record decay audit
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

        logger.info(
          `[DecayJob] ${lot.sku} | lot ${lot.lot_code} | ${oldDiscount}% → ${newDiscount}% | ${lot.days_in_stock} days old`
        );

        processed++;
      });
    } catch (err) {
      logger.error(`[DecayJob] Failed to process lot ${lot.inventory_lot_id}: ${err.message}`);
      skipped++;
    }
  }

  logger.info(`[DecayJob] Decay complete. Processed: ${processed}, Skipped: ${skipped}`);
  return { processed, skipped, total: candidates.length };
}

/**
 * Get dead stock report
 */
async function getDeadStockReport(thresholdDays = DEAD_STOCK_THRESHOLD_DAYS) {
  const candidates = await findDeadStockCandidates(thresholdDays);
  return candidates;
}

module.exports = { findDeadStockCandidates, applyDeadStockDecay, getDeadStockReport };

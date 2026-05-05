'use strict';

const { getPrismaClient } = require('../config/database');
const { InsufficientStockError, CapacityExceededError, NotFoundError, ConflictError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * CORE LEANSTOCK FEATURE: Atomic stock transfer between two locations
 * Uses SELECT FOR UPDATE to prevent race conditions / overselling
 */
async function transferStockBetweenLocations({ product_id, from_location_id, to_location_id, quantity, user_id, reason }) {
  if (from_location_id === to_location_id) {
    throw new ConflictError('Source and destination locations must be different');
  }

  return await prisma.$transaction(
    async (tx) => {
      // ── Step 1: Lock source inventory row (SELECT FOR UPDATE) ──────────────
      const sourceInv = await tx.$queryRaw`
        SELECT id, quantity_on_hand, quantity_reserved
        FROM "Inventory"
        WHERE product_id = ${product_id}
          AND location_id = ${from_location_id}
        FOR UPDATE
      `;

      if (!sourceInv || sourceInv.length === 0) {
        throw new NotFoundError('Source inventory');
      }

      const available = sourceInv[0].quantity_on_hand - sourceInv[0].quantity_reserved;
      if (available < quantity) {
        throw new InsufficientStockError(
          `Only ${available} units available at source location (${quantity} requested)`
        );
      }

      // ── Step 2: Ensure destination inventory bucket exists ─────────────────
      await tx.inventory.upsert({
        where: { product_id_location_id: { product_id, location_id: to_location_id } },
        update: {},
        create: {
          product_id,
          location_id: to_location_id,
          quantity_on_hand: 0,
          quantity_reserved: 0,
          reorder_point: 50,
          max_stock_level: 500,
        },
      });

      // Lock destination inventory row
      const destInv = await tx.$queryRaw`
        SELECT id, quantity_on_hand, max_stock_level
        FROM "Inventory"
        WHERE product_id = ${product_id}
          AND location_id = ${to_location_id}
        FOR UPDATE
      `;

      // ── Step 3: Check destination capacity ────────────────────────────────
      const destLocation = await tx.location.findUnique({ where: { id: to_location_id } });
      if (!destLocation) throw new NotFoundError('Destination location');

      if (destLocation.current_volume + quantity > destLocation.capacity_units) {
        throw new CapacityExceededError(
          `Destination location capacity exceeded (${destLocation.current_volume + quantity} > ${destLocation.capacity_units})`
        );
      }

      // ── Step 4: Lock source lots in FIFO order ────────────────────────────
      const sourceLots = await tx.$queryRaw`
        SELECT id, lot_code, received_at, unit_cost, quantity_on_hand, quantity_reserved
        FROM "InventoryLot"
        WHERE inventory_id = ${sourceInv[0].id}
          AND quantity_on_hand > 0
        ORDER BY received_at ASC, created_at ASC
        FOR UPDATE
      `;

      // ── Step 5: Create movement record ────────────────────────────────────
      const movement = await tx.stockMovement.create({
        data: {
          product_id,
          user_id,
          from_location_id,
          to_location_id,
          quantity,
          movement_type: 'TRANSFER',
          status: 'COMPLETED',
          reason: reason || null,
          approved_at: new Date(),
          completed_at: new Date(),
        },
      });

      // ── Step 6: Move quantity lot-by-lot (preserve FIFO lineage) ──────────
      let remaining = quantity;

      for (const lot of sourceLots) {
        if (remaining <= 0) break;

        const lotAvailable = lot.quantity_on_hand - lot.quantity_reserved;
        if (lotAvailable <= 0) continue;

        const moveQty = Math.min(lotAvailable, remaining);

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { quantity_on_hand: { decrement: moveQty } },
        });

        // Create child lot at destination preserving lineage
        await tx.inventoryLot.create({
          data: {
            inventory_id: destInv[0].id,
            parent_lot_id: lot.id,
            lot_code: `${lot.lot_code}-XFER-${movement.id.slice(-8)}`,
            quantity_received: moveQty,
            quantity_on_hand: moveQty,
            quantity_reserved: 0,
            unit_cost: lot.unit_cost,
            received_at: lot.received_at,
          },
        });

        remaining -= moveQty;
      }

      if (remaining > 0) {
        throw new InsufficientStockError('Source lots have insufficient quantity for this transfer');
      }

      // ── Step 7: Update aggregate inventory buckets ────────────────────────
      await Promise.all([
        tx.inventory.update({
          where: { id: sourceInv[0].id },
          data: { quantity_on_hand: { decrement: quantity } },
        }),
        tx.inventory.update({
          where: { id: destInv[0].id },
          data: { quantity_on_hand: { increment: quantity } },
        }),
        tx.location.update({
          where: { id: from_location_id },
          data: { current_volume: { decrement: quantity } },
        }),
        tx.location.update({
          where: { id: to_location_id },
          data: { current_volume: { increment: quantity } },
        }),
      ]);

      // ── Step 8: Audit log ──────────────────────────────────────────────────
      await tx.auditLog.create({
        data: {
          user_id,
          action: 'TRANSFER_COMPLETED',
          entity_type: 'INVENTORY',
          entity_id: sourceInv[0].id,
          old_value: { location: from_location_id, quantity: Number(sourceInv[0].quantity_on_hand) },
          new_value: { location: from_location_id, quantity: Number(sourceInv[0].quantity_on_hand) - quantity },
          reason: reason || null,
        },
      });

      logger.info(`Transfer completed: ${quantity} units of product ${product_id} from ${from_location_id} to ${to_location_id}`);

      return { movement, transferred_quantity: quantity };
    },
    { isolationLevel: 'Serializable', timeout: 30000 }
  );
}

/**
 * Receive incoming stock (creates inventory lot)
 */
async function receiveStock({ product_id, location_id, quantity, unit_cost, lot_code, user_id }) {
  return await prisma.$transaction(async (tx) => {
    // Upsert inventory bucket
    const inventory = await tx.inventory.upsert({
      where: { product_id_location_id: { product_id, location_id } },
      update: { quantity_on_hand: { increment: quantity } },
      create: {
        product_id,
        location_id,
        quantity_on_hand: quantity,
        quantity_reserved: 0,
        reorder_point: 50,
        max_stock_level: 500,
      },
    });

    // Create inventory lot
    const finalLotCode = lot_code || `LOT-${Date.now()}-${product_id.slice(-6)}`;
    const lot = await tx.inventoryLot.create({
      data: {
        inventory_id: inventory.id,
        lot_code: finalLotCode,
        quantity_received: quantity,
        quantity_on_hand: quantity,
        unit_cost,
        received_at: new Date(),
      },
    });

    // Create movement record
    const movement = await tx.stockMovement.create({
      data: {
        product_id,
        user_id,
        to_location_id: location_id,
        quantity,
        movement_type: 'INCOMING',
        status: 'COMPLETED',
        approved_at: new Date(),
        completed_at: new Date(),
      },
    });

    // Update location volume
    await tx.location.update({
      where: { id: location_id },
      data: { current_volume: { increment: quantity } },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        user_id,
        action: 'STOCK_RECEIVED',
        entity_type: 'INVENTORY',
        entity_id: inventory.id,
        new_value: { lot_code: finalLotCode, quantity, unit_cost: Number(unit_cost) },
      },
    });

    return { inventory, lot, movement };
  });
}

/**
 * List inventory with cursor-based pagination
 */
async function listInventory(query) {
  const { limit, cursor } = getPaginationParams(query);
  const { product_id, location_id, low_stock } = query;

  const where = {};
  if (product_id) where.product_id = product_id;
  if (location_id) where.location_id = location_id;
  if (low_stock === 'true') {
    where.quantity_on_hand = { lte: prisma.inventory.fields.reorder_point };
  }
  if (cursor) {
    where.id = { gt: cursor.id };
  }

  const items = await prisma.inventory.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: {
      product: { select: { sku: true, name: true, category: true, base_price: true } },
      location: {
        select: { name: true, warehouse: { select: { name: true } } },
      },
    },
  });

  return buildPaginationResponse(items, limit);
}

async function getInventoryById(id) {
  const inv = await prisma.inventory.findUnique({
    where: { id },
    include: {
      product: true,
      location: { include: { warehouse: true } },
      inventory_lots: { where: { quantity_on_hand: { gt: 0 } }, orderBy: { received_at: 'asc' } },
    },
  });
  if (!inv) throw new NotFoundError('Inventory record');
  return inv;
}

/**
 * Reserve inventory quantity (for pending orders)
 */
async function reserveInventory({ inventory_id, quantity, user_id }) {
  return await prisma.$transaction(async (tx) => {
    const inv = await tx.$queryRaw`
      SELECT id, quantity_on_hand, quantity_reserved
      FROM "Inventory"
      WHERE id = ${inventory_id}
      FOR UPDATE NOWAIT
    `;

    if (!inv || inv.length === 0) throw new NotFoundError('Inventory record');

    const available = inv[0].quantity_on_hand - inv[0].quantity_reserved;
    if (available < quantity) {
      throw new InsufficientStockError(`Only ${available} available to reserve`);
    }

    const updated = await tx.inventory.update({
      where: { id: inventory_id },
      data: { quantity_reserved: { increment: quantity } },
    });

    await tx.auditLog.create({
      data: {
        user_id,
        action: 'STOCK_RESERVED',
        entity_type: 'INVENTORY',
        entity_id: inventory_id,
        old_value: { reserved: Number(inv[0].quantity_reserved) },
        new_value: { reserved: updated.quantity_reserved },
      },
    });

    return updated;
  });
}

/**
 * Release reserved inventory
 */
async function releaseReservation({ inventory_id, quantity, user_id }) {
  return await prisma.$transaction(async (tx) => {
    const inv = await tx.$queryRaw`
      SELECT id, quantity_reserved
      FROM "Inventory"
      WHERE id = ${inventory_id}
      FOR UPDATE NOWAIT
    `;

    if (!inv || inv.length === 0) throw new NotFoundError('Inventory record');
    if (inv[0].quantity_reserved < quantity) {
      throw new ConflictError(`Cannot release ${quantity} — only ${inv[0].quantity_reserved} reserved`);
    }

    const updated = await tx.inventory.update({
      where: { id: inventory_id },
      data: { quantity_reserved: { decrement: quantity } },
    });

    await tx.auditLog.create({
      data: {
        user_id,
        action: 'RESERVATION_RELEASED',
        entity_type: 'INVENTORY',
        entity_id: inventory_id,
        old_value: { reserved: Number(inv[0].quantity_reserved) },
        new_value: { reserved: updated.quantity_reserved },
      },
    });

    return updated;
  });
}

module.exports = {
  transferStockBetweenLocations,
  receiveStock,
  listInventory,
  getInventoryById,
  reserveInventory,
  releaseReservation,
};

'use strict';

const { getPrismaClient } = require('../config/database');
const { InsufficientStockError, CapacityExceededError, NotFoundError, ConflictError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { enqueueEmail } = require('./emailService');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

function assertOperationalLocation(location, label) {
  if (!location) throw new NotFoundError(`${label} location`);
  if (location.warehouse.is_hidden) {
    throw new ConflictError(`${label} location belongs to a hidden warehouse`);
  }
  if (location.warehouse.status !== 'ACTIVE') {
    throw new ConflictError(`${label} location belongs to a warehouse that is not active`);
  }
}

async function queueInventoryEventEmail(userId, message) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return null;
  return enqueueEmail({ to: user.email, ...message });
}

async function transferStockBetweenLocations({ product_id, from_location_id, to_location_id, quantity, user_id, reason }) {
  if (from_location_id === to_location_id) {
    throw new ConflictError('Source and destination locations must be different');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const locations = await tx.location.findMany({
        where: { id: { in: [from_location_id, to_location_id] } },
        include: { warehouse: { select: { is_hidden: true, status: true } } },
      });
      const locationById = new Map(locations.map(location => [location.id, location]));
      const sourceLocation = locationById.get(from_location_id);
      const destLocation = locationById.get(to_location_id);

      assertOperationalLocation(sourceLocation, 'Source');
      assertOperationalLocation(destLocation, 'Destination');

      const sourceInv = await tx.inventory.findUnique({
        where: { product_id_location_id: { product_id, location_id: from_location_id } },
        include: {
          inventory_lots: {
            where: { quantity_on_hand: { gt: 0 } },
            orderBy: [{ received_at: 'asc' }, { created_at: 'asc' }],
          },
        },
      });
      if (!sourceInv) throw new NotFoundError('Source inventory');

      const available = sourceInv.quantity_on_hand - sourceInv.quantity_reserved;
      if (available < quantity) {
        throw new InsufficientStockError(
          `Only ${available} units available at source location (${quantity} requested)`
        );
      }

      const destInv = await tx.inventory.upsert({
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

      if (destLocation.current_volume + quantity > destLocation.capacity_units) {
        throw new CapacityExceededError(
          `Destination location capacity exceeded (${destLocation.current_volume + quantity} > ${destLocation.capacity_units})`
        );
      }

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

      const sourceUpdate = await tx.inventory.updateMany({
        where: {
          id: sourceInv.id,
          quantity_on_hand: sourceInv.quantity_on_hand,
          quantity_reserved: sourceInv.quantity_reserved,
        },
        data: { quantity_on_hand: { decrement: quantity } },
      });
      if (sourceUpdate.count !== 1) {
        throw new ConflictError('Inventory changed during transfer, please retry');
      }

      let remaining = quantity;
      for (const lot of sourceInv.inventory_lots) {
        if (remaining <= 0) break;

        const lotAvailable = lot.quantity_on_hand - lot.quantity_reserved;
        if (lotAvailable <= 0) continue;

        const moveQty = Math.min(lotAvailable, remaining);
        const lotUpdate = await tx.inventoryLot.updateMany({
          where: {
            id: lot.id,
            quantity_on_hand: lot.quantity_on_hand,
            quantity_reserved: lot.quantity_reserved,
          },
          data: { quantity_on_hand: { decrement: moveQty } },
        });
        if (lotUpdate.count !== 1) {
          throw new ConflictError('Inventory lot changed during transfer, please retry');
        }

        await tx.inventoryLot.create({
          data: {
            inventory_id: destInv.id,
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

      const destVolumeUpdate = await tx.location.updateMany({
        where: {
          id: to_location_id,
          current_volume: { lte: destLocation.capacity_units - quantity },
        },
        data: { current_volume: { increment: quantity } },
      });
      if (destVolumeUpdate.count !== 1) {
        throw new CapacityExceededError('Destination location capacity changed during transfer');
      }

      await Promise.all([
        tx.inventory.update({
          where: { id: destInv.id },
          data: { quantity_on_hand: { increment: quantity } },
        }),
        tx.location.update({
          where: { id: from_location_id },
          data: { current_volume: { decrement: quantity } },
        }),
      ]);

      await tx.auditLog.create({
        data: {
          user_id,
          action: 'TRANSFER_COMPLETED',
          entity_type: 'INVENTORY',
          entity_id: sourceInv.id,
          old_value: { location: from_location_id, quantity: sourceInv.quantity_on_hand },
          new_value: { location: from_location_id, quantity: sourceInv.quantity_on_hand - quantity },
          reason: reason || null,
        },
      });

      logger.info(`Transfer completed: ${quantity} units of product ${product_id} from ${from_location_id} to ${to_location_id}`);
      return { movement, transferred_quantity: quantity };
    },
    { isolationLevel: 'Serializable', timeout: 30000 }
  );

  await queueInventoryEventEmail(user_id, {
    event_type: 'inventory.transfer_completed',
    subject: 'LeanStock transfer completed',
    text: `Transfer completed for product ${product_id}: ${quantity} units moved.`,
    html: `<p>Transfer completed for product <strong>${product_id}</strong>: ${quantity} units moved.</p>`,
  });

  return result;
}

async function receiveStock({ product_id, location_id, quantity, unit_cost, lot_code, user_id }) {
  const result = await prisma.$transaction(async (tx) => {
    const location = await tx.location.findUnique({
      where: { id: location_id },
      include: { warehouse: { select: { is_hidden: true, status: true } } },
    });
    assertOperationalLocation(location, 'Destination');

    if (location.current_volume + quantity > location.capacity_units) {
      throw new CapacityExceededError(
        `Destination location capacity exceeded (${location.current_volume + quantity} > ${location.capacity_units})`
      );
    }

    const volumeUpdate = await tx.location.updateMany({
      where: {
        id: location_id,
        current_volume: { lte: location.capacity_units - quantity },
      },
      data: { current_volume: { increment: quantity } },
    });
    if (volumeUpdate.count !== 1) {
      throw new CapacityExceededError('Destination location capacity changed during stock receipt');
    }

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

  await queueInventoryEventEmail(user_id, {
    event_type: 'inventory.stock_received',
    subject: 'LeanStock stock received',
    text: `Stock received for product ${product_id}: ${quantity} units.`,
    html: `<p>Stock received for product <strong>${product_id}</strong>: ${quantity} units.</p>`,
  });

  return result;
}

async function listInventory(query) {
  const { limit, cursor } = getPaginationParams(query);
  const { product_id, location_id, low_stock } = query;

  const where = { location: { is: { warehouse: { is: { is_hidden: false } } } } };
  if (product_id) where.product_id = product_id;
  if (location_id) where.location_id = location_id;
  if (cursor) where.id = { gt: cursor.id };

  const take = low_stock === 'true' ? Math.min(limit * 5, 500) : limit + 1;
  let items = await prisma.inventory.findMany({
    where,
    take,
    orderBy: { id: 'asc' },
    include: {
      product: { select: { sku: true, name: true, category: true, base_price: true } },
      location: {
        select: { name: true, warehouse: { select: { name: true } } },
      },
    },
  });

  if (low_stock === 'true') {
    items = items.filter(item => item.quantity_on_hand <= item.reorder_point).slice(0, limit + 1);
  }

  return buildPaginationResponse(items, limit);
}

async function getInventoryById(id) {
  const inv = await prisma.inventory.findFirst({
    where: { id, location: { is: { warehouse: { is: { is_hidden: false } } } } },
    include: {
      product: true,
      location: { include: { warehouse: true } },
      inventory_lots: { where: { quantity_on_hand: { gt: 0 } }, orderBy: { received_at: 'asc' } },
    },
  });
  if (!inv) throw new NotFoundError('Inventory record');
  return inv;
}

async function reserveInventory({ inventory_id, quantity, user_id }) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { id: inventory_id } });
    if (!inv) throw new NotFoundError('Inventory record');

    const available = inv.quantity_on_hand - inv.quantity_reserved;
    if (available < quantity) {
      throw new InsufficientStockError(`Only ${available} available to reserve`);
    }

    const reservationUpdate = await tx.inventory.updateMany({
      where: {
        id: inventory_id,
        quantity_on_hand: inv.quantity_on_hand,
        quantity_reserved: inv.quantity_reserved,
      },
      data: { quantity_reserved: { increment: quantity } },
    });
    if (reservationUpdate.count !== 1) {
      throw new ConflictError('Inventory changed while reserving stock, please retry');
    }

    const updated = await tx.inventory.findUnique({ where: { id: inventory_id } });
    await tx.auditLog.create({
      data: {
        user_id,
        action: 'STOCK_RESERVED',
        entity_type: 'INVENTORY',
        entity_id: inventory_id,
        old_value: { reserved: inv.quantity_reserved },
        new_value: { reserved: updated.quantity_reserved },
      },
    });

    return updated;
  });
}

async function releaseReservation({ inventory_id, quantity, user_id }) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { id: inventory_id } });
    if (!inv) throw new NotFoundError('Inventory record');
    if (inv.quantity_reserved < quantity) {
      throw new ConflictError(`Cannot release ${quantity} - only ${inv.quantity_reserved} reserved`);
    }

    const releaseUpdate = await tx.inventory.updateMany({
      where: {
        id: inventory_id,
        quantity_reserved: inv.quantity_reserved,
      },
      data: { quantity_reserved: { decrement: quantity } },
    });
    if (releaseUpdate.count !== 1) {
      throw new ConflictError('Inventory changed while releasing reservation, please retry');
    }

    const updated = await tx.inventory.findUnique({ where: { id: inventory_id } });
    await tx.auditLog.create({
      data: {
        user_id,
        action: 'RESERVATION_RELEASED',
        entity_type: 'INVENTORY',
        entity_id: inventory_id,
        old_value: { reserved: inv.quantity_reserved },
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

'use strict';

const { getPrismaClient } = require('../config/database');
const { ConflictError, NotFoundError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { getTenantId, isSystemAdmin, tenantWhere, tenantIdForWrite } = require('../utils/tenantScope');
const { enqueueEmail } = require('./emailService');
const { withRedisLock } = require('../utils/redisLock');

const prisma = getPrismaClient();

const includeOrder = {
  supplier: true,
  lines: {
    include: {
      product: { select: { id: true, sku: true, name: true } },
      location: { select: { id: true, name: true, warehouse: { select: { id: true, name: true } } } },
    },
    orderBy: { created_at: 'asc' },
  },
};

async function assertSupplier(tx, supplierId, tenantId) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenant_id: tenantId, is_active: true } });
  if (!supplier) throw new NotFoundError('Supplier');
  return supplier;
}

async function assertLineScope(tx, line, tenantId) {
  const product = await tx.product.findFirst({ where: { id: line.product_id, tenant_id: tenantId } });
  if (!product) throw new NotFoundError('Product');
  const location = await tx.location.findFirst({
    where: { id: line.location_id, warehouse: { tenant_id: tenantId, is_hidden: false } },
    include: { warehouse: true },
  });
  if (!location) throw new NotFoundError('Location');
}

async function listPurchaseOrders(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const where = { ...tenantWhere(user) };
  if (query.status) where.status = query.status;
  if (query.supplier_id) where.supplier_id = query.supplier_id;
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.purchaseOrder.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: includeOrder,
  });
  return buildPaginationResponse(items, limit);
}

async function getPurchaseOrder(id, user) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, ...tenantWhere(user) }, include: includeOrder });
  if (!order) throw new NotFoundError('Purchase order');
  return order;
}

async function createPurchaseOrder(data, user) {
  return prisma.$transaction(async (tx) => {
    let tenant_id = getTenantId(user);
    let supplier;
    if (!tenant_id && isSystemAdmin(user)) {
      supplier = await tx.supplier.findFirst({ where: { id: data.supplier_id, is_active: true } });
      if (!supplier) throw new NotFoundError('Supplier');
      tenant_id = supplier.tenant_id;
    } else {
      tenant_id = tenantIdForWrite(user);
      supplier = await assertSupplier(tx, data.supplier_id, tenant_id);
    }

    for (const line of data.lines) await assertLineScope(tx, line, tenant_id);

    return tx.purchaseOrder.create({
      data: {
        tenant_id,
        supplier_id: data.supplier_id,
        created_by_id: user.sub,
        expected_at: data.expected_at ? new Date(data.expected_at) : null,
        notes: data.notes || null,
        lines: {
          create: data.lines.map(line => ({
            product_id: line.product_id,
            location_id: line.location_id,
            quantity_ordered: line.quantity_ordered,
            unit_cost: line.unit_cost,
          })),
        },
      },
      include: includeOrder,
    });
  });
}

async function updateDraftPurchaseOrder(id, data, user) {
  const order = await getPurchaseOrder(id, user);
  if (order.status !== 'DRAFT') throw new ConflictError('Only draft purchase orders can be edited');
  return prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(data.expected_at !== undefined ? { expected_at: data.expected_at ? new Date(data.expected_at) : null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
    include: includeOrder,
  });
}

async function transitionPurchaseOrder(id, nextStatus, user) {
  const order = await getPurchaseOrder(id, user);
  const now = new Date();
  const allowed = {
    SUBMITTED: ['DRAFT'],
    APPROVED: ['SUBMITTED'],
    CANCELLED: ['DRAFT', 'SUBMITTED', 'APPROVED'],
  };
  if (!allowed[nextStatus]?.includes(order.status)) {
    throw new ConflictError(`Cannot transition purchase order from ${order.status} to ${nextStatus}`);
  }

  const data = { status: nextStatus };
  if (nextStatus === 'SUBMITTED') data.submitted_at = now;
  if (nextStatus === 'APPROVED') data.approved_at = now;
  if (nextStatus === 'CANCELLED') data.cancelled_at = now;

  const updated = await prisma.purchaseOrder.update({ where: { id }, data, include: includeOrder });
  if (nextStatus === 'APPROVED') {
    await enqueueEmail({
      to: updated.supplier.contact_email,
      event_type: 'purchase_order.confirmation',
      subject: `LeanStock purchase order ${updated.id} approved`,
      text: `Purchase order ${updated.id} was approved with ${updated.lines.length} line(s).`,
      html: `<p>Purchase order <strong>${updated.id}</strong> was approved.</p>`,
    });
  }
  return updated;
}

async function receivePurchaseOrder(id, payload, user) {
  const order = await getPurchaseOrder(id, user);
  if (!['APPROVED', 'RECEIVED'].includes(order.status)) {
    throw new ConflictError('Purchase order must be approved before receiving');
  }

  const lineById = new Map(order.lines.map(line => [line.id, line]));
  const lockKeys = payload.lines.flatMap(line => {
    const orderLine = lineById.get(line.line_id);
    return orderLine ? [`lock:location:${orderLine.location_id}`, `lock:product:${orderLine.product_id}`] : [];
  });

  return withRedisLock(lockKeys, async () => {
    const result = await prisma.$transaction(async (tx) => {
      for (const incoming of payload.lines) {
        const line = lineById.get(incoming.line_id);
        if (!line) throw new NotFoundError('Purchase order line');
        const remaining = line.quantity_ordered - line.quantity_received;
        if (incoming.quantity_received > remaining) {
          throw new ConflictError(`Cannot receive ${incoming.quantity_received}; only ${remaining} remaining for line ${line.id}`);
        }

        const location = await tx.location.findUnique({ where: { id: line.location_id } });
        const inventory = await tx.inventory.upsert({
          where: { product_id_location_id: { product_id: line.product_id, location_id: line.location_id } },
          update: { quantity_on_hand: { increment: incoming.quantity_received } },
          create: {
            product_id: line.product_id,
            location_id: line.location_id,
            quantity_on_hand: incoming.quantity_received,
            quantity_reserved: 0,
            reorder_point: 50,
            max_stock_level: 500,
          },
        });

        await tx.inventoryLot.create({
          data: {
            inventory_id: inventory.id,
            lot_code: incoming.lot_code || `PO-${id.slice(-8)}-${line.id.slice(-6)}-${Date.now()}`,
            quantity_received: incoming.quantity_received,
            quantity_on_hand: incoming.quantity_received,
            unit_cost: line.unit_cost,
            received_at: new Date(),
          },
        });

        await tx.stockMovement.create({
          data: {
            product_id: line.product_id,
            user_id: user.sub,
            to_location_id: line.location_id,
            quantity: incoming.quantity_received,
            movement_type: 'INCOMING',
            status: 'COMPLETED',
            reason: `Purchase order ${id} receipt`,
            approved_at: new Date(),
            completed_at: new Date(),
          },
        });

        await tx.location.update({
          where: { id: line.location_id },
          data: { current_volume: { increment: incoming.quantity_received } },
        });

        if (location && location.current_volume + incoming.quantity_received > location.capacity_units) {
          throw new ConflictError('Destination location capacity exceeded');
        }

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantity_received: { increment: incoming.quantity_received } },
        });
      }

      const freshLines = await tx.purchaseOrderLine.findMany({ where: { purchase_order_id: id } });
      const allReceived = freshLines.every(line => line.quantity_received >= line.quantity_ordered);
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: allReceived ? 'RECEIVED' : 'APPROVED', received_at: allReceived ? new Date() : order.received_at },
        include: includeOrder,
      });
    }, { isolationLevel: 'Serializable', timeout: 30000 });

    await enqueueEmail({
      to: order.supplier.contact_email,
      event_type: 'purchase_order.received',
      subject: `LeanStock purchase order ${order.id} received`,
      text: `Purchase order ${order.id} has received stock.`,
      html: `<p>Purchase order <strong>${order.id}</strong> has received stock.</p>`,
    });

    return result;
  });
}

module.exports = {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updateDraftPurchaseOrder,
  transitionPurchaseOrder,
  receivePurchaseOrder,
};

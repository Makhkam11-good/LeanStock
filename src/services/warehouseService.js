'use strict';

const { getPrismaClient } = require('../config/database');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { tenantWhere, tenantIdForWrite } = require('../utils/tenantScope');

const prisma = getPrismaClient();

// ── Warehouse ──────────────────────────────────────────────────────────────────

async function listWarehouses(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const where = { is_hidden: false, ...tenantWhere(user) };
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.warehouse.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: { _count: { select: { locations: true } } },
  });

  return buildPaginationResponse(items, limit);
}

async function getWarehouseById(id, user) {
  const wh = await prisma.warehouse.findFirst({
    where: { id, is_hidden: false, ...tenantWhere(user) },
    include: { locations: true, _count: { select: { locations: true } } },
  });
  if (!wh) throw new NotFoundError('Warehouse');
  return wh;
}

async function createWarehouse({ name, country, city }, user) {
  const tenant_id = tenantIdForWrite(user);
  const existing = await prisma.warehouse.findFirst({ where: { tenant_id, name } });
  if (existing) throw new ConflictError(`Warehouse '${name}' already exists`);
  return prisma.warehouse.create({ data: { tenant_id, name, country, city } });
}

async function updateWarehouse(id, data, user) {
  const wh = await prisma.warehouse.findFirst({ where: { id, is_hidden: false, ...tenantWhere(user) } });
  if (!wh) throw new NotFoundError('Warehouse');

  if (data.name) {
    const existing = await prisma.warehouse.findFirst({
      where: {
        tenant_id: wh.tenant_id,
        name: data.name,
        id: { not: id },
      },
    });
    if (existing) throw new ConflictError(`Warehouse '${data.name}' already exists`);
  }

  return prisma.warehouse.update({ where: { id }, data });
}

async function closeWarehouse(id, user) {
  const wh = await prisma.warehouse.findFirst({ where: { id, is_hidden: false, ...tenantWhere(user) } });
  if (!wh) throw new NotFoundError('Warehouse');
  return prisma.warehouse.update({ where: { id }, data: { status: 'CLOSED' } });
}

async function hideWarehouse(id, user) {
  const wh = await prisma.warehouse.findFirst({ where: { id, ...tenantWhere(user) } });
  if (!wh) throw new NotFoundError('Warehouse');

  if (wh.is_hidden) return wh;

  return prisma.warehouse.update({
    where: { id },
    data: {
      is_hidden: true,
      hidden_at: new Date(),
      status: 'CLOSED',
    },
  });
}

// ── Location ───────────────────────────────────────────────────────────────────

async function listLocations(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const { warehouse_id } = query;
  const where = { warehouse: { is: { is_hidden: false, ...tenantWhere(user) } } };
  if (warehouse_id) where.warehouse_id = warehouse_id;
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.location.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: { warehouse: { select: { id: true, tenant_id: true, name: true } } },
  });

  return buildPaginationResponse(items, limit);
}

async function getLocationById(id, user) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false, ...tenantWhere(user) } } },
    include: {
      warehouse: true,
      _count: { select: { inventory_stocks: true } },
    },
  });
  if (!loc) throw new NotFoundError('Location');
  return loc;
}

async function createLocation({ warehouse_id, name, address, capacity_units }, user) {
  const wh = await prisma.warehouse.findFirst({ where: { id: warehouse_id, ...tenantWhere(user) } });
  if (!wh) throw new NotFoundError('Warehouse');
  if (wh.is_hidden) throw new ConflictError('Cannot create location in a hidden warehouse');
  if (wh.status !== 'ACTIVE') throw new ConflictError('Cannot create location in a warehouse that is not active');

  return prisma.location.create({
    data: {
      warehouse_id,
      name,
      address,
      capacity_units: capacity_units || 1000,
    },
  });
}

async function updateLocation(id, data, user) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false, ...tenantWhere(user) } } },
  });
  if (!loc) throw new NotFoundError('Location');

  if (data.warehouse_id) {
    const wh = await prisma.warehouse.findFirst({ where: { id: data.warehouse_id, ...tenantWhere(user) } });
    if (!wh) throw new NotFoundError('Warehouse');
    if (wh.is_hidden) throw new ConflictError('Cannot move location to a hidden warehouse');
    if (wh.status !== 'ACTIVE') throw new ConflictError('Cannot move location to a warehouse that is not active');
  }

  return prisma.location.update({ where: { id }, data });
}

async function deleteLocation(id, user) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false, ...tenantWhere(user) } } },
    include: { _count: { select: { inventory_stocks: true } } },
  });
  if (!loc) throw new NotFoundError('Location');
  if (loc._count.inventory_stocks > 0) {
    throw new ConflictError('Cannot delete location with existing inventory');
  }
  return prisma.location.delete({ where: { id } });
}

module.exports = {
  listWarehouses, getWarehouseById, createWarehouse, updateWarehouse, closeWarehouse, hideWarehouse,
  listLocations, getLocationById, createLocation, updateLocation, deleteLocation,
};

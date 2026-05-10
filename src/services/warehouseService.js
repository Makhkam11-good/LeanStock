'use strict';

const { getPrismaClient } = require('../config/database');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');

const prisma = getPrismaClient();

// ── Warehouse ──────────────────────────────────────────────────────────────────

async function listWarehouses(query) {
  const { limit, cursor } = getPaginationParams(query);
  const where = { is_hidden: false };
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.warehouse.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: { _count: { select: { locations: true } } },
  });

  return buildPaginationResponse(items, limit);
}

async function getWarehouseById(id) {
  const wh = await prisma.warehouse.findFirst({
    where: { id, is_hidden: false },
    include: { locations: true, _count: { select: { locations: true } } },
  });
  if (!wh) throw new NotFoundError('Warehouse');
  return wh;
}

async function createWarehouse({ name, country, city }) {
  const existing = await prisma.warehouse.findUnique({ where: { name } });
  if (existing) throw new ConflictError(`Warehouse '${name}' already exists`);
  return prisma.warehouse.create({ data: { name, country, city } });
}

async function updateWarehouse(id, data) {
  const wh = await prisma.warehouse.findFirst({ where: { id, is_hidden: false } });
  if (!wh) throw new NotFoundError('Warehouse');
  return prisma.warehouse.update({ where: { id }, data });
}

async function closeWarehouse(id) {
  const wh = await prisma.warehouse.findFirst({ where: { id, is_hidden: false } });
  if (!wh) throw new NotFoundError('Warehouse');
  return prisma.warehouse.update({ where: { id }, data: { status: 'CLOSED' } });
}

async function hideWarehouse(id) {
  const wh = await prisma.warehouse.findUnique({ where: { id } });
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

async function listLocations(query) {
  const { limit, cursor } = getPaginationParams(query);
  const { warehouse_id } = query;
  const where = { warehouse: { is: { is_hidden: false } } };
  if (warehouse_id) where.warehouse_id = warehouse_id;
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.location.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: { warehouse: { select: { name: true } } },
  });

  return buildPaginationResponse(items, limit);
}

async function getLocationById(id) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false } } },
    include: {
      warehouse: true,
      _count: { select: { inventory_stocks: true } },
    },
  });
  if (!loc) throw new NotFoundError('Location');
  return loc;
}

async function createLocation({ warehouse_id, name, address, capacity_units }) {
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouse_id } });
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

async function updateLocation(id, data) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false } } },
  });
  if (!loc) throw new NotFoundError('Location');

  if (data.warehouse_id) {
    const wh = await prisma.warehouse.findUnique({ where: { id: data.warehouse_id } });
    if (!wh) throw new NotFoundError('Warehouse');
    if (wh.is_hidden) throw new ConflictError('Cannot move location to a hidden warehouse');
    if (wh.status !== 'ACTIVE') throw new ConflictError('Cannot move location to a warehouse that is not active');
  }

  return prisma.location.update({ where: { id }, data });
}

async function deleteLocation(id) {
  const loc = await prisma.location.findFirst({
    where: { id, warehouse: { is: { is_hidden: false } } },
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

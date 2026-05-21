'use strict';

const { getPrismaClient } = require('../config/database');
const { NotFoundError } = require('../utils/errors');
const { encodeCursor, getPaginationParams } = require('../utils/paginator');
const { tenantWhere } = require('../utils/tenantScope');

const prisma = getPrismaClient();

const includeMovement = {
  product: { select: { id: true, sku: true, name: true, category: true } },
  user: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
  from_location: {
    select: {
      id: true,
      name: true,
      warehouse: { select: { id: true, name: true, tenant_id: true } },
    },
  },
  to_location: {
    select: {
      id: true,
      name: true,
      warehouse: { select: { id: true, name: true, tenant_id: true } },
    },
  },
};

function buildMovementWhere(query, user) {
  const where = { product: { is: tenantWhere(user) } };
  const and = [];
  if (query.movement_type) where.movement_type = query.movement_type;
  if (query.status) where.status = query.status;
  if (query.product_id) where.product_id = query.product_id;
  if (query.user_id) where.user_id = query.user_id;
  if (query.location_id) {
    and.push({ OR: [
      { from_location_id: query.location_id },
      { to_location_id: query.location_id },
    ] });
  }
  if (and.length) where.AND = and;
  return where;
}

function addCursorFilter(where, cursor) {
  if (!cursor) return;

  if (cursor.created_at && cursor.id) {
    const createdAt = new Date(cursor.created_at);
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { created_at: { lt: createdAt } },
          { created_at: createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
    return;
  }

  if (cursor.id) where.id = { gt: cursor.id };
}

function buildMovementPaginationResponse(items, limit) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  return {
    data,
    pagination: {
      has_more: hasMore,
      next_cursor: hasMore ? encodeCursor({ id: last.id, created_at: last.created_at }) : null,
      count: data.length,
    },
  };
}

async function listStockMovements(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const where = buildMovementWhere(query, user);
  addCursorFilter(where, cursor);

  const items = await prisma.stockMovement.findMany({
    where,
    take: limit + 1,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    include: includeMovement,
  });

  return buildMovementPaginationResponse(items, limit);
}

async function getStockMovement(id, user) {
  const movement = await prisma.stockMovement.findFirst({
    where: { id, product: { is: tenantWhere(user) } },
    include: includeMovement,
  });
  if (!movement) throw new NotFoundError('Stock movement');
  return movement;
}

module.exports = {
  listStockMovements,
  getStockMovement,
};

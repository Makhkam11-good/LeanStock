'use strict';

const { getPrismaClient } = require('../config/database');
const { NotFoundError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');

const prisma = getPrismaClient();

const TENANT_INCLUDE = {
  _count: {
    select: {
      users: true,
      warehouses: true,
      products: true,
    },
  },
};

const TENANT_DETAIL_INCLUDE = {
  ...TENANT_INCLUDE,
  users: {
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      is_active: true,
      is_email_verified: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' },
    take: 20,
  },
};

function buildTenantWhere(query) {
  const where = {};

  if (query.is_active === 'true') {
    where.is_active = true;
  } else if (query.is_active === 'false') {
    where.is_active = false;
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

async function listTenants(query) {
  const { limit, cursor } = getPaginationParams(query);
  const where = buildTenantWhere(query);

  if (cursor) {
    where.id = { gt: cursor.id };
  }

  const items = await prisma.tenant.findMany({
    where,
    include: TENANT_INCLUDE,
    take: limit + 1,
    orderBy: { id: 'asc' },
  });

  return buildPaginationResponse(items, limit);
}

async function getTenantById(id) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: TENANT_DETAIL_INCLUDE,
  });

  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

async function setTenantActive(id, isActive) {
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Tenant');

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id },
      data: { is_active: isActive },
      include: TENANT_DETAIL_INCLUDE,
    });

    if (!isActive) {
      const users = await tx.user.findMany({
        where: { tenant_id: id },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);

      await tx.refreshToken.updateMany({
        where: {
          revoked: false,
          user_id: { in: userIds },
        },
        data: { revoked: true },
      });
    }

    return tenant;
  });
}

async function activateTenant(id) {
  return setTenantActive(id, true);
}

async function deactivateTenant(id) {
  return setTenantActive(id, false);
}

module.exports = {
  listTenants,
  getTenantById,
  activateTenant,
  deactivateTenant,
};

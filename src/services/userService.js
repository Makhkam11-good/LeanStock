'use strict';

const { getPrismaClient } = require('../config/database');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { isSystemAdmin, requireTenantId } = require('../utils/tenantScope');

const prisma = getPrismaClient();

const USER_LIST_SELECT = {
  id: true,
  tenant_id: true,
  email: true,
  first_name: true,
  last_name: true,
  phone: true,
  role: true,
  is_active: true,
  is_email_verified: true,
  created_at: true,
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
      is_active: true,
    },
  },
};

const ALLOWED_ROLES = new Set(['COMPANY_ADMIN', 'MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR', 'SYSTEM_ADMIN']);

function buildUserWhere(query, actor) {
  const where = {};

  if (isSystemAdmin(actor)) {
    if (query.tenant_id) {
      where.tenant_id = query.tenant_id;
    }
  } else {
    where.tenant_id = requireTenantId(actor);
  }

  if (query.role && ALLOWED_ROLES.has(query.role)) {
    where.role = query.role;
  }

  if (query.is_active === 'true') {
    where.is_active = true;
  } else if (query.is_active === 'false') {
    where.is_active = false;
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { first_name: { contains: search, mode: 'insensitive' } },
      { last_name: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}

async function listUsers(query, actor) {
  const { limit, cursor } = getPaginationParams(query);
  const where = buildUserWhere(query, actor);
  const and = [];

  if (cursor) {
    and.push({ id: { gt: cursor.id } });
  }

  const actorId = actor?.sub || actor?.id;
  if (actorId) {
    and.push({ id: { not: actorId } });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const items = await prisma.user.findMany({
    where,
    select: USER_LIST_SELECT,
    take: limit + 1,
    orderBy: { id: 'asc' },
  });

  return buildPaginationResponse(items, limit);
}

module.exports = {
  listUsers,
};

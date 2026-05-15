'use strict';

const { AuthorizationError } = require('./errors');

function getTenantId(user) {
  return user?.tenant_id || user?.tenantId || null;
}

function isSystemAdmin(user) {
  return user?.role === 'SYSTEM_ADMIN';
}

function requireTenantId(user) {
  const tenantId = getTenantId(user);
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId;
}

function tenantWhere(user) {
  if (isSystemAdmin(user) && !getTenantId(user)) {
    return {};
  }
  return { tenant_id: requireTenantId(user) };
}

function tenantIdForWrite(user) {
  return requireTenantId(user);
}

module.exports = {
  getTenantId,
  isSystemAdmin,
  requireTenantId,
  tenantWhere,
  tenantIdForWrite,
};

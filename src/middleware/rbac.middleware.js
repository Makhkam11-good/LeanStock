'use strict';

const { AuthorizationError } = require('../utils/errors');

/**
 * Require one or more roles. Returns 403 if user's role is not in the list.
 * Usage: requireRole('COMPANY_ADMIN', 'SYSTEM_ADMIN')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Not authenticated'));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AuthorizationError(
          `Role '${req.user.role}' is not authorized. Required: ${roles.join(', ')}`
        )
      );
    }
    next();
  };
}

// Convenience aliases
const isCompanyAdmin = requireRole('COMPANY_ADMIN', 'SYSTEM_ADMIN');
const isManager = requireRole('COMPANY_ADMIN', 'MANAGER', 'SYSTEM_ADMIN');
const isOperator = requireRole('COMPANY_ADMIN', 'MANAGER', 'WAREHOUSE_OPERATOR', 'SYSTEM_ADMIN');
const isAuditor = requireRole('COMPANY_ADMIN', 'MANAGER', 'WAREHOUSE_OPERATOR', 'AUDITOR', 'SYSTEM_ADMIN');
const isAdmin = requireRole('SYSTEM_ADMIN');

module.exports = { requireRole, isCompanyAdmin, isManager, isOperator, isAuditor, isAdmin };

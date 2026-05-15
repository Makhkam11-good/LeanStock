'use strict';

const { verifyAccessToken } = require('../utils/jwt.util');
const { AuthenticationError } = require('../utils/errors');
const { getPrismaClient } = require('../config/database');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    const user = await getPrismaClient().user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        tenant_id: true,
        is_active: true,
        is_email_verified: true,
        role: true,
        tenant: { select: { is_active: true } },
      },
    });

    if (!user || !user.is_active) {
      throw new AuthenticationError('Account is deactivated');
    }

    if (!user.is_email_verified) {
      throw new AuthenticationError('Email verification required');
    }

    if (user.role !== 'SYSTEM_ADMIN' && user.tenant_id && !user.tenant?.is_active) {
      throw new AuthenticationError('Tenant is inactive');
    }

    decoded.role = user.role;
    decoded.tenant_id = user.tenant_id;
    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
}

// Optional auth - sets req.user if token present, but doesn't fail if absent
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(authHeader.split(' ')[1]);
    } catch {
      // ignore
    }
  }
  next();
}

module.exports = { authenticate, optionalAuth };

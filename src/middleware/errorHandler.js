'use strict';

const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Operational errors (our custom errors)
  if (err.isOperational) {
    const body = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details) body.error.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: `Duplicate value for: ${err.meta?.target?.join(', ') || 'unknown field'}`,
      },
    });
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found' },
    });
  }

  // Prisma foreign key constraint
  if (err.code === 'P2003') {
    return res.status(422).json({
      success: false,
      error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Referenced record does not exist' },
    });
  }

  // Prisma transaction timeout / deadlock
  if (err.code === 'P2034') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'TRANSACTION_CONFLICT',
        message: 'Resource is being modified by another request, please retry',
        retry_after_ms: Math.floor(Math.random() * 800) + 200,
      },
    });
  }

  // Unexpected error
  logger.error('Unhandled error', { error: err.message, stack: err.stack, url: req.url });
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

module.exports = { errorHandler };

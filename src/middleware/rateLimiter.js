'use strict';

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT_AUTH_MAX, RATE_LIMIT_AUTH_WINDOW_MS } = require('../config/env');

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: `Too many attempts. Try again after ${RATE_LIMIT_AUTH_WINDOW_MS / 1000} seconds.`,
    },
  },
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests' },
  },
});

module.exports = { authLimiter, apiLimiter };

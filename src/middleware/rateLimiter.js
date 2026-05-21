'use strict';

const { RATE_LIMIT_AUTH_MAX, RATE_LIMIT_AUTH_WINDOW_MS } = require('../config/env');
const { redisCommand } = require('../jobs/redisQueue');

function tokenBucket({ prefix, max, windowMs, keyGenerator }) {
  return async (req, res, next) => {
    const bucketKey = `${prefix}:${keyGenerator(req)}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      const count = Number(await redisCommand('INCR', bucketKey));
      if (count === 1) {
        await redisCommand('EXPIRE', bucketKey, windowSeconds);
      }

      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));

      if (count > max) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Too many attempts. Try again after ${windowSeconds} seconds.`,
          },
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

const authLimiter = tokenBucket({
  prefix: 'rate:auth',
  max: RATE_LIMIT_AUTH_MAX,
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  keyGenerator: req => req.ip,
});

const apiLimiter = tokenBucket({
  prefix: 'rate:api',
  max: 200,
  windowMs: 60 * 1000,
  keyGenerator: req => req.user?.sub || req.ip,
});

module.exports = { authLimiter, apiLimiter, tokenBucket };

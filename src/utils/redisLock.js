'use strict';

const { randomUUID } = require('crypto');
const { redisCommand } = require('../jobs/redisQueue');
const { ConflictError } = require('./errors');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireLock(key, ttlMs, waitMs = 1500) {
  const token = randomUUID();
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const result = await redisCommand('SET', key, token, 'NX', 'PX', ttlMs);
    if (result === 'OK' || result === null) return token;
    await sleep(50);
  }

  throw new ConflictError('Resource is locked by another operation, please retry');
}

async function releaseLock(key, token) {
  const current = await redisCommand('GET', key);
  if (current === token) {
    await redisCommand('DEL', key);
  }
}

async function withRedisLock(keys, fn, options = {}) {
  const lockKeys = [...new Set(Array.isArray(keys) ? keys : [keys])].sort();
  const ttlMs = options.ttlMs || 10000;
  const tokens = [];

  try {
    for (const key of lockKeys) {
      tokens.push([key, await acquireLock(key, ttlMs, options.waitMs)]);
    }
    return await fn();
  } finally {
    for (const [key, token] of tokens.reverse()) {
      await releaseLock(key, token);
    }
  }
}

module.exports = { withRedisLock };

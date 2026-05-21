'use strict';

const net = require('net');
const { URL } = require('url');
const logger = require('../utils/logger');
const {
  REDIS_URL,
  REDIS_REQUIRED,
  QUEUE_POLL_TIMEOUT_SECONDS,
} = require('../config/env');

const memoryQueues = new Map();
const memoryJobs = new Map();
let memorySeq = 0;

function encodeCommand(args) {
  return `*${args.length}\r\n${args.map(arg => {
    const value = String(arg);
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }).join('')}`;
}

class RedisConnection {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    const parsed = new URL(this.redisUrl);
    this.socket = net.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
    });

    this.socket.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainReplies();
    });

    this.socket.on('error', err => {
      const pending = this.pending.splice(0);
      for (const request of pending) request.reject(err);
    });

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });

    this.connected = true;

    if (parsed.password) {
      await this.command('AUTH', decodeURIComponent(parsed.password));
    }

    if (parsed.pathname && parsed.pathname !== '/') {
      logger.warn('[Queue] Redis database path is ignored; use a dedicated Redis instance or key prefix for isolation.');
    }
  }

  async command(...args) {
    await this.connect();

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encodeCommand(args));
    });
  }

  drainReplies() {
    while (this.pending.length > 0) {
      const parsed = parseReply(this.buffer);
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.offset);
      const request = this.pending.shift();
      if (parsed.error) request.reject(parsed.error);
      else request.resolve(parsed.value);
    }
  }

  close() {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
    }
    this.socket = null;
    this.connected = false;
  }
}

function parseReply(buffer, offset = 0) {
  if (buffer.length <= offset) return null;
  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const line = buffer.subarray(offset + 1, lineEnd).toString();
  const nextOffset = lineEnd + 2;

  if (type === '+') return { value: line, offset: nextOffset };
  if (type === '-') return { error: new Error(line), offset: nextOffset };
  if (type === ':') return { value: Number(line), offset: nextOffset };

  if (type === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, offset: nextOffset };
    const end = nextOffset + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.subarray(nextOffset, end).toString(), offset: end + 2 };
  }

  if (type === '*') {
    const length = Number(line);
    if (length === -1) return { value: null, offset: nextOffset };
    const values = [];
    let cursor = nextOffset;
    for (let i = 0; i < length; i++) {
      const item = parseReply(buffer, cursor);
      if (!item) return null;
      values.push(item.value);
      cursor = item.offset;
    }
    return { value: values, offset: cursor };
  }

  return { error: new Error(`Unsupported Redis reply type: ${type}`), offset: nextOffset };
}

let redisConnection;
function getRedisConnection() {
  if (!redisConnection) redisConnection = new RedisConnection(REDIS_URL);
  return redisConnection;
}

function jobKey(jobId) {
  return `leanstock:job:${jobId}`;
}

function normalizeHash(values) {
  const result = {};
  for (let i = 0; i < values.length; i += 2) {
    result[values[i]] = values[i + 1];
  }
  if (result.payload) result.payload = JSON.parse(result.payload);
  if (result.attempts) result.attempts = Number(result.attempts);
  if (result.max_attempts) result.max_attempts = Number(result.max_attempts);
  return result;
}

function memoryQueue(queueName) {
  if (!memoryQueues.has(queueName)) memoryQueues.set(queueName, []);
  return memoryQueues.get(queueName);
}

async function withRedis(operation, fallback) {
  try {
    return await operation(getRedisConnection());
  } catch (err) {
    if (REDIS_REQUIRED) throw err;
    logger.warn(`[Queue] Redis unavailable, using in-memory queue: ${err.message}`);
    return fallback();
  }
}

async function enqueueJob(queueName, type, payload, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const now = new Date().toISOString();

  return withRedis(
    async redis => {
      const seq = await redis.command('INCR', 'leanstock:job:seq');
      const jobId = `${type}:${seq}`;
      await redis.command(
        'HSET',
        jobKey(jobId),
        'id', jobId,
        'queue', queueName,
        'type', type,
        'payload', JSON.stringify(payload),
        'status', 'queued',
        'attempts', '0',
        'max_attempts', String(maxAttempts),
        'created_at', now,
        'updated_at', now
      );
      await redis.command('RPUSH', queueName, jobId);
      return { id: jobId, queue: queueName, type, status: 'queued' };
    },
    () => {
      const jobId = `${type}:memory:${++memorySeq}`;
      const job = {
        id: jobId,
        queue: queueName,
        type,
        payload,
        status: 'queued',
        attempts: 0,
        max_attempts: maxAttempts,
        created_at: now,
        updated_at: now,
      };
      memoryJobs.set(jobId, job);
      memoryQueue(queueName).push(jobId);
      return { id: jobId, queue: queueName, type, status: 'queued' };
    }
  );
}

async function reserveJob(queueName, timeoutSeconds = QUEUE_POLL_TIMEOUT_SECONDS) {
  return withRedis(
    async redis => {
      const result = await redis.command('BLPOP', queueName, timeoutSeconds);
      if (!result) return null;
      const jobId = result[1];
      const raw = await redis.command('HGETALL', jobKey(jobId));
      if (!raw || raw.length === 0) return null;
      const job = normalizeHash(raw);
      const attempts = Number(job.attempts || 0) + 1;
      await redis.command(
        'HSET',
        jobKey(jobId),
        'status', 'active',
        'attempts', String(attempts),
        'updated_at', new Date().toISOString()
      );
      return { ...job, id: jobId, attempts };
    },
    () => {
      const id = memoryQueue(queueName).shift();
      if (!id) return null;
      const job = memoryJobs.get(id);
      job.status = 'active';
      job.attempts += 1;
      job.updated_at = new Date().toISOString();
      return job;
    }
  );
}

async function markJobCompleted(jobId, result = {}) {
  const now = new Date().toISOString();
  return withRedis(
    redis => redis.command('HSET', jobKey(jobId), 'status', 'completed', 'result', JSON.stringify(result), 'updated_at', now),
    () => {
      const job = memoryJobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.result = result;
        job.updated_at = now;
      }
      return 'OK';
    }
  );
}

async function markJobFailed(job, err) {
  const now = new Date().toISOString();
  const finalStatus = job.attempts >= job.max_attempts ? 'failed' : 'queued';

  return withRedis(
    async redis => {
      await redis.command(
        'HSET',
        jobKey(job.id),
        'status', finalStatus,
        'last_error', err.message,
        'updated_at', now
      );
      if (finalStatus === 'queued') {
        await redis.command('RPUSH', job.queue, job.id);
      }
      return finalStatus;
    },
    () => {
      const existing = memoryJobs.get(job.id);
      if (existing) {
        existing.status = finalStatus;
        existing.last_error = err.message;
        existing.updated_at = now;
        if (finalStatus === 'queued') memoryQueue(job.queue).push(job.id);
      }
      return finalStatus;
    }
  );
}

async function getJob(jobId) {
  return withRedis(
    async redis => {
      const raw = await redis.command('HGETALL', jobKey(jobId));
      if (!raw || raw.length === 0) return null;
      return normalizeHash(raw);
    },
    () => memoryJobs.get(jobId) || null
  );
}

async function redisCommand(...args) {
  return withRedis(
    redis => redis.command(...args),
    () => null
  );
}

async function closeQueueConnection() {
  if (redisConnection) redisConnection.close();
}

module.exports = {
  enqueueJob,
  reserveJob,
  markJobCompleted,
  markJobFailed,
  getJob,
  redisCommand,
  closeQueueConnection,
};

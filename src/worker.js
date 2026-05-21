'use strict';

require('./config/env');

const http = require('http');
const { sendEmailNow } = require('./services/emailService');
const { applyDeadStockDecay } = require('./services/decayService');
const { releaseExpiredReservations } = require('./services/inventoryService');
const {
  reserveJob,
  markJobCompleted,
  markJobFailed,
  closeQueueConnection,
} = require('./jobs/redisQueue');
const { disconnectPrisma } = require('./config/database');
const {
  QUEUE_EMAIL_NAME,
  QUEUE_DECAY_NAME,
  QUEUE_POLL_TIMEOUT_SECONDS,
} = require('./config/env');
const logger = require('./utils/logger');

let shuttingDown = false;
let healthServers = [];

function normalizePort(value) {
  const port = parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function isDokkuRuntime() {
  return Object.entries(process.env).some(([key, value]) => (
    key.startsWith('DOKKU_') ||
    (key.endsWith('_URL') && typeof value === 'string' && value.includes('.web:5000'))
  ));
}

function resolveHealthPorts() {
  const ports = [
    normalizePort(process.env.PORT),
    normalizePort(process.env.APP_PORT),
    normalizePort(process.env.WORKER_HEALTH_PORT),
    5000,
    3000,
  ];

  return [...new Set(ports.filter(Boolean))];
}

function startHealthServer() {
  if (process.env.WORKER_HEALTH_ENABLED === 'false' || healthServers.length > 0) {
    return;
  }

  healthServers = resolveHealthPorts().map(port => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'worker' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    server.listen(port, '0.0.0.0', () => {
      logger.info(`[Worker] Health check listening on port ${port}`);
    });

    server.on('error', err => {
      logger.error(`[Worker] Health check failed on port ${port}`, { error: err.message });
      process.exit(1);
    });

    return server;
  });
}

async function processJob(job) {
  if (job.type === 'email.send') {
    return sendEmailNow(job.payload);
  }

  if (job.type === 'dead-stock.decay') {
    return applyDeadStockDecay(job.payload || {});
  }

  if (job.type === 'inventory.release-expired-reservations') {
    return releaseExpiredReservations(job.payload?.limit || 100);
  }

  throw new Error(`Unknown job type: ${job.type}`);
}

async function poll(queueName) {
  const job = await reserveJob(queueName, QUEUE_POLL_TIMEOUT_SECONDS);
  if (!job) return;

  try {
    const result = await processJob(job);
    await markJobCompleted(job.id, result);
    logger.info(`[Worker] Completed ${job.id}`);
  } catch (err) {
    const status = await markJobFailed(job, err);
    logger.error(`[Worker] ${job.id} ${status}: ${err.message}`);
  }
}

async function startWorker() {
  logger.info('[Worker] Starting LeanStock worker');
  startHealthServer();

  while (!shuttingDown) {
    await Promise.all([poll(QUEUE_EMAIL_NAME), poll(QUEUE_DECAY_NAME)]);
  }
}

function closeHealthServer() {
  if (healthServers.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(healthServers.map(server => new Promise(resolve => {
    server.close(() => resolve());
  }))).then(() => {
    healthServers = [];
  });
}

async function shutdown(signal) {
  logger.info(`[Worker] Received ${signal}; shutting down`);
  shuttingDown = true;
  await closeHealthServer();
  await closeQueueConnection();
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  startWorker().catch(async err => {
    logger.error('[Worker] Fatal error', { error: err.message, stack: err.stack });
    await shutdown('fatal');
  });
}

module.exports = { startWorker, processJob };

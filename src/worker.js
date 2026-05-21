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
let healthServer;

function startHealthServer() {
  if (process.env.WORKER_HEALTH_ENABLED === 'false' || healthServer) {
    return;
  }

  const port = parseInt(process.env.PORT || process.env.APP_PORT || process.env.WORKER_HEALTH_PORT || '3000', 10);
  healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'worker' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  healthServer.listen(port, '0.0.0.0', () => {
    logger.info(`[Worker] Health check listening on port ${port}`);
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
  if (!healthServer) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    healthServer.close(() => {
      healthServer = undefined;
      resolve();
    });
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

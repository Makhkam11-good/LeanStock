'use strict';

require('./config/env');

const { sendEmailNow } = require('./services/emailService');
const { applyDeadStockDecay } = require('./services/decayService');
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

async function processJob(job) {
  if (job.type === 'email.send') {
    return sendEmailNow(job.payload);
  }

  if (job.type === 'dead-stock.decay') {
    return applyDeadStockDecay(job.payload || {});
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
  while (!shuttingDown) {
    await Promise.all([poll(QUEUE_EMAIL_NAME), poll(QUEUE_DECAY_NAME)]);
  }
}

async function shutdown(signal) {
  logger.info(`[Worker] Received ${signal}; shutting down`);
  shuttingDown = true;
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

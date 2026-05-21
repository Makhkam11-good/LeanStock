'use strict';

const cron = require('node-cron');
const { enqueueJob } = require('./redisQueue');
const { QUEUE_DECAY_NAME } = require('../config/env');
const logger = require('../utils/logger');

let decayJob = null;

// Runs every day at 02:00 AM UTC (configurable via env)
const CRON_SCHEDULE = process.env.DEAD_STOCK_DECAY_SCHEDULE || '0 2 * * *';
const RESERVATION_RELEASE_SCHEDULE = process.env.RESERVATION_RELEASE_SCHEDULE || '*/5 * * * *';

function startDecayJob() {
  if (!process.env.CRON_ENABLED || process.env.CRON_ENABLED === 'false') {
    logger.info('[CronScheduler] Cron jobs disabled (CRON_ENABLED=false)');
    return;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error(`[CronScheduler] Invalid cron schedule: ${CRON_SCHEDULE}`);
    return;
  }

  decayJob = cron.schedule(CRON_SCHEDULE, async () => {
    logger.info('[CronScheduler] Dead stock decay job triggered');
    try {
      const job = await enqueueJob(QUEUE_DECAY_NAME, 'dead-stock.decay', { scheduled: true });
      logger.info(`[CronScheduler] Decay job queued: ${job.id}`);
    } catch (err) {
      logger.error(`[CronScheduler] Decay job failed: ${err.message}`, { stack: err.stack });
    }
  }, {
    timezone: 'UTC',
  });

  cron.schedule(RESERVATION_RELEASE_SCHEDULE, async () => {
    logger.info('[CronScheduler] Expired reservation release job triggered');
    try {
      const job = await enqueueJob(QUEUE_DECAY_NAME, 'inventory.release-expired-reservations', { scheduled: true });
      logger.info(`[CronScheduler] Reservation release job queued: ${job.id}`);
    } catch (err) {
      logger.error(`[CronScheduler] Reservation release job failed: ${err.message}`, { stack: err.stack });
    }
  }, {
    timezone: 'UTC',
  });

  logger.info(`[CronScheduler] Dead stock decay job scheduled: ${CRON_SCHEDULE}`);
  return decayJob;
}

function stopDecayJob() {
  if (decayJob) {
    decayJob.stop();
    decayJob = null;
    logger.info('[CronScheduler] Dead stock decay job stopped');
  }
}

module.exports = { startDecayJob, stopDecayJob };

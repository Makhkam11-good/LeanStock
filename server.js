'use strict';

const app = require('./src/app');
const { APP_PORT, APP_HOST } = require('./src/config/env');
const { disconnectPrisma } = require('./src/config/database');
const { startDecayJob, stopDecayJob } = require('./src/jobs/deadStockDecayJob');
const logger = require('./src/utils/logger');

// ── Start server ───────────────────────────────────────────────────────────────
const server = app.listen(APP_PORT, APP_HOST, () => {
  logger.info(`🚀 LeanStock API running on http://${APP_HOST}:${APP_PORT}`);
  logger.info(`📚 API docs at http://${APP_HOST}:${APP_PORT}/api-docs`);
  logger.info(`❤️  Health check at http://${APP_HOST}:${APP_PORT}/health`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);

  // Start cron jobs
  startDecayJob();
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  stopDecayJob();

  server.close(async () => {
    logger.info('HTTP server closed');
    await disconnectPrisma();
    logger.info('Database connection closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = server;

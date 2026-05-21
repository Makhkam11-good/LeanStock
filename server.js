'use strict';

const app = require('./src/app');
const { APP_PORT, APP_HOST } = require('./src/config/env');
const { disconnectPrisma } = require('./src/config/database');
const { closeQueueConnection } = require('./src/jobs/redisQueue');
const { startDecayJob, stopDecayJob } = require('./src/jobs/deadStockDecayJob');
const logger = require('./src/utils/logger');

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

function resolveListenPorts() {
  const ports = [
    normalizePort(APP_PORT),
    normalizePort(process.env.PORT),
  ];

  if (isDokkuRuntime()) {
    ports.push(5000);
  }

  return [...new Set(ports.filter(Boolean))];
}

const listenPorts = resolveListenPorts();
const servers = listenPorts.map(port => {
  const httpServer = app.listen(port, APP_HOST, () => {
    logger.info(`LeanStock API running on http://${APP_HOST}:${port}`);
    logger.info(`API docs at http://${APP_HOST}:${port}/api-docs`);
    logger.info(`Health check at http://${APP_HOST}:${port}/health`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
  });

  httpServer.on('error', err => {
    logger.error(`Failed to listen on port ${port}`, { error: err.message });
    process.exit(1);
  });

  return httpServer;
});

startDecayJob();

async function closeServers() {
  await Promise.all(servers.map(server => new Promise(resolve => {
    server.close(() => resolve());
  })));
}

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  stopDecayJob();
  await closeServers();
  logger.info('HTTP server closed');
  await closeQueueConnection();
  await disconnectPrisma();
  logger.info('Database connection closed');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', err => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = servers[0];

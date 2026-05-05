'use strict';

const { createLogger, format, transports } = require('winston');
const { NODE_ENV } = require('../config/env');

const logger = createLogger({
  level: process.env.APP_LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    NODE_ENV === 'production'
      ? format.json()
      : format.combine(format.colorize(), format.simple())
  ),
  transports: [
    new transports.Console(),
    ...(NODE_ENV !== 'test'
      ? [new transports.File({ filename: 'logs/error.log', level: 'error' }),
         new transports.File({ filename: 'logs/app.log' })]
      : []),
  ],
});

module.exports = logger;

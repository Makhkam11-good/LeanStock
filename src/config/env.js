'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) continue;

    const envKey = key.trim();
    if (process.env[envKey] === undefined) {
      process.env[envKey] = rest.join('=').trim();
    }
  }
}

loadEnvFile(path.join(__dirname, '..', '..', '.env'));

function aliasEnv(primary, fallback) {
  if (process.env[primary] === undefined && process.env[fallback] !== undefined) {
    process.env[primary] = process.env[fallback];
  }
}

aliasEnv('NODE_ENV', 'ENVIRONMENT');
aliasEnv('APP_PORT', 'BACKEND_PORT');
aliasEnv('JWT_SECRET', 'JWT_SECRET_KEY');
aliasEnv('JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET_KEY');
aliasEnv('SENDGRID_API_KEY', 'EMAIL_API_KEY');
aliasEnv('EMAIL_FROM', 'EMAIL_FROM_ADDRESS');
aliasEnv('CORS_ORIGIN', 'CORS_ORIGINS');

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'NODE_ENV',
];

function validateEnv() {
  const errors = [];

  // Check required variables
  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Validate JWT_SECRET length (must be >= 32 chars)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // Validate NODE_ENV
  const validEnvs = ['development', 'test', 'production'];
  if (process.env.NODE_ENV && !validEnvs.includes(process.env.NODE_ENV)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string (postgresql://...)');
  }

  if (process.env.NODE_ENV === 'production') {
    const productionRequired = [
      'CORS_ORIGIN',
      'APP_BASE_URL',
      'REDIS_URL',
      'EMAIL_FROM',
      'SENDGRID_API_KEY',
    ];

    for (const key of productionRequired) {
      if (!process.env[key]) {
        errors.push(`Missing production environment variable: ${key}`);
      }
    }

    if (process.env.CORS_ORIGIN === '*') {
      errors.push('CORS_ORIGIN cannot be * in production');
    }

    if (process.env.EMAIL_PROVIDER === 'mock') {
      errors.push('EMAIL_PROVIDER cannot be mock in production');
    }

    if (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('leanstock.local')) {
      errors.push('EMAIL_FROM must be a verified real sender in production');
    }
  }

  // Validate APP_PORT range
  const port = parseInt(process.env.APP_PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('APP_PORT must be a number between 1 and 65535');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('✅ Environment validation passed');
}

validateEnv();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_PORT: parseInt(process.env.APP_PORT || '3000', 10),
  APP_HOST: process.env.APP_HOST || '0.0.0.0',

  DATABASE_URL: process.env.DATABASE_URL,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001',
  APP_BASE_URL: process.env.APP_BASE_URL || `http://localhost:${process.env.APP_PORT || 3000}`,

  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),
  RATE_LIMIT_AUTH_WINDOW_MS: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '60000', 10),

  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_REQUIRED: process.env.REDIS_REQUIRED === 'true' || process.env.NODE_ENV === 'production',
  QUEUE_EMAIL_NAME: process.env.QUEUE_EMAIL_NAME || 'leanstock:queue:email',
  QUEUE_DECAY_NAME: process.env.QUEUE_DECAY_NAME || 'leanstock:queue:decay',
  QUEUE_POLL_TIMEOUT_SECONDS: parseInt(process.env.QUEUE_POLL_TIMEOUT_SECONDS || '5', 10),

  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'mock',
  EMAIL_FROM: process.env.EMAIL_FROM || 'LeanStock <no-reply@leanstock.local>',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,

  EMAIL_VERIFICATION_TTL_MINUTES: parseInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES || '1440', 10),
  PASSWORD_RESET_TTL_MINUTES: parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || '30', 10),

  DEAD_STOCK_THRESHOLD_DAYS: parseInt(process.env.DEAD_STOCK_THRESHOLD_DAYS || '30', 10),
  DEAD_STOCK_DECAY_PERCENT: parseInt(process.env.DEAD_STOCK_DECAY_PERCENT || '10', 10),
  DEAD_STOCK_DECAY_MAX_PERCENT: parseInt(process.env.DEAD_STOCK_DECAY_MAX_PERCENT || '50', 10),

  SYSTEM_USER_ID: process.env.SYSTEM_USER_ID || 'system',

  DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
  MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
};

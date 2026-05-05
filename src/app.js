'use strict';

require('./config/env'); // Validate environment first

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');
const { CORS_ORIGIN } = require('./config/env');

// ── Swagger UI ─────────────────────────────────────────────────────────────────
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const app = express();

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS - No wildcard in production ──────────────────────────────────────────
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
};
app.use(cors(corsOptions));

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  next();
});

// ── Global API rate limit ──────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { getPrismaClient } = require('./config/database');
    await getPrismaClient().$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

// ── Swagger UI ─────────────────────────────────────────────────────────────────
try {
  const openapiPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
  if (fs.existsSync(openapiPath)) {
    const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'LeanStock API',
    }));
    logger.info('Swagger UI available at /api-docs');
  }
} catch (err) {
  logger.warn('Could not load openapi.yaml for Swagger UI:', err.message);
}

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` },
  });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;

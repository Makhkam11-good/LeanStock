'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} = require('../utils/validators');

// POST /auth/register - Rate limited
router.post('/register', authLimiter, validate(registerSchema), ctrl.register);

// POST /auth/login - Rate limited
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);

// POST /auth/refresh-token
router.post('/refresh-token', validate(refreshTokenSchema), ctrl.refreshToken);

// POST /auth/logout
router.post('/logout', ctrl.logout);

// POST /auth/change-password - Requires auth
router.post('/change-password', authenticate, validate(changePasswordSchema), ctrl.changePassword);

// GET /auth/me - Requires auth
router.get('/me', authenticate, ctrl.me);

module.exports = router;

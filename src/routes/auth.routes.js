'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth.middleware');
const { isManager } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  resendVerificationSchema,
} = require('../utils/validators');

// POST /auth/signup - Public company registration with email verification
router.post('/signup', authLimiter, validate(signupSchema), ctrl.signup);

// POST /auth/register - Tenant managers create workers; SYSTEM_ADMIN can assist globally.
router.post('/register', authenticate, isManager, validate(registerSchema), ctrl.register);

// POST /auth/login - Rate limited
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);

// POST /auth/refresh-token
router.post('/refresh-token', validate(refreshTokenSchema), ctrl.refreshToken);

// POST /auth/logout
router.post('/logout', ctrl.logout);

// POST /auth/verify-email
router.post('/verify-email', validate(verifyEmailSchema), ctrl.verifyEmail);

// GET /auth/verify-email?token=...
router.get('/verify-email', ctrl.verifyEmail);

// POST /auth/resend-verification
router.post('/resend-verification', authLimiter, validate(resendVerificationSchema), ctrl.resendVerification);

// POST /auth/request-password-reset
router.post('/request-password-reset', authLimiter, validate(requestPasswordResetSchema), ctrl.requestPasswordReset);

// POST /auth/reset-password
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), ctrl.resetPassword);

// POST /auth/change-password - Requires auth
router.post('/change-password', authenticate, validate(changePasswordSchema), ctrl.changePassword);

// GET /auth/me - Requires auth
router.get('/me', authenticate, ctrl.me);

module.exports = router;

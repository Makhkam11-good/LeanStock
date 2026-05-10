'use strict';

const crypto = require('crypto');
const { getPrismaClient } = require('../config/database');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password.util');
const { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiresAt } = require('../utils/jwt.util');
const { AuthenticationError, ConflictError, ValidationError, NotFoundError } = require('../utils/errors');
const { enqueueEmail } = require('./emailService');
const {
  APP_BASE_URL,
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
} = require('../config/env');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function nonProductionToken(token) {
  return process.env.NODE_ENV === 'production' ? undefined : token;
}

function assertStrongPassword(password, field = 'password') {
  // Validate password strength
  const passwordErrors = validatePasswordStrength(password);
  if (passwordErrors.length > 0) {
    throw new ValidationError('Password does not meet requirements', passwordErrors.map(m => ({ field, message: m })));
  }
}

async function createAuthToken(userId, type, ttlMinutes) {
  const token = createOpaqueToken();
  const tokenHash = hashToken(token);

  await prisma.authToken.create({
    data: {
      user_id: userId,
      token_hash: tokenHash,
      type,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000),
    },
  });

  return token;
}

async function consumeAuthToken(token, type) {
  const tokenHash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const stored = await tx.authToken.findUnique({
      where: { token_hash: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.type !== type || stored.used_at || new Date() > stored.expires_at) {
      throw new AuthenticationError('Token is invalid or expired');
    }

    const consumed = await tx.authToken.updateMany({
      where: {
        id: stored.id,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      data: { used_at: new Date() },
    });

    if (consumed.count !== 1) {
      throw new AuthenticationError('Token is invalid or expired');
    }

    return stored.user;
  });
}

async function queueVerificationEmail(user) {
  const token = await createAuthToken(user.id, 'EMAIL_VERIFICATION', EMAIL_VERIFICATION_TTL_MINUTES);
  const verifyUrl = `${APP_BASE_URL}/api/v1/auth/verify-email?token=${token}`;

  await enqueueEmail({
    to: user.email,
    event_type: 'auth.email_verification',
    subject: 'Verify your LeanStock account',
    text: `Welcome to LeanStock. Verify your account using this link: ${verifyUrl}`,
    html: `<p>Welcome to LeanStock.</p><p><a href="${verifyUrl}">Verify your account</a></p>`,
  });

  return token;
}

async function queuePasswordResetEmail(user) {
  const token = await createAuthToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MINUTES);
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${token}`;

  await enqueueEmail({
    to: user.email,
    event_type: 'auth.password_reset',
    subject: 'Reset your LeanStock password',
    text: `Reset your LeanStock password using this link: ${resetUrl}`,
    html: `<p>Reset your LeanStock password using this link:</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });

  return token;
}

async function register({ email, password, first_name, last_name, phone, role }) {
  assertStrongPassword(password);

  // Check if email is already taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name,
      last_name,
      phone,
      role: role || 'WAREHOUSE_OPERATOR',
      is_email_verified: true,
    },
    select: {
      id: true, email: true, first_name: true, last_name: true, role: true,
      is_active: true, is_email_verified: true, created_at: true,
    },
  });

  logger.info(`User registered: ${email} (${user.role})`);
  return user;
}

async function signup({ email, password, first_name, last_name, phone }) {
  assertStrongPassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  const password_hash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name,
      last_name,
      phone,
      role: 'WAREHOUSE_OPERATOR',
      is_active: true,
      is_email_verified: false,
    },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      is_active: true,
      is_email_verified: true,
      created_at: true,
    },
  });

  const verificationToken = await queueVerificationEmail(user);
  logger.info(`User signed up and verification email queued: ${email}`);

  return {
    ...user,
    verification_required: true,
    verification_token: nonProductionToken(verificationToken),
  };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.is_active) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (!user.is_email_verified) {
    throw new AuthenticationError('Email verification required');
  }

  // Check if account is locked
  if (user.locked_until && new Date() < user.locked_until) {
    const waitSeconds = Math.ceil((user.locked_until - new Date()) / 1000);
    throw new AuthenticationError(`Account temporarily locked. Try again in ${waitSeconds} seconds.`);
  }

  const isValid = await verifyPassword(password, user.password_hash);

  if (!isValid) {
    // Increment failed login count
    const failedCount = user.failed_login_count + 1;
    const lockedUntil = failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failed_login_count: failedCount, locked_until: lockedUntil },
    });

    throw new AuthenticationError('Invalid email or password');
  }

  // Reset failed login count on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failed_login_count: 0, locked_until: null },
  });

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshTokenValue = signRefreshToken({ sub: user.id });

  // Store refresh token in DB
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenValue,
      user_id: user.id,
      expires_at: getRefreshTokenExpiresAt(),
    },
  });

  logger.info(`User logged in: ${email}`);

  return {
    access_token: accessToken,
    refresh_token: refreshTokenValue,
    token_type: 'Bearer',
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
  };
}

async function refreshAccessToken(refreshTokenValue) {
  // Verify JWT signature/expiry
  verifyRefreshToken(refreshTokenValue);

  return prisma.$transaction(async (tx) => {
    // Check if token exists and is not revoked
    const storedToken = await tx.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });

    if (!storedToken || storedToken.revoked || new Date() > storedToken.expires_at) {
      throw new AuthenticationError('Refresh token is invalid or expired');
    }

    if (!storedToken.user.is_active || !storedToken.user.is_email_verified) {
      throw new AuthenticationError('Account is deactivated or not verified');
    }

    const revokeResult = await tx.refreshToken.updateMany({
      where: {
        id: storedToken.id,
        revoked: false,
        expires_at: { gt: new Date() },
      },
      data: { revoked: true },
    });

    if (revokeResult.count !== 1) {
      throw new AuthenticationError('Refresh token is invalid or expired');
    }

    const tokenPayload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    };

    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken({ sub: storedToken.user.id });

    await tx.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: storedToken.user.id,
        expires_at: getRefreshTokenExpiresAt(),
      },
    });

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
    };
  });
}

async function logout(refreshTokenValue) {
  if (!refreshTokenValue) return;

  await prisma.refreshToken.updateMany({
    where: { token: refreshTokenValue },
    data: { revoked: true },
  });

  logger.info('User logged out, refresh token revoked');
}

async function logoutAll(userId) {
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked: false },
    data: { revoked: true },
  });
}

async function changePassword(userId, { current_password, new_password }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const isValid = await verifyPassword(current_password, user.password_hash);
  if (!isValid) throw new AuthenticationError('Current password is incorrect');

  const errors = validatePasswordStrength(new_password);
  if (errors.length > 0) {
    throw new ValidationError('New password does not meet requirements', errors.map(m => ({ field: 'new_password', message: m })));
  }

  const password_hash = await hashPassword(new_password);
  await prisma.user.update({ where: { id: userId }, data: { password_hash } });

  // Revoke all refresh tokens after password change
  await logoutAll(userId);
}

async function verifyEmail(token) {
  const user = await consumeAuthToken(token, 'EMAIL_VERIFICATION');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { is_email_verified: true, is_active: true },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      is_active: true,
      is_email_verified: true,
    },
  });

  await enqueueEmail({
    to: updated.email,
    event_type: 'auth.email_verified',
    subject: 'Your LeanStock account is verified',
    text: 'Your LeanStock account has been verified successfully.',
    html: '<p>Your LeanStock account has been verified successfully.</p>',
  });

  return updated;
}

async function resendVerification(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.is_email_verified) {
    return { message: 'If verification is required, a new email has been sent.' };
  }

  const verificationToken = await queueVerificationEmail(user);
  return {
    message: 'If verification is required, a new email has been sent.',
    verification_token: nonProductionToken(verificationToken),
  };
}

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.is_active) {
    return { message: 'If the account exists, password reset instructions have been sent.' };
  }

  const resetToken = await queuePasswordResetEmail(user);
  return {
    message: 'If the account exists, password reset instructions have been sent.',
    reset_token: nonProductionToken(resetToken),
  };
}

async function resetPassword({ token, new_password }) {
  assertStrongPassword(new_password, 'new_password');

  const user = await consumeAuthToken(token, 'PASSWORD_RESET');
  const password_hash = await hashPassword(new_password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_hash,
      failed_login_count: 0,
      locked_until: null,
    },
  });

  await logoutAll(user.id);
  await enqueueEmail({
    to: user.email,
    event_type: 'auth.password_changed',
    subject: 'Your LeanStock password was changed',
    text: 'Your LeanStock password was changed. If this was not you, contact your administrator.',
    html: '<p>Your LeanStock password was changed. If this was not you, contact your administrator.</p>',
  });

  return { message: 'Password reset successfully' };
}

module.exports = {
  register,
  signup,
  login,
  refreshAccessToken,
  logout,
  logoutAll,
  changePassword,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
};

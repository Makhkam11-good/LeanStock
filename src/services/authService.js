'use strict';

const { getPrismaClient } = require('../config/database');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password.util');
const { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiresAt } = require('../utils/jwt.util');
const { AuthenticationError, ConflictError, ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

async function register({ email, password, first_name, last_name, phone, role }) {
  // Validate password strength
  const passwordErrors = validatePasswordStrength(password);
  if (passwordErrors.length > 0) {
    throw new ValidationError('Password does not meet requirements', passwordErrors.map(m => ({ field: 'password', message: m })));
  }

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
    },
    select: {
      id: true, email: true, first_name: true, last_name: true, role: true,
      is_active: true, created_at: true,
    },
  });

  logger.info(`User registered: ${email} (${user.role})`);
  return user;
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.is_active) {
    throw new AuthenticationError('Invalid email or password');
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

  // Check if token exists and is not revoked
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: true },
  });

  if (!storedToken || storedToken.revoked || new Date() > storedToken.expires_at) {
    throw new AuthenticationError('Refresh token is invalid or expired');
  }

  if (!storedToken.user.is_active) {
    throw new AuthenticationError('Account is deactivated');
  }

  const tokenPayload = {
    sub: storedToken.user.id,
    email: storedToken.user.email,
    role: storedToken.user.role,
  };

  const newAccessToken = signAccessToken(tokenPayload);

  return {
    access_token: newAccessToken,
    token_type: 'Bearer',
  };
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

module.exports = { register, login, refreshAccessToken, logout, logoutAll, changePassword };

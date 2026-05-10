'use strict';

const authService = require('../services/authService');
const { success, created } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');
const { ValidationError } = require('../utils/errors');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  return created(res, user);
});

const signup = asyncHandler(async (req, res) => {
  const user = await authService.signup(req.body);
  return created(res, user);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return success(res, result);
});

const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refreshAccessToken(req.body.refresh_token);
  return success(res, result);
});

const logout = asyncHandler(async (req, res) => {
  const token = req.body?.refresh_token || req.headers['x-refresh-token'];
  await authService.logout(token);
  return success(res, { message: 'Logged out successfully' });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.sub, req.body);
  return success(res, { message: 'Password changed successfully' });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.body?.token || req.query.token;
  if (!token) {
    throw new ValidationError('Verification token is required', [{ field: 'token', message: 'Required' }]);
  }
  const result = await authService.verifyEmail(token);
  return success(res, result);
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body.email);
  return success(res, result);
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body.email);
  return success(res, result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return success(res, result);
});

const me = asyncHandler(async (req, res) => {
  const { getPrismaClient } = require('../config/database');
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, first_name: true, last_name: true, role: true, is_active: true, is_email_verified: true, created_at: true },
  });
  return success(res, user);
});

module.exports = {
  register,
  signup,
  login,
  refreshToken,
  logout,
  changePassword,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  me,
};

'use strict';

const authService = require('../services/authService');
const { success, created } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
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

const me = asyncHandler(async (req, res) => {
  const { getPrismaClient } = require('../config/database');
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, first_name: true, last_name: true, role: true, is_active: true, created_at: true },
  });
  return success(res, user);
});

module.exports = { register, login, refreshToken, logout, changePassword, me };

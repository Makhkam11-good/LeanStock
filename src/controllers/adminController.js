'use strict';

const { success, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');
const adminService = require('../services/adminService');

const listTenants = asyncHandler(async (req, res) => {
  const result = await adminService.listTenants(req.query);
  return paginated(res, result.data, result.pagination);
});

const getTenant = asyncHandler(async (req, res) => {
  const tenant = await adminService.getTenantById(req.params.id);
  return success(res, tenant);
});

const activateTenant = asyncHandler(async (req, res) => {
  const tenant = await adminService.activateTenant(req.params.id);
  return success(res, tenant);
});

const deactivateTenant = asyncHandler(async (req, res) => {
  const tenant = await adminService.deactivateTenant(req.params.id);
  return success(res, tenant);
});

module.exports = {
  listTenants,
  getTenant,
  activateTenant,
  deactivateTenant,
};

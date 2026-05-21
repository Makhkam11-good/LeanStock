'use strict';

const service = require('../services/supplierService');
const { success, created, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listSuppliers = asyncHandler(async (req, res) => {
  const result = await service.listSuppliers(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

const getSupplier = asyncHandler(async (req, res) => success(res, await service.getSupplier(req.params.id, req.user)));

const createSupplier = asyncHandler(async (req, res) => created(res, await service.createSupplier(req.body, req.user)));

const updateSupplier = asyncHandler(async (req, res) => success(res, await service.updateSupplier(req.params.id, req.body, req.user)));

const deactivateSupplier = asyncHandler(async (req, res) => success(res, await service.deactivateSupplier(req.params.id, req.user)));

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, deactivateSupplier };

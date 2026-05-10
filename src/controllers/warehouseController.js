'use strict';

const warehouseService = require('../services/warehouseService');
const { success, created, paginated, noContent } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

// ── Warehouses ─────────────────────────────────────────────────────────────────

const listWarehouses = asyncHandler(async (req, res) => {
  const result = await warehouseService.listWarehouses(req.query);
  return paginated(res, result.data, result.pagination);
});

const getWarehouse = asyncHandler(async (req, res) => {
  const wh = await warehouseService.getWarehouseById(req.params.id);
  return success(res, wh);
});

const createWarehouse = asyncHandler(async (req, res) => {
  const wh = await warehouseService.createWarehouse(req.body);
  return created(res, wh);
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const wh = await warehouseService.updateWarehouse(req.params.id, req.body);
  return success(res, wh);
});

const closeWarehouse = asyncHandler(async (req, res) => {
  const wh = await warehouseService.closeWarehouse(req.params.id);
  return success(res, wh);
});

const hideWarehouse = asyncHandler(async (req, res) => {
  const wh = await warehouseService.hideWarehouse(req.params.id);
  return success(res, wh);
});

// ── Locations ──────────────────────────────────────────────────────────────────

const listLocations = asyncHandler(async (req, res) => {
  const result = await warehouseService.listLocations(req.query);
  return paginated(res, result.data, result.pagination);
});

const getLocation = asyncHandler(async (req, res) => {
  const loc = await warehouseService.getLocationById(req.params.id);
  return success(res, loc);
});

const createLocation = asyncHandler(async (req, res) => {
  const loc = await warehouseService.createLocation(req.body);
  return created(res, loc);
});

const updateLocation = asyncHandler(async (req, res) => {
  const loc = await warehouseService.updateLocation(req.params.id, req.body);
  return success(res, loc);
});

const deleteLocation = asyncHandler(async (req, res) => {
  await warehouseService.deleteLocation(req.params.id);
  return noContent(res);
});

module.exports = {
  listWarehouses, getWarehouse, createWarehouse, updateWarehouse, closeWarehouse, hideWarehouse,
  listLocations, getLocation, createLocation, updateLocation, deleteLocation,
};

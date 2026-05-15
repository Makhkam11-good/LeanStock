'use strict';

const inventoryService = require('../services/inventoryService');
const { success, created, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listInventory = asyncHandler(async (req, res) => {
  const result = await inventoryService.listInventory(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

const getInventory = asyncHandler(async (req, res) => {
  const inv = await inventoryService.getInventoryById(req.params.id, req.user);
  return success(res, inv);
});

const transferStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.transferStockBetweenLocations({
    ...req.body,
    user_id: req.user.sub,
    user: req.user,
  });
  return created(res, result);
});

const receiveStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.receiveStock({
    ...req.body,
    user_id: req.user.sub,
    user: req.user,
  });
  return created(res, result);
});

const sellStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.sellStock({
    ...req.body,
    user_id: req.user.sub,
    user: req.user,
  });
  return created(res, result);
});

const reserveInventory = asyncHandler(async (req, res) => {
  const result = await inventoryService.reserveInventory({
    inventory_id: req.params.id,
    quantity: req.body.quantity,
    user_id: req.user.sub,
    user: req.user,
  });
  return success(res, result);
});

const releaseReservation = asyncHandler(async (req, res) => {
  const result = await inventoryService.releaseReservation({
    inventory_id: req.params.id,
    quantity: req.body.quantity,
    user_id: req.user.sub,
    user: req.user,
  });
  return success(res, result);
});

module.exports = {
  listInventory,
  getInventory,
  transferStock,
  receiveStock,
  sellStock,
  reserveInventory,
  releaseReservation,
};

'use strict';

const service = require('../services/stockMovementService');
const { success, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listStockMovements = asyncHandler(async (req, res) => {
  const result = await service.listStockMovements(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

const getStockMovement = asyncHandler(async (req, res) => {
  const movement = await service.getStockMovement(req.params.id, req.user);
  return success(res, movement);
});

module.exports = {
  listStockMovements,
  getStockMovement,
};

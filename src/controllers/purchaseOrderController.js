'use strict';

const service = require('../services/purchaseOrderService');
const { success, created, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listPurchaseOrders = asyncHandler(async (req, res) => {
  const result = await service.listPurchaseOrders(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

const getPurchaseOrder = asyncHandler(async (req, res) => success(res, await service.getPurchaseOrder(req.params.id, req.user)));

const createPurchaseOrder = asyncHandler(async (req, res) => created(res, await service.createPurchaseOrder(req.body, req.user)));

const updatePurchaseOrder = asyncHandler(async (req, res) => success(res, await service.updateDraftPurchaseOrder(req.params.id, req.body, req.user)));

const submitPurchaseOrder = asyncHandler(async (req, res) => success(res, await service.transitionPurchaseOrder(req.params.id, 'SUBMITTED', req.user)));

const approvePurchaseOrder = asyncHandler(async (req, res) => success(res, await service.transitionPurchaseOrder(req.params.id, 'APPROVED', req.user)));

const cancelPurchaseOrder = asyncHandler(async (req, res) => success(res, await service.transitionPurchaseOrder(req.params.id, 'CANCELLED', req.user)));

const receivePurchaseOrder = asyncHandler(async (req, res) => success(res, await service.receivePurchaseOrder(req.params.id, req.body, req.user)));

module.exports = {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
};

'use strict';

const productService = require('../services/productService');
const { success, created, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, req.user);
  return success(res, product);
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body, req.user);
  return created(res, product);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.user);
  return success(res, product);
});

const discontinueProduct = asyncHandler(async (req, res) => {
  const product = await productService.discontinueProduct(req.params.id, req.user);
  return success(res, product);
});

module.exports = { listProducts, getProduct, createProduct, updateProduct, discontinueProduct };

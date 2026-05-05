'use strict';

const productService = require('../services/productService');
const { success, created, paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query);
  return paginated(res, result.data, result.pagination);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return success(res, product);
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  return created(res, product);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  return success(res, product);
});

const discontinueProduct = asyncHandler(async (req, res) => {
  const product = await productService.discontinueProduct(req.params.id);
  return success(res, product);
});

module.exports = { listProducts, getProduct, createProduct, updateProduct, discontinueProduct };

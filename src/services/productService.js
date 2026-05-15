'use strict';

const { getPrismaClient } = require('../config/database');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { tenantWhere, tenantIdForWrite } = require('../utils/tenantScope');

const prisma = getPrismaClient();

async function listProducts(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const { category, search, is_discontinued } = query;

  const where = { ...tenantWhere(user) };
  if (category) where.category = category;
  if (is_discontinued !== undefined) where.is_discontinued = is_discontinued === 'true';
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.product.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
  });

  return buildPaginationResponse(items, limit);
}

async function getProductById(id, user) {
  const product = await prisma.product.findFirst({ where: { id, ...tenantWhere(user) } });
  if (!product) throw new NotFoundError('Product');
  return product;
}

async function getProductBySku(sku, user) {
  const product = await prisma.product.findFirst({ where: { sku, ...tenantWhere(user) } });
  if (!product) throw new NotFoundError('Product');
  return product;
}

async function createProduct({ sku, name, description, category, base_price, discount_percentage }, user) {
  const tenant_id = tenantIdForWrite(user);
  const existing = await prisma.product.findFirst({ where: { tenant_id, sku } });
  if (existing) throw new ConflictError(`SKU '${sku}' already exists`);

  return prisma.product.create({
    data: { tenant_id, sku, name, description, category, base_price, discount_percentage: discount_percentage || 0 },
  });
}

async function updateProduct(id, data, user) {
  const product = await prisma.product.findFirst({ where: { id, ...tenantWhere(user) } });
  if (!product) throw new NotFoundError('Product');
  return prisma.product.update({ where: { id }, data });
}

async function discontinueProduct(id, user) {
  const product = await prisma.product.findFirst({ where: { id, ...tenantWhere(user) } });
  if (!product) throw new NotFoundError('Product');
  return prisma.product.update({ where: { id }, data: { is_discontinued: true } });
}

module.exports = { listProducts, getProductById, getProductBySku, createProduct, updateProduct, discontinueProduct };

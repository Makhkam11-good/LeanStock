'use strict';

const { getPrismaClient } = require('../config/database');
const { ConflictError, NotFoundError } = require('../utils/errors');
const { getPaginationParams, buildPaginationResponse } = require('../utils/paginator');
const { tenantWhere, tenantIdForWrite } = require('../utils/tenantScope');

const prisma = getPrismaClient();

function includeProducts() {
  return {
    supplier_products: {
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: { created_at: 'asc' },
    },
  };
}

async function listSuppliers(query, user) {
  const { limit, cursor } = getPaginationParams(query);
  const where = { ...tenantWhere(user) };
  if (query.is_active !== undefined) where.is_active = query.is_active === 'true';
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  if (cursor) where.id = { gt: cursor.id };

  const items = await prisma.supplier.findMany({
    where,
    take: limit + 1,
    orderBy: { id: 'asc' },
    include: includeProducts(),
  });
  return buildPaginationResponse(items, limit);
}

async function getSupplier(id, user) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, ...tenantWhere(user) },
    include: includeProducts(),
  });
  if (!supplier) throw new NotFoundError('Supplier');
  return supplier;
}

async function createSupplier(data, user) {
  const tenant_id = tenantIdForWrite(user);
  const existing = await prisma.supplier.findFirst({ where: { tenant_id, name: data.name } });
  if (existing) throw new ConflictError(`Supplier '${data.name}' already exists`);

  return prisma.$transaction(async (tx) => {
    for (const product of data.products || []) {
      const scopedProduct = await tx.product.findFirst({ where: { id: product.product_id, tenant_id } });
      if (!scopedProduct) throw new NotFoundError('Product');
    }

    return tx.supplier.create({
      data: {
        tenant_id,
        name: data.name,
        contact_email: data.contact_email || null,
        phone: data.phone || null,
        lead_time_days: data.lead_time_days || 7,
        supplier_products: {
          create: (data.products || []).map(product => ({
            product_id: product.product_id,
            supplier_sku: product.supplier_sku || null,
            unit_cost: product.unit_cost,
            min_order_quantity: product.min_order_quantity || 1,
          })),
        },
      },
      include: includeProducts(),
    });
  });
}

async function updateSupplier(id, data, user) {
  const tenant_id = tenantIdForWrite(user);
  const supplier = await prisma.supplier.findFirst({ where: { id, tenant_id } });
  if (!supplier) throw new NotFoundError('Supplier');

  return prisma.$transaction(async (tx) => {
    if (data.products) {
      for (const product of data.products) {
        const scopedProduct = await tx.product.findFirst({ where: { id: product.product_id, tenant_id } });
        if (!scopedProduct) throw new NotFoundError('Product');
      }
      await tx.supplierProduct.deleteMany({ where: { supplier_id: id } });
    }

    return tx.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.contact_email !== undefined ? { contact_email: data.contact_email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.lead_time_days !== undefined ? { lead_time_days: data.lead_time_days } : {}),
        ...(data.products ? {
          supplier_products: {
            create: data.products.map(product => ({
              product_id: product.product_id,
              supplier_sku: product.supplier_sku || null,
              unit_cost: product.unit_cost,
              min_order_quantity: product.min_order_quantity || 1,
            })),
          },
        } : {}),
      },
      include: includeProducts(),
    });
  });
}

async function deactivateSupplier(id, user) {
  const supplier = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(user) } });
  if (!supplier) throw new NotFoundError('Supplier');
  return prisma.supplier.update({ where: { id }, data: { is_active: false }, include: includeProducts() });
}

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, deactivateSupplier };

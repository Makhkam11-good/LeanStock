'use strict';

const { getPrismaClient } = require('../config/database');
const { tenantWhere } = require('../utils/tenantScope');

const prisma = getPrismaClient();

function calculateMovingAverageReorder({ inventory, soldQuantity, days = 30, leadTimeDays = 7 }) {
  const dailyDemand = soldQuantity / days;
  const available = inventory.quantity_on_hand - inventory.quantity_reserved;
  const expectedDemandDuringLeadTime = Math.ceil(dailyDemand * leadTimeDays);
  const recommendedOrderQuantity = Math.max(0, expectedDemandDuringLeadTime + inventory.reorder_point - available);

  return {
    daily_demand: Number(dailyDemand.toFixed(2)),
    lead_time_days: leadTimeDays,
    available_quantity: available,
    reorder_point: inventory.reorder_point,
    expected_demand_during_lead_time: expectedDemandDuringLeadTime,
    recommended_order_quantity: recommendedOrderQuantity,
  };
}

async function getReorderForecast(query, user) {
  const days = Number(query.days || 30);
  const leadTimeDays = Number(query.lead_time_days || 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = {
    product: { is: tenantWhere(user) },
    location: { is: { warehouse: { is: { is_hidden: false, ...tenantWhere(user) } } } },
  };
  if (query.product_id) where.product_id = query.product_id;
  if (query.location_id) where.location_id = query.location_id;

  const inventoryRows = await prisma.inventory.findMany({
    where,
    take: 200,
    include: {
      product: { select: { id: true, sku: true, name: true, category: true } },
      location: { select: { id: true, name: true, warehouse: { select: { name: true } } } },
    },
  });

  const forecasts = [];
  for (const inventory of inventoryRows) {
    const sold = await prisma.stockMovement.aggregate({
      where: {
        product_id: inventory.product_id,
        from_location_id: inventory.location_id,
        movement_type: 'OUTGOING',
        status: 'COMPLETED',
        created_at: { gte: since },
      },
      _sum: { quantity: true },
    });

    forecasts.push({
      inventory_id: inventory.id,
      product: inventory.product,
      location: inventory.location,
      window_days: days,
      sold_quantity: sold._sum.quantity || 0,
      ...calculateMovingAverageReorder({
        inventory,
        soldQuantity: sold._sum.quantity || 0,
        days,
        leadTimeDays,
      }),
    });
  }

  return forecasts.sort((a, b) => b.recommended_order_quantity - a.recommended_order_quantity);
}

module.exports = { getReorderForecast, calculateMovingAverageReorder };

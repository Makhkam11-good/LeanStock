'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // ── System user for decay automation ──
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@leanstock.internal' },
    update: {},
    create: {
      id: 'system',
      email: 'system@leanstock.internal',
      password_hash: await bcrypt.hash('SystemNotLoginable1', 10),
      first_name: 'System',
      last_name: 'Automation',
      role: 'SYSTEM_ADMIN',
      is_active: true,
    },
  });
  console.log('  ✓ System user created:', systemUser.email);

  // ── Manager user ──
  const manager = await prisma.user.upsert({
    where: { email: 'manager@leanstock.com' },
    update: {},
    create: {
      email: 'manager@leanstock.com',
      password_hash: await bcrypt.hash('Manager123', 10),
      first_name: 'Alice',
      last_name: 'Manager',
      role: 'MANAGER',
      is_active: true,
    },
  });
  console.log('  ✓ Manager created:', manager.email);

  // ── Operator user ──
  const operator = await prisma.user.upsert({
    where: { email: 'operator@leanstock.com' },
    update: {},
    create: {
      email: 'operator@leanstock.com',
      password_hash: await bcrypt.hash('Operator123', 10),
      first_name: 'Bob',
      last_name: 'Operator',
      role: 'WAREHOUSE_OPERATOR',
      is_active: true,
    },
  });
  console.log('  ✓ Operator created:', operator.email);

  // ── Auditor user ──
  const auditor = await prisma.user.upsert({
    where: { email: 'auditor@leanstock.com' },
    update: {},
    create: {
      email: 'auditor@leanstock.com',
      password_hash: await bcrypt.hash('Auditor123', 10),
      first_name: 'Charlie',
      last_name: 'Auditor',
      role: 'AUDITOR',
      is_active: true,
    },
  });
  console.log('  ✓ Auditor created:', auditor.email);

  // ── Warehouse ──
  const warehouse = await prisma.warehouse.upsert({
    where: { name: 'Main Almaty Warehouse' },
    update: {},
    create: {
      name: 'Main Almaty Warehouse',
      country: 'Kazakhstan',
      city: 'Almaty',
      status: 'ACTIVE',
    },
  });
  console.log('  ✓ Warehouse created:', warehouse.name);

  // ── Locations ──
  const locA = await prisma.location.upsert({
    where: { warehouse_id_name: { warehouse_id: warehouse.id, name: 'Zone A - Electronics' } },
    update: {},
    create: {
      warehouse_id: warehouse.id,
      name: 'Zone A - Electronics',
      address: 'Building 1, Aisle A',
      capacity_units: 5000,
    },
  });
  const locB = await prisma.location.upsert({
    where: { warehouse_id_name: { warehouse_id: warehouse.id, name: 'Zone B - Storage' } },
    update: {},
    create: {
      warehouse_id: warehouse.id,
      name: 'Zone B - Storage',
      address: 'Building 1, Aisle B',
      capacity_units: 3000,
    },
  });
  console.log('  ✓ Locations created: Zone A, Zone B');

  // ── Products ──
  const products = [
    { sku: 'WDG-001', name: 'Industrial Widget', category: 'Electronics', base_price: 99.99 },
    { sku: 'CBL-USB-C', name: 'USB-C Cable 2m', category: 'Cables', base_price: 12.50 },
    { sku: 'SCR-M3', name: 'M3 Screw Pack (100pcs)', category: 'Hardware', base_price: 5.99 },
    { sku: 'BAT-AA-8', name: 'AA Batteries 8-pack', category: 'Electronics', base_price: 8.99 },
    { sku: 'TOOL-SDR', name: 'Precision Screwdriver Set', category: 'Tools', base_price: 34.99 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
  }
  console.log(`  ✓ ${products.length} products created`);

  // ── Inventory with lots ──
  const productRecords = await prisma.product.findMany();
  for (const product of productRecords) {
    const inv = await prisma.inventory.upsert({
      where: { product_id_location_id: { product_id: product.id, location_id: locA.id } },
      update: {},
      create: {
        product_id: product.id,
        location_id: locA.id,
        quantity_on_hand: 200,
        quantity_reserved: 0,
        reorder_point: 50,
        max_stock_level: 500,
      },
    });

    const existingLot = await prisma.inventoryLot.findFirst({
      where: { inventory_id: inv.id },
    });

    if (!existingLot) {
      // Create a lot that's 45 days old (qualifies for decay)
      await prisma.inventoryLot.create({
        data: {
          inventory_id: inv.id,
          lot_code: `SEED-${product.sku}-001`,
          quantity_received: 200,
          quantity_on_hand: 200,
          unit_cost: Number(product.base_price) * 0.6,
          received_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        },
      });
    }
  }
  console.log('  ✓ Inventory and lots created (45 days old for decay testing)');

  // Update location volumes
  await prisma.location.update({
    where: { id: locA.id },
    data: { current_volume: productRecords.length * 200 },
  });

  console.log('\n🎉 Seed complete! Ready for testing.');
  console.log('\n📝 Test accounts:');
  console.log('   Manager:  manager@leanstock.com / Manager123');
  console.log('   Operator: operator@leanstock.com / Operator123');
  console.log('   Auditor:  auditor@leanstock.com / Auditor123');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

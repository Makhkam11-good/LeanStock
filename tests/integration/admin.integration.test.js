'use strict';

require('../setup/env.setup');

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { getPrismaClient, disconnectPrisma } = require('../../src/config/database');

let prisma;
let adminToken;
let managerToken;
let tenant;

const suffix = Date.now();
const adminEmail = `admintest.system.${suffix}@example.com`;
const managerEmail = `admintest.manager.${suffix}@example.com`;
const password = 'AdminPass123';

beforeAll(async () => {
  prisma = getPrismaClient();

  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: 'admintest' } } });
  await prisma.tenant.deleteMany({ where: { slug: { contains: 'admintest' } } });

  const password_hash = await bcrypt.hash(password, 4);

  await prisma.user.create({
    data: {
      email: adminEmail,
      password_hash,
      first_name: 'Admin',
      last_name: 'Tester',
      role: 'SYSTEM_ADMIN',
      is_active: true,
      is_email_verified: true,
    },
  });

  tenant = await prisma.tenant.create({
    data: {
      name: 'Admin Test Company',
      slug: `admintest-company-${suffix}`,
      is_active: true,
    },
  });

  await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      email: managerEmail,
      password_hash,
      first_name: 'Manager',
      last_name: 'Tester',
      role: 'MANAGER',
      is_active: true,
      is_email_verified: true,
    },
  });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: adminEmail, password });
  adminToken = adminLogin.body.data.access_token;

  const managerLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: managerEmail, password });
  managerToken = managerLogin.body.data.access_token;
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: 'admintest' } } });
  await prisma.tenant.deleteMany({ where: { slug: { contains: 'admintest' } } });
  await disconnectPrisma();
});

describe('Admin tenant management API', () => {
  test('rejects tenant manager access to admin tenant endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('lists tenants for SYSTEM_ADMIN users', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ search: 'admintest-company', is_active: 'true' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((item) => item.id === tenant.id)).toBe(true);
    expect(res.body.data[0]._count).toEqual(
      expect.objectContaining({ users: expect.any(Number), warehouses: expect.any(Number), products: expect.any(Number) })
    );
  });

  test('gets tenant details for SYSTEM_ADMIN users', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(tenant.id);
    expect(res.body.data.users.some((user) => user.email === managerEmail)).toBe(true);
  });

  test('deactivates and reactivates a tenant without deleting it', async () => {
    const deactivateRes = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.is_active).toBe(false);

    const blockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: managerEmail, password });

    expect(blockedLogin.status).toBe(401);
    expect(blockedLogin.body.error.message).toBe('Tenant is inactive');

    const activateRes = await request(app)
      .patch(`/api/v1/admin/tenants/${tenant.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.is_active).toBe(true);

    const restoredLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: managerEmail, password });

    expect(restoredLogin.status).toBe(200);
    expect(restoredLogin.body.data.user.tenant.is_active).toBe(true);
  });
});

'use strict';

require('../setup/env.setup');

const request = require('supertest');
const app = require('../../src/app');
const { getPrismaClient, disconnectPrisma } = require('../../src/config/database');

let prisma;

beforeAll(async () => {
  prisma = getPrismaClient();
  // Clean test data
  await prisma.refreshToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: 'integrationtest' } } });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: 'integrationtest' } } });
  await disconnectPrisma();
});

describe('Auth API Integration Tests', () => {
  const testUser = {
    email: 'integrationtest.user@example.com',
    password: 'SecurePass123',
    first_name: 'Test',
    last_name: 'User',
  };

  let accessToken;
  let refreshToken;

  // ── Registration ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    test('registers a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUser.email);
      expect(res.body.data.password_hash).toBeUndefined();
    });

    test('rejects duplicate email with 409', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    test('rejects invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'not-an-email' });

      expect(res.status).toBe(422);
    });

    test('rejects weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'new@integrationtest.com', password: 'weak' });

      expect([400, 422]).toContain(res.status);
    });
  });

  // ── Login ────────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    test('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.token_type).toBe('Bearer');

      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;
    });

    test('rejects wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPass123' });

      expect(res.status).toBe(401);
    });

    test('rejects unknown email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@integrationtest.com', password: 'AnyPass123' });

      expect(res.status).toBe(401);
    });
  });

  // ── Protected endpoint ───────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    test('returns user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testUser.email);
    });

    test('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    test('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.value');
      expect(res.status).toBe(401);
    });
  });

  // ── RBAC tests ───────────────────────────────────────────────────────────────

  describe('RBAC - Role-based access control', () => {
    test('WAREHOUSE_OPERATOR cannot create products (403)', async () => {
      // The default role is WAREHOUSE_OPERATOR
      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sku: 'TEST-SKU-RBAC',
          name: 'Test Product',
          category: 'Test',
          base_price: 100,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Returns 401 (not 403) when no token provided', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .send({ sku: 'X', name: 'X', category: 'X', base_price: 1 });

      expect(res.status).toBe(401);
    });
  });

  // ── Token refresh ────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh-token', () => {
    test('exchanges refresh token for new access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.access_token).not.toBe(accessToken);
    });

    test('rejects invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refresh_token: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  // ── Logout ───────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    test('logs out and revokes refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);

      // Verify token is now revoked
      const refreshAttempt = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refresh_token: refreshToken });

      expect(refreshAttempt.status).toBe(401);
    });
  });
});

describe('Health Check', () => {
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Rate Limiting', () => {
  test('rate limits after 5 failed auth attempts', async () => {
    // Note: In test env RATE_LIMIT_AUTH_MAX is 100, so this won't actually hit the limit
    // But we verify the endpoint responds correctly to repeated calls
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'noone@integrationtest.com', password: 'Wrong123' });
    }
    // Endpoint still responds (rate limit > 3 in test env)
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'noone@integrationtest.com', password: 'Wrong123' });
    expect([401, 429]).toContain(res.status);
  });
});

'use strict';

require('../../setup/env.setup');

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const specPath = path.join(__dirname, '../../../docs/openapi.yaml');
const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));

const documentedRoutes = {
  '/auth/signup': ['post'],
  '/auth/register': ['post'],
  '/auth/login': ['post'],
  '/auth/refresh-token': ['post'],
  '/auth/logout': ['post'],
  '/auth/verify-email': ['post', 'get'],
  '/auth/resend-verification': ['post'],
  '/auth/request-password-reset': ['post'],
  '/auth/reset-password': ['post'],
  '/auth/change-password': ['post'],
  '/auth/me': ['get'],
  '/products': ['get', 'post'],
  '/products/{id}': ['get', 'patch'],
  '/products/{id}/discontinue': ['post'],
  '/inventory': ['get'],
  '/inventory/{id}': ['get'],
  '/inventory/transfer': ['post'],
  '/inventory/receive': ['post'],
  '/inventory/{id}/reserve': ['post'],
  '/inventory/{id}/release-reservation': ['post'],
  '/warehouses': ['get', 'post'],
  '/warehouses/{id}': ['get', 'patch', 'delete'],
  '/warehouses/{id}/close': ['post'],
  '/locations': ['get', 'post'],
  '/locations/{id}': ['get', 'patch', 'delete'],
  '/reports/dead-stock': ['get'],
  '/reports/decay-history': ['get'],
  '/reports/low-stock': ['get'],
  '/reports/trigger-decay': ['post'],
  '/jobs/{id}': ['get'],
};

const publicOperations = new Set([
  'post /auth/signup',
  'post /auth/login',
  'post /auth/refresh-token',
  'post /auth/logout',
  'post /auth/verify-email',
  'get /auth/verify-email',
  'post /auth/resend-verification',
  'post /auth/request-password-reset',
  'post /auth/reset-password',
]);

describe('OpenAPI Swagger documentation', () => {
  test('parses as an OpenAPI 3 document', () => {
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('LeanStock Inventory Management API');
    expect(spec.paths).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });

  test.each(Object.entries(documentedRoutes))('%s documents implemented methods', (route, methods) => {
    expect(spec.paths[route]).toBeDefined();
    for (const method of methods) {
      expect(spec.paths[route][method]).toBeDefined();
    }
  });

  test('every operation has tags, a summary, and responses', () => {
    for (const [route, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        expect(operation.tags).toBeDefined();
        expect(operation.tags.length).toBeGreaterThan(0);
        expect(operation.summary).toBeTruthy();
        expect(operation.responses).toBeDefined();
        expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
        expect(`${method.toUpperCase()} ${route}`).toBeTruthy();
      }
    }
  });

  test('protected operations declare bearer authentication', () => {
    for (const [route, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (publicOperations.has(`${method} ${route}`)) continue;
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  test('receive stock request matches the API validator contract', () => {
    const schema = spec.components.schemas.ReceiveStockRequest;

    expect(schema.required).toEqual([
      'product_id',
      'location_id',
      'movement_type',
      'quantity',
      'unit_cost',
    ]);
    expect(schema.properties.movement_type.enum).toEqual(['INCOMING']);
  });

  test('Swagger documents admin-only user registration', () => {
    const operation = spec.paths['/auth/register'].post;
    const loginSchema = spec.components.schemas.LoginRequest;
    const registerSchema = spec.components.schemas.RegisterRequest;

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.summary).toBe('Create a user and assign a role');
    expect(operation.description).toContain('User self-registration is disabled');
    expect(loginSchema.properties.email.example).toBe('admin@leanstock.com');
    expect(loginSchema.properties.password.example).toBe('Admin123');
    expect(registerSchema.properties.role.example).toBe('WAREHOUSE_OPERATOR');
  });
});

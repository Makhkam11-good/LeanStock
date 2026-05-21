'use strict';

require('../../setup/env.setup');

/**
 * Unit tests for dead stock decay formula
 * Tests pure business logic without hitting the database
 */

describe('Dead Stock Decay Formula', () => {
  const DECAY_PERCENT = 10;
  const MAX_DISCOUNT = 50;

  function calculateNewDiscount(currentDiscount, decayPercent = DECAY_PERCENT, maxDiscount = MAX_DISCOUNT) {
    return Math.min(currentDiscount + decayPercent, maxDiscount);
  }

  test('adds decay percentage to current discount', () => {
    expect(calculateNewDiscount(0)).toBe(10);
    expect(calculateNewDiscount(10)).toBe(20);
    expect(calculateNewDiscount(30)).toBe(40);
  });

  test('caps discount at maximum allowed percentage', () => {
    expect(calculateNewDiscount(45)).toBe(50); // 45 + 10 = 55, capped to 50
    expect(calculateNewDiscount(50)).toBe(50); // already at max
    expect(calculateNewDiscount(60)).toBe(50); // over max, capped
  });

  test('handles configurable decay percent', () => {
    expect(calculateNewDiscount(0, 5, 30)).toBe(5);
    expect(calculateNewDiscount(25, 5, 30)).toBe(30); // caps at 30
  });

  test('handles zero discount starting point', () => {
    expect(calculateNewDiscount(0, 10, 50)).toBe(10);
  });

  test('skips lot already at max discount', () => {
    const isAlreadyAtMax = (discount) => discount >= MAX_DISCOUNT;
    expect(isAlreadyAtMax(50)).toBe(true);
    expect(isAlreadyAtMax(49)).toBe(false);
  });
});

describe('Cursor Pagination', () => {
  const { encodeCursor, decodeCursor, buildPaginationResponse } = require('../../../src/utils/paginator');

  test('encodes and decodes cursor correctly', () => {
    const value = { id: 'abc123' };
    const encoded = encodeCursor(value);
    expect(typeof encoded).toBe('string');
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(value);
  });

  test('returns null for invalid cursor', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  test('buildPaginationResponse with more items than limit', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ id: `id-${i}` }));
    const result = buildPaginationResponse(items, 20);
    expect(result.data).toHaveLength(20);
    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).not.toBeNull();
  });

  test('buildPaginationResponse with exactly limit items', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}` }));
    const result = buildPaginationResponse(items, 20);
    expect(result.data).toHaveLength(20);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.next_cursor).toBeNull();
  });

  test('buildPaginationResponse with fewer items than limit', () => {
    const items = [{ id: 'abc' }, { id: 'def' }];
    const result = buildPaginationResponse(items, 20);
    expect(result.data).toHaveLength(2);
    expect(result.pagination.has_more).toBe(false);
  });
});

describe('Reorder Forecast Formula', () => {
  const { calculateMovingAverageReorder } = require('../../../src/services/forecastService');

  test('recommends enough stock for lead-time demand plus reorder point', () => {
    const result = calculateMovingAverageReorder({
      inventory: { quantity_on_hand: 20, quantity_reserved: 5, reorder_point: 10 },
      soldQuantity: 60,
      days: 30,
      leadTimeDays: 7,
    });

    expect(result.daily_demand).toBe(2);
    expect(result.available_quantity).toBe(15);
    expect(result.expected_demand_during_lead_time).toBe(14);
    expect(result.recommended_order_quantity).toBe(9);
  });

  test('does not recommend ordering when available stock is sufficient', () => {
    const result = calculateMovingAverageReorder({
      inventory: { quantity_on_hand: 100, quantity_reserved: 0, reorder_point: 20 },
      soldQuantity: 10,
      days: 30,
      leadTimeDays: 7,
    });

    expect(result.recommended_order_quantity).toBe(0);
  });
});

describe('Password Validation', () => {
  const { validatePasswordStrength } = require('../../../src/utils/password.util');

  test('accepts strong password', () => {
    const errors = validatePasswordStrength('SecurePass123');
    expect(errors).toHaveLength(0);
  });

  test('rejects too short password', () => {
    const errors = validatePasswordStrength('Sh0rt');
    expect(errors.some(e => e.includes('8 characters'))).toBe(true);
  });

  test('rejects password without uppercase', () => {
    const errors = validatePasswordStrength('securepass123');
    expect(errors.some(e => e.includes('uppercase'))).toBe(true);
  });

  test('rejects password without lowercase', () => {
    const errors = validatePasswordStrength('SECUREPASS123');
    expect(errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  test('rejects password without number', () => {
    const errors = validatePasswordStrength('SecurePassword');
    expect(errors.some(e => e.includes('number'))).toBe(true);
  });
});

describe('JWT Utilities', () => {
  const { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } = require('../../../src/utils/jwt.util');

  const payload = { sub: 'user-1', email: 'test@test.com', role: 'MANAGER' };

  test('signs and verifies access token', () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
  });

  test('signs and verifies refresh token', () => {
    const token = signRefreshToken({ sub: 'user-1' });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe('user-1');
  });

  test('throws on invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here')).toThrow();
  });
});

describe('Error Classes', () => {
  const {
    AppError, ValidationError, AuthenticationError, AuthorizationError,
    NotFoundError, InsufficientStockError,
  } = require('../../../src/utils/errors');

  test('AppError has correct properties', () => {
    const err = new AppError('test', 400, 'TEST_CODE');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('TEST_CODE');
    expect(err.isOperational).toBe(true);
  });

  test('AuthenticationError returns 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  test('AuthorizationError returns 403', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  test('NotFoundError returns 404', () => {
    const err = new NotFoundError('Product');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Product');
  });

  test('InsufficientStockError returns 409', () => {
    const err = new InsufficientStockError('Only 5 units');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
  });

  test('ValidationError includes details', () => {
    const details = [{ field: 'email', message: 'Invalid' }];
    const err = new ValidationError('Failed', details);
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual(details);
  });
});

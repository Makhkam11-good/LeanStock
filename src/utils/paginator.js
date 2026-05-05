'use strict';

const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/env');

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getPaginationParams(query) {
  const limit = Math.min(
    parseInt(query.limit || DEFAULT_PAGE_SIZE, 10),
    MAX_PAGE_SIZE
  );
  const cursor = query.after ? decodeCursor(query.after) : null;
  return { limit, cursor };
}

function buildPaginationResponse(items, limit) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? encodeCursor({ id: data[data.length - 1].id }) : null;

  return {
    data,
    pagination: {
      has_more: hasMore,
      next_cursor: nextCursor,
      count: data.length,
    },
  };
}

module.exports = { encodeCursor, decodeCursor, getPaginationParams, buildPaginationResponse };

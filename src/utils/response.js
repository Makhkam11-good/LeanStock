'use strict';

function success(res, data, statusCode = 200, meta = {}) {
  return res.status(statusCode).json({
    success: true,
    data,
    ...meta,
  });
}

function paginated(res, data, pagination) {
  return res.status(200).json({
    success: true,
    data,
    pagination,
  });
}

function created(res, data) {
  return success(res, data, 201);
}

function noContent(res) {
  return res.status(204).send();
}

module.exports = { success, paginated, created, noContent };

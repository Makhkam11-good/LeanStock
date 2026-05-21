'use strict';

const userService = require('../services/userService');
const { paginated } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query, req.user);
  return paginated(res, result.data, result.pagination);
});

module.exports = {
  listUsers,
};

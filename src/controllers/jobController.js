'use strict';

const { getJob } = require('../jobs/redisQueue');
const { success } = require('../utils/response');
const { NotFoundError } = require('../utils/errors');
const { asyncHandler } = require('../middleware/asyncHandler');

const getJobStatus = asyncHandler(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) throw new NotFoundError('Job');
  return success(res, job);
});

module.exports = { getJobStatus };

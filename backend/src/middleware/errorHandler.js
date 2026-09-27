const logger = require('../utils/logger');

/**
 * The last middleware in the chain (see app.js). Every controller
 * that doesn't handle its own error path ends up here — this is
 * what enforces "never expose internal errors to clients": in
 * production, anything without a known .status/.code collapses to a
 * generic 500 message, and the real error only ever reaches the log,
 * never the response body.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'generic';
  const isKnownError = Boolean(err.status);

  logger.error('Request failed', { status, code, message: err.message, path: req.path });

  const message = isKnownError || process.env.NODE_ENV !== 'production'
    ? err.message
    : 'Something went wrong. Please try again.';

  res.status(status).json({ code, message });
}

module.exports = errorHandler;

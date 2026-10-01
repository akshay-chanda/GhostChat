const rateLimit = require('express-rate-limit');

const { RATE_LIMITS } = require('../utils/constants');

/*
 * Rate limiting for room creation.
 *
 * app.js configures Express to trust the Render reverse proxy,
 * allowing express-rate-limit to correctly determine the client IP.
 *
 * Reloading a page does NOT consume a room-creation attempt.
 * This limiter only runs when POST /api/rooms is requested.
 */
const roomCreationLimiter = rateLimit({
  windowMs: RATE_LIMITS.roomCreation.windowMs,
  max: RATE_LIMITS.roomCreation.max,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    code: 'tooManyRequests',
    message:
      'Too many rooms created. Wait a moment and try again.',
  },

  handler: (req, res) => {
    res.status(429).json({
      code: 'tooManyRequests',
      message:
        'Too many rooms created. Wait a moment and try again.',
    });
  },
});

/*
 * Rate limiting for room join attempts.
 *
 * Applies to:
 * POST /api/rooms/join
 */
const joinAttemptLimiter = rateLimit({
  windowMs: RATE_LIMITS.joinAttempts.windowMs,
  max: RATE_LIMITS.joinAttempts.max,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    code: 'tooManyRequests',
    message:
      'Too many attempts. Wait a moment and try again.',
  },

  handler: (req, res) => {
    res.status(429).json({
      code: 'tooManyRequests',
      message:
        'Too many attempts. Wait a moment and try again.',
    });
  },
});

/*
 * Rate limiting for file uploads.
 */
const filesPerWindowLimiter = rateLimit({
  windowMs: RATE_LIMITS.filesPerWindow.windowMs,
  max: RATE_LIMITS.filesPerWindow.max,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    code: 'tooManyRequests',
    message:
      'Too many file uploads. Wait a moment and try again.',
  },

  handler: (req, res) => {
    res.status(429).json({
      code: 'tooManyRequests',
      message:
        'Too many file uploads. Wait a moment and try again.',
    });
  },
});

module.exports = {
  roomCreationLimiter,
  joinAttemptLimiter,
  filesPerWindowLimiter,
};
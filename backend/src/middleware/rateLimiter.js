const rateLimit = require('express-rate-limit');

const { RATE_LIMITS } = require('../utils/constants');

const roomCreationLimiter = rateLimit({
  windowMs: RATE_LIMITS.roomCreation.windowMs,
  max: RATE_LIMITS.roomCreation.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'tooManyRequests',
    message: 'Too many rooms created. Wait a moment and try again.',
  },
});

const joinAttemptLimiter = rateLimit({
  windowMs: RATE_LIMITS.joinAttempts.windowMs,
  max: RATE_LIMITS.joinAttempts.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'tooManyRequests',
    message: 'Too many attempts. Wait a moment and try again.',
  },
});

const filesPerWindowLimiter = rateLimit({
  windowMs: RATE_LIMITS.filesPerWindow.windowMs,
  max: RATE_LIMITS.filesPerWindow.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'tooManyRequests',
    message: 'Too many file uploads. Wait a moment and try again.',
  },
});

const resetRateLimiter = (limiter) => {
  if (typeof limiter.resetKey === 'function') {
    limiter.resetKey('::ffff:127.0.0.1');
    limiter.resetKey('127.0.0.1');
  }
};

const resetRateLimiters = () => {
  resetRateLimiter(roomCreationLimiter);
  resetRateLimiter(joinAttemptLimiter);
  resetRateLimiter(filesPerWindowLimiter);
};

module.exports = {
  roomCreationLimiter,
  joinAttemptLimiter,
  filesPerWindowLimiter,
  resetRateLimiters,
};
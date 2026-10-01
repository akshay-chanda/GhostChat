const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../utils/constants');

// Keyed by IP by default (express-rate-limit's standard behavior).
// This is the HTTP-side half of the spec's rate-limiting
// requirements; the WebSocket-side equivalent (per-session, since a
// socket has no separate concept of "request") lives inline in
// sockets/messageEvents.js.

const roomCreationLimiter = rateLimit({
  windowMs: RATE_LIMITS.roomCreation.windowMs,
  max: RATE_LIMITS.roomCreation.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'tooManyRequests', message: 'Too many rooms created. Wait a moment and try again.' },
});

const joinAttemptLimiter = rateLimit({
  windowMs: RATE_LIMITS.joinAttempts.windowMs,
  max: RATE_LIMITS.joinAttempts.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'tooManyRequests', message: 'Too many attempts. Wait a moment and try again.' },
});

const filesPerWindowLimiter = rateLimit({
  windowMs: RATE_LIMITS.filesPerWindow.windowMs,
  max: RATE_LIMITS.filesPerWindow.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'tooManyRequests', message: 'Too many file uploads. Wait a moment and try again.' },
});

module.exports = { roomCreationLimiter, joinAttemptLimiter, filesPerWindowLimiter };

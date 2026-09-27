const logger = require('../utils/logger');

/**
 * The one place setTimeout is used for room expiration. Centralizing
 * it here means roomManager never has to remember to clear an old
 * timer before setting a new one (e.g. when the owner extends the
 * duration) — schedule() always does that for you.
 */
const timers = new Map(); // roomId -> Timeout handle

function schedule(roomId, expiresAt, onExpire) {
  cancel(roomId);

  const delayMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const handle = setTimeout(() => {
    timers.delete(roomId);
    try {
      onExpire();
    } catch (err) {
      logger.error('Room expiration callback failed', { roomId, message: err.message });
    }
  }, delayMs);

  timers.set(roomId, handle);
}

function cancel(roomId) {
  const existing = timers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(roomId);
  }
}

module.exports = { schedule, cancel };

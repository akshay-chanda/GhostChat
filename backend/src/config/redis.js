const env = require('./env');
const logger = require('../utils/logger');

/**
 * Redis is optional. Without REDIS_URL set, storage/memoryStore.js
 * is used and this module is inert — a single-instance deployment
 * never needs Redis. Set REDIS_URL to enable storage/redisStore.js
 * and the Socket.IO Redis adapter for multi-instance scaling (see
 * sockets/index.js).
 */
let client = null;

if (env.REDIS_URL) {
  // Lazily required so a deployment without the `redis` package
  // installed (and without REDIS_URL set) never even tries to load it.
  const { createClient } = require('redis');
  client = createClient({ url: env.REDIS_URL });
  client.on('error', (err) => logger.error('Redis client error', { message: err.message }));
  client.connect().catch((err) => logger.error('Redis connection failed', { message: err.message }));
}

module.exports = {
  redisClient: client,
  isRedisEnabled: Boolean(client),
};

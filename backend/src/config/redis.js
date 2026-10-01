const env = require('./env');
const logger = require('../utils/logger');

/**
 * Redis is optional.
 *
 * Without REDIS_URL:
 * - Redis remains disabled.
 * - memoryStore is used.
 * - Socket.IO uses its normal in-process adapter.
 *
 * With REDIS_URL:
 * - Redis is initialized.
 * - redisReady can be awaited before Redis-dependent
 *   infrastructure is used.
 * - Socket.IO can safely initialize its Redis adapter.
 */
let client = null;
let redisReady = Promise.resolve();

if (env.REDIS_URL) {
  // Lazily require redis so deployments without Redis enabled
  // do not need to initialize the Redis client.
  const { createClient } = require('redis');

  client = createClient({
    url: env.REDIS_URL,
  });

  client.on('error', (err) => {
    logger.error('Redis client error', {
      message: err.message,
    });
  });

  /**
   * Start the connection exactly once.
   *
   * Other startup code should await redisReady instead of
   * calling redisClient.connect() again.
   */
  redisReady = client.connect();
}

module.exports = {
  redisClient: client,
  isRedisEnabled: Boolean(client),
  redisReady,
};
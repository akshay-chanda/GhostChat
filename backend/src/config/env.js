require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

const isProduction =
  process.env.NODE_ENV === 'production';

const env = {
  NODE_ENV:
    process.env.NODE_ENV || 'development',

  PORT:
    Number(process.env.PORT || 3000),

  REDIS_URL:
    process.env.REDIS_URL || null,

  // Signs session identifiers in cookies.
  // Never used as a crypto key for message content.
  SESSION_SECRET: isProduction
    ? required('SESSION_SECRET')
    : process.env.SESSION_SECRET ||
      'dev-only-insecure-secret',

  FILE_STORAGE_PATH:
    process.env.FILE_STORAGE_PATH ||
    './uploads',

  MAX_FILE_SIZE:
    Number(
      process.env.MAX_FILE_SIZE ||
        20 * 1024 * 1024
    ),

  /**
   * Frontend origin allowed to access the backend.
   *
   * Local development:
   *   http://localhost:5173
   *
   * Production:
   *   https://ghost-chat-akshay.vercel.app
   *
   * Set CORS_ORIGIN on Render for production instead
   * of relying on the development fallback.
   */
  CORS_ORIGIN: isProduction
    ? required('CORS_ORIGIN')
    : process.env.CORS_ORIGIN ||
      'http://localhost:5173',
};

module.exports = env;
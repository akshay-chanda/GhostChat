require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  REDIS_URL: process.env.REDIS_URL || null,
  // Signs session identifiers in cookies — never used as a crypto key
  // for message content, which is derived client-side from the room
  // password instead. Required in production; a dev fallback is fine
  // locally since dev sessions carry nothing sensitive on their own.
  SESSION_SECRET: process.env.NODE_ENV === 'production'
    ? required('SESSION_SECRET')
    : process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  FILE_STORAGE_PATH: process.env.FILE_STORAGE_PATH || './uploads',
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 20 * 1024 * 1024),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

module.exports = env;

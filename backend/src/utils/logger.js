// A thin console wrapper, not a full logging library — this project
// doesn't need log shipping/rotation, it needs a single choke point
// that makes it structurally hard to accidentally log a password,
// message, or encryption key. Every log call goes through here.

const FORBIDDEN_KEYS = ['password', 'ciphertext', 'iv', 'content', 'roomKey', 'encryptionKey', 'plaintext'];

function redact(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = FORBIDDEN_KEYS.includes(key) ? '[redacted]' : value;
  }
  return clean;
}

function log(level, message, meta) {
  const entry = { level, message, ...redact(meta), timestamp: new Date().toISOString() };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};

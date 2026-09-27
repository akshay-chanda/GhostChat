const argon2 = require('argon2');
const { argon2Options } = require('../config/security');

/**
 * The only two operations allowed on a room password server-side:
 * hash it once at creation, verify it once at join. The plaintext
 * password itself is never stored or logged — see utils/logger.js's
 * redaction list.
 */
async function hashPassword(password) {
  return argon2.hash(password, argon2Options);
}

async function verifyPassword(password, hash) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed hash should fail closed, not throw past the caller.
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };

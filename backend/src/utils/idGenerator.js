const crypto = require('crypto');
const { ROOM_ID_LENGTH, SESSION_ID_BYTES, FILE_ID_BYTES, ANONYMOUS_NAME_POOL } = require('./constants');

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

/**
 * crypto.randomBytes, never Math.random — Room IDs need to resist
 * guessing, not just look random.
 */
function generateRoomId() {
  const bytes = crypto.randomBytes(ROOM_ID_LENGTH);
  return Array.from(bytes, (b) => ROOM_ID_ALPHABET[b % ROOM_ID_ALPHABET.length]).join('');
}

function generateSessionId() {
  return crypto.randomBytes(SESSION_ID_BYTES).toString('hex');
}

function generateFileId() {
  return crypto.randomBytes(FILE_ID_BYTES).toString('hex');
}

/**
 * Random storage filename for an uploaded file — never derived from
 * the original filename, so path traversal / collisions / info
 * leakage through the name are all structurally impossible.
 */
function generateStorageFilename() {
  return `f_${crypto.randomBytes(16).toString('hex')}.bin`;
}

/**
 * Picks an anonymous display name unique within the room. Falls
 * back to a numeric tag once every animal in the pool is taken
 * (rooms cap at 50 participants, well above the pool size, so the
 * fallback path is expected to be reached in a full room).
 */
function generateAnonymousName(existingNames = []) {
  const available = ANONYMOUS_NAME_POOL.filter((name) => !existingNames.includes(`Anonymous ${name}`));
  if (available.length > 0) {
    const pick = available[crypto.randomInt(available.length)];
    return `Anonymous ${pick}`;
  }
  return `Anonymous #${crypto.randomInt(1000, 9999)}`;
}

module.exports = {
  generateRoomId,
  generateSessionId,
  generateFileId,
  generateStorageFilename,
  generateAnonymousName,
};

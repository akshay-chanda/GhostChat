const store = require('../storage/memoryStore');

/**
 * Both the HTTP auth middleware and socketAuth call validateSession
 * rather than touching memoryStore directly — one function owns the
 * definition of "is this session currently valid," so lock/expiry/
 * membership rules can't drift between the HTTP and WebSocket paths.
 */
function validateSession(roomId, sessionId) {
  const room = store.getRoom(roomId);
  if (!room) return null;

  const participant = store.getParticipant(roomId, sessionId);
  if (!participant) return null;

  return participant;
}

/**
 * Called on any activity (message sent, typing, HTTP request) so an
 * inactivity-based expiry sweep — if one is added later — has an
 * accurate signal to check against. Not currently paired with an
 * automatic sweep; the room's own timer (expirationService) is the
 * only expiry mechanism actually enforced right now.
 */
function touchSession(roomId, sessionId) {
  const participant = store.getParticipant(roomId, sessionId);
  if (participant) participant.lastActiveAt = new Date().toISOString();
}

function destroySession(roomId, sessionId) {
  return store.removeParticipant(roomId, sessionId);
}

module.exports = { validateSession, touchSession, destroySession };

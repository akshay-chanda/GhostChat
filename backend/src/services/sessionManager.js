const store = require('../storage/memoryStore');

/**
 * Session management uses TWO private authentication values:
 *
 * - sessionId: PRIVATE session identifier.
 * - sessionSecret: PRIVATE authentication secret.
 *
 * Both are required to authenticate a participant.
 *
 * participantId is completely separate and is PUBLIC.
 *
 * SECURITY RULES:
 * - Never return sessionId to other participants.
 * - Never return sessionSecret to other participants.
 * - Never use participantId as an authentication credential.
 * - Knowing only a sessionId must NOT authenticate a session.
 *
 * Both HTTP auth middleware and socketAuth call validateSession(),
 * so the authentication rule remains identical for HTTP and WebSocket
 * connections.
 */

/**
 * Validate a private session.
 *
 * Authentication requires BOTH:
 *
 *   roomId
 *   sessionId
 *   sessionSecret
 *
 * A leaked sessionId by itself is therefore insufficient.
 */
function validateSession(
  roomId,
  sessionId,
  sessionSecret
) {
  if (
    !roomId ||
    !sessionId ||
    !sessionSecret
  ) {
    return null;
  }

  const room = store.getRoom(roomId);

  if (!room) {
    return null;
  }

  // The store lookup intentionally uses the PRIVATE sessionId.
  // Never change this to participantId.
  const participant = store.getParticipant(
    roomId,
    sessionId
  );

  if (!participant) {
    return null;
  }

  // The session secret must match the secret stored for
  // this exact session.
  if (
    !participant.sessionSecret ||
    participant.sessionSecret !== sessionSecret
  ) {
    return null;
  }

  return participant;
}

/**
 * Called on authenticated activity such as:
 *
 * - message sending
 * - HTTP requests
 * - other authenticated actions
 *
 * sessionId and sessionSecret are both required so this function
 * cannot be used to update a session using only a leaked sessionId.
 */
function touchSession(
  roomId,
  sessionId,
  sessionSecret
) {
  if (
    !roomId ||
    !sessionId ||
    !sessionSecret
  ) {
    return;
  }

  const participant = validateSession(
    roomId,
    sessionId,
    sessionSecret
  );

  if (participant) {
    participant.lastActiveAt =
      new Date().toISOString();
  }
}

/**
 * Destroy/remove an authenticated session.
 *
 * sessionId is still used internally as the store key, but the
 * caller must prove possession of the matching sessionSecret first.
 *
 * Returns false if authentication fails or the participant does
 * not exist.
 */
function destroySession(
  roomId,
  sessionId,
  sessionSecret
) {
  if (
    !roomId ||
    !sessionId ||
    !sessionSecret
  ) {
    return false;
  }

  const participant = validateSession(
    roomId,
    sessionId,
    sessionSecret
  );

  if (!participant) {
    return false;
  }

  return store.removeParticipant(
    roomId,
    sessionId
  );
}

module.exports = {
  validateSession,
  touchSession,
  destroySession,
};
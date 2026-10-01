const sessionManager = require('../services/sessionManager');

/**
 * Runs before any 'connection' handler fires. A socket that fails
 * this never gets a connection event at all — there's no window
 * where an unauthenticated socket can emit anything into a room.
 *
 * This is the WebSocket-side equivalent of middleware/auth.js on
 * the HTTP side; both ultimately call the same sessionManager check.
 *
 * SECURITY:
 * - sessionId is a PRIVATE authentication credential.
 * - sessionSecret is a PRIVATE authentication credential.
 * - BOTH are required for authentication.
 * - participantId is the PUBLIC identifier used by room events,
 *   messages, typing indicators, and participant lists.
 * - Never send socket.data.sessionId or
 *   socket.data.sessionSecret to another client.
 */
function socketAuth(socket, next) {
  const {
    roomId,
    sessionId,
    sessionSecret,
  } = socket.handshake.auth || {};

  /**
   * Both private credentials are mandatory.
   *
   * A sessionId without a sessionSecret must be rejected.
   * This is the important protection against cross-user
   * authentication using a leaked sessionId.
   */
  if (
    !roomId ||
    !sessionId ||
    !sessionSecret
  ) {
    return next(
      new Error(
        'Missing room or session credentials.'
      )
    );
  }

  /**
   * Validate BOTH private credentials against the
   * server-side participant record.
   */
  const participant =
    sessionManager.validateSession(
      roomId,
      sessionId,
      sessionSecret
    );

  if (!participant) {
    return next(
      new Error(
        'Invalid or expired session.'
      )
    );
  }

  socket.data.roomId = roomId;

  // PRIVATE — never expose this to other clients.
  socket.data.sessionId = sessionId;

  // PRIVATE — never expose this to other clients.
  //
  // It is kept only so server-side socket operations can
  // authenticate using the same credential pair when needed.
  socket.data.sessionSecret = sessionSecret;

  // PUBLIC — safe to use in participant-facing events.
  socket.data.participantId =
    participant.participantId;

  socket.data.anonymousName =
    participant.anonymousName;

  socket.data.isOwner =
    participant.isOwner;

  next();
}

module.exports = socketAuth;
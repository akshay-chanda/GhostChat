const sessionManager = require('../services/sessionManager');

/**
 * Runs before any 'connection' handler fires. A socket that fails
 * this never gets a connection event at all — there's no window
 * where an unauthenticated socket can emit anything into a room.
 * This is the WebSocket-side equivalent of middleware/auth.js on
 * the HTTP side; both ultimately call the same sessionManager check.
 */
function socketAuth(socket, next) {
  const { roomId, sessionId } = socket.handshake.auth || {};

  if (!roomId || !sessionId) {
    return next(new Error('Missing room or session credentials.'));
  }

  const participant = sessionManager.validateSession(roomId, sessionId);
  if (!participant) {
    return next(new Error('Invalid or expired session.'));
  }

  socket.data.roomId = roomId;
  socket.data.sessionId = sessionId;
  socket.data.anonymousName = participant.anonymousName;
  socket.data.isOwner = participant.isOwner;

  next();
}

module.exports = socketAuth;

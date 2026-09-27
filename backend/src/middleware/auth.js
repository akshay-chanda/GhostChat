const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const SESSION_COOKIE = 'gc_session';
const SESSION_HEADER = 'x-session-id';

function unauthenticated(res, message = 'Your session has expired.') {
  return res.status(401).json({
    code: 'unauthorized',
    message,
  });
}

/**
 * Resolves {sessionId, roomId} from either an explicit X-Session-Id
 * header (preferred) or the signed cookie.
 *
 * For normal room routes, roomId comes from req.params.roomId.
 *
 * For file download routes such as:
 *
 *   /files/:fileId/download
 *
 * roomId is resolved from the stored file metadata because the route
 * contains fileId rather than roomId.
 */
function resolveSession(req) {
  const headerSessionId = req.get(SESSION_HEADER);

  if (headerSessionId) {
    let roomId = req.params.roomId;

    // File download routes do not have :roomId.
    // Resolve the room from the stored file metadata instead.
    if (!roomId && req.params.fileId) {
      const file = store.getFile(req.params.fileId);
      roomId = file?.roomId;
    }

    return {
      sessionId: headerSessionId,
      roomId,
    };
  }

  const raw = req.signedCookies?.[SESSION_COOKIE];

  if (!raw) return null;

  try {
    const session = JSON.parse(raw);

    // Normally the signed cookie already contains the roomId.
    // For file routes, preserve that value if present.
    return session;
  } catch {
    return null;
  }
}

/**
 * Re-validates the resolved session against live room/participant
 * state and attaches req.session for controllers to use.
 */
function requireSession(req, res, next) {
  const resolved = resolveSession(req);

  if (!resolved) {
    return unauthenticated(res, 'No active session.');
  }

  const { sessionId, roomId } = resolved;

  if (!sessionId || !roomId) {
    return unauthenticated(res, 'Invalid session.');
  }

  const routeRoomId = req.params.roomId;

  if (routeRoomId && routeRoomId !== roomId) {
    return res.status(403).json({
      code: 'unauthorized',
      message: 'This session doesn’t belong to that room.',
    });
  }

  // For file download requests, verify that the requested file
  // actually belongs to the authenticated room.
  if (req.params.fileId) {
    const file = store.getFile(req.params.fileId);

    if (!file) {
      return res.status(404).json({
        code: 'generic',
        message: 'File not found or has expired.',
      });
    }

    if (file.roomId !== roomId) {
      return res.status(403).json({
        code: 'unauthorized',
        message: 'This file does not belong to this room.',
      });
    }
  }

  const participant = sessionManager.validateSession(
    roomId,
    sessionId
  );

  if (!participant) {
    return unauthenticated(res);
  }

  sessionManager.touchSession(roomId, sessionId);

  req.session = {
    sessionId,
    roomId,
    anonymousName: participant.anonymousName,
    isOwner: participant.isOwner,
  };

  next();
}

function requireOwner(req, res, next) {
  if (!req.session?.isOwner) {
    return res.status(403).json({
      code: 'unauthorized',
      message: 'Only the room owner can do that.',
    });
  }

  next();
}

module.exports = {
  requireSession,
  requireOwner,
};
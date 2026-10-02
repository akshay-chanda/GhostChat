const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const SESSION_HEADER = 'x-session-id';
const SESSION_SECRET_HEADER = 'x-session-secret';

function unauthenticated(
  res,
  message = 'Your session has expired.'
) {
  return res.status(401).json({
    code: 'unauthorized',
    message,
  });
}

/**
 * Resolves PRIVATE authentication credentials
 * exclusively from request headers.
 *
 * Required:
 *   X-Session-Id
 *   X-Session-Secret
 *
 * SECURITY:
 * - sessionId is PRIVATE.
 * - sessionSecret is PRIVATE.
 * - Both are required.
 * - participantId is NOT an authentication credential.
 *
 * For normal room routes:
 *   roomId comes from req.params.roomId
 *
 * For file routes:
 *   roomId is resolved from stored file metadata.
 */
function resolveSession(req) {
  const sessionId = req.get(SESSION_HEADER);
  const sessionSecret = req.get(SESSION_SECRET_HEADER);

  /**
   * Header authentication is mandatory.
   *
   * Never fall back to cookies.
   */
  if (!sessionId || !sessionSecret) {
    return null;
  }

  let roomId = req.params.roomId;

  /**
   * File download routes do not contain :roomId.
   * Resolve the room from stored file metadata.
   */
  if (!roomId && req.params.fileId) {
    const file = store.getFile(req.params.fileId);
    roomId = file?.roomId;
  }

  return {
    sessionId,
    sessionSecret,
    roomId,
  };
}

/**
 * Re-validates the resolved PRIVATE session against
 * live room/participant state.
 */
function requireSession(
  req,
  res,
  next
) {
  const resolved = resolveSession(req);

  if (!resolved) {
    return unauthenticated(
      res,
      'No active session.'
    );
  }

  const {
    sessionId,
    sessionSecret,
    roomId,
  } = resolved;

  if (
    !sessionId ||
    !sessionSecret ||
    !roomId
  ) {
    return unauthenticated(
      res,
      'Invalid session.'
    );
  }

  /**
   * Prevent a valid session from being used
   * against another room.
   */
  const routeRoomId = req.params.roomId;

  if (
    routeRoomId &&
    routeRoomId !== roomId
  ) {
    return res.status(403).json({
      code: 'unauthorized',
      message:
        'This session doesn’t belong to that room.',
    });
  }

  /**
   * For file download requests, verify that the
   * requested file belongs to the authenticated room.
   */
  if (req.params.fileId) {
    const file = store.getFile(
      req.params.fileId
    );

    if (!file) {
      return res.status(404).json({
        code: 'generic',
        message:
          'File not found or has expired.',
      });
    }

    if (file.roomId !== roomId) {
      return res.status(403).json({
        code: 'unauthorized',
        message:
          'This file does not belong to this room.',
      });
    }
  }

  /**
   * Validate BOTH private credentials against
   * the live participant record.
   */
  const participant =
    sessionManager.validateSession(
      roomId,
      sessionId,
      sessionSecret
    );

  if (!participant) {
    return unauthenticated(res);
  }

  /**
   * Update activity using BOTH private credentials.
   */
  sessionManager.touchSession(
    roomId,
    sessionId,
    sessionSecret
  );

  /**
   * req.session contains only the information
   * downstream controllers need.
   *
   * sessionSecret is deliberately NOT copied here.
   */
  req.session = {
    sessionId,
    participantId:
      participant.participantId,
    roomId,
    anonymousName:
      participant.anonymousName,
    isOwner:
      participant.isOwner,
  };

  next();
}

/**
 * Must be used after requireSession.
 *
 * Owner authorization is based on the authenticated
 * private session, never on participantId supplied
 * by the client.
 */
function requireOwner(
  req,
  res,
  next
) {
  if (!req.session?.isOwner) {
    return res.status(403).json({
      code: 'unauthorized',
      message:
        'Only the room owner can do that.',
    });
  }

  next();
}

module.exports = {
  requireSession,
  requireOwner,
};
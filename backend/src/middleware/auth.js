const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const SESSION_COOKIE = 'gc_session';
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
 * Resolves the PRIVATE authentication values from either:
 *
 * 1. Explicit headers:
 *    - X-Session-Id
 *    - X-Session-Secret
 *
 * 2. Signed session cookie.
 *
 * SECURITY:
 * - sessionId is PRIVATE.
 * - sessionSecret is PRIVATE.
 * - Both are required for authentication.
 * - Neither may be exposed to other participants.
 * - participantId is NOT accepted as an authentication credential.
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
  const headerSessionId =
    req.get(SESSION_HEADER);

  const headerSessionSecret =
    req.get(SESSION_SECRET_HEADER);

  /**
   * Header authentication.
   *
   * If either credential is supplied through headers, require BOTH.
   * This prevents falling back to cookie authentication while a
   * partial credential is being supplied.
   */
  if (
    headerSessionId ||
    headerSessionSecret
  ) {
    if (
      !headerSessionId ||
      !headerSessionSecret
    ) {
      return null;
    }

    let roomId = req.params.roomId;

    // File download routes do not have :roomId.
    // Resolve the room from stored file metadata instead.
    if (
      !roomId &&
      req.params.fileId
    ) {
      const file =
        store.getFile(
          req.params.fileId
        );

      roomId = file?.roomId;
    }

    return {
      sessionId: headerSessionId,
      sessionSecret: headerSessionSecret,
      roomId,
    };
  }

  /**
   * Fall back to the signed session cookie.
   *
   * The cookie is server-authentication state, not public
   * participant identity.
   *
   * The cookie must contain both:
   *
   *   sessionId
   *   sessionSecret
   *
   * Older cookies containing only sessionId will therefore
   * fail authentication instead of retaining the old
   * sessionId-only authentication behavior.
   */
  const raw =
    req.signedCookies?.[SESSION_COOKIE];

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw);

    if (
      !session?.sessionId ||
      !session?.sessionSecret
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Re-validates the resolved PRIVATE session against live
 * room/participant state and attaches authenticated session
 * information to req.session.
 */
function requireSession(
  req,
  res,
  next
) {
  const resolved =
    resolveSession(req);

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

  /**
   * Both sessionId and sessionSecret are PRIVATE
   * authentication credentials.
   *
   * participantId is deliberately not accepted as
   * a replacement.
   */
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

  const routeRoomId =
    req.params.roomId;

  /**
   * Prevent a valid session from being used against
   * another room.
   */
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
   * For file download requests, verify that the requested
   * file actually belongs to the authenticated room.
   */
  if (req.params.fileId) {
    const file =
      store.getFile(
        req.params.fileId
      );

    if (!file) {
      return res.status(404).json({
        code: 'generic',
        message:
          'File not found or has expired.',
      });
    }

    if (
      file.roomId !== roomId
    ) {
      return res.status(403).json({
        code: 'unauthorized',
        message:
          'This file does not belong to this room.',
      });
    }
  }

  /**
   * Validate BOTH private authentication credentials
   * against the live participant record.
   *
   * A leaked sessionId alone is no longer sufficient.
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
   * req.session is server-side request state.
   *
   * sessionId:
   *   PRIVATE authentication identifier.
   *
   * participantId:
   *   PUBLIC identity.
   *
   * sessionSecret is intentionally NOT copied into
   * req.session so it is less likely to be accidentally
   * logged or exposed by downstream controllers.
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
 * Owner authorization is based on the authenticated session,
 * not on any participantId supplied by the client.
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
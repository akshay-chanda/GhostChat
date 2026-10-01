const crypto = require('crypto');

/**
 * A participant is deliberately thin — no device info, no IP, no
 * fingerprint, per the anonymous-presence requirement.
 *
 * SECURITY MODEL:
 *
 * - sessionId is a PRIVATE session identifier.
 * - sessionSecret is a PRIVATE authentication credential.
 * - participantId is a PUBLIC identifier.
 *
 * Authentication must require BOTH sessionId and sessionSecret.
 * Knowing only a sessionId must not be sufficient to authenticate
 * as another participant.
 *
 * participantId is used for:
 * - participant lists
 * - messages
 * - typing indicators
 * - presence events
 *
 * sessionId and sessionSecret must NEVER be broadcast to other
 * participants or included in public room information.
 */
function createParticipant({
  sessionId,
  sessionSecret,
  participantId,
  anonymousName,
  isOwner = false,
}) {
  const now = new Date().toISOString();

  return {
    // PRIVATE: session identifier.
    sessionId,

    // PRIVATE: required together with sessionId for authentication.
    //
    // Generate one automatically if the caller does not provide one.
    // This keeps the model safe while allowing roomManager to explicitly
    // generate/provide the credential later if needed.
    sessionSecret:
      sessionSecret || crypto.randomBytes(32).toString('hex'),

    // PUBLIC: safe to send to other participants.
    participantId,

    anonymousName,
    isOwner,
    joinedAt: now,
    lastActiveAt: now,
  };
}

module.exports = {
  createParticipant,
};
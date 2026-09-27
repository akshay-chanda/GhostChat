/**
 * A participant is deliberately thin — no device info, no IP, no
 * fingerprint, per the anonymous-presence requirement. anonymousName
 * is the only thing that identifies them to other people in the room.
 */
function createParticipant({ sessionId, anonymousName, isOwner = false }) {
  const now = new Date().toISOString();
  return {
    sessionId,
    anonymousName,
    isOwner,
    joinedAt: now,
    lastActiveAt: now,
  };
}

module.exports = { createParticipant };
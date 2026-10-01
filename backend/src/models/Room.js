/**
 * Plain factory, not a database schema — there's no ORM here, so
 * this exists purely to give the room's shape one canonical
 * definition instead of an inline object literal duplicated between
 * roomManager and anywhere else that might construct one (tests,
 * for instance). memoryStore/redisStore just hold whatever shape is
 * handed to them; this is that shape.
 *
 * IMPORTANT:
 * room.ownerId is the owner's PRIVATE sessionId.
 * It must NEVER be exposed to clients.
 */
function createRoomRecord({
  roomId,
  roomName = null,
  passwordHash,
  ownerId,
  maxParticipants,
  allowFileSharing = true,
  expiresAt,
}) {
  return {
    roomId,
    roomName,
    passwordHash,

    // PRIVATE:
    // This is the owner's sessionId.
    // Used only for server-side authorization.
    ownerId,

    locked: false,
    acceptingNewMembers: true,
    fileSharingEnabled: allowFileSharing,
    maxParticipants,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
}

/**
 * Convert an internal room object into the PUBLIC representation
 * that is safe to send to frontend clients.
 *
 * SECURITY:
 * - passwordHash is never returned.
 * - room.ownerId is NEVER returned.
 * - ownerParticipantId is the PUBLIC participant identifier.
 *
 * The parameter name `ownerParticipantId` makes the distinction
 * explicit and prevents accidentally exposing the private sessionId.
 */
function toPublicRoom(
  room,
  participantCount,
  ownerParticipantId = null
) {
  if (!room) {
    return null;
  }

  return {
    roomId: room.roomId,
    roomName: room.roomName,
    locked: room.locked,
    acceptingNewMembers: room.acceptingNewMembers,
    fileSharingEnabled: room.fileSharingEnabled,
    maxParticipants: room.maxParticipants,
    participantCount,

    // PUBLIC owner identifier.
    //
    // IMPORTANT:
    // This must be participantId, NOT room.ownerId/sessionId.
    ownerId: ownerParticipantId,

    expiresAt: room.expiresAt,
  };
}

module.exports = {
  createRoomRecord,
  toPublicRoom,
};
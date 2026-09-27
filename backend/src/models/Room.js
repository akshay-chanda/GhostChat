/**
 * Plain factory, not a database schema — there's no ORM here, so
 * this exists purely to give the room's shape one canonical
 * definition instead of an inline object literal duplicated between
 * roomManager and anywhere else that might construct one (tests,
 * for instance). memoryStore/redisStore just hold whatever shape is
 * handed to them; this is that shape.
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
 * The subset of a Room safe to send to clients — never includes
 * passwordHash. roomManager.getPublicRoomInfo is the one place this
 * projection actually happens; this function just names that shape.
 */
function toPublicRoom(room, participantCount) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    locked: room.locked,
    acceptingNewMembers: room.acceptingNewMembers,
    fileSharingEnabled: room.fileSharingEnabled,
    maxParticipants: room.maxParticipants,
    participantCount,
    ownerId: room.ownerId,
    expiresAt: room.expiresAt,
  };
}

module.exports = { createRoomRecord, toPublicRoom };

const store = require('../storage/memoryStore');
const passwordService = require('./passwordService');
const sessionManager = require('./sessionManager');
const expirationService = require('./expirationService');
const fileStorageService = require('./fileStorageService');

const {
  createRoomRecord,
  toPublicRoom,
} = require('../models/Room');

const {
  createParticipant,
} = require('../models/Participant');

const {
  generateRoomId,
  generateSessionId,
  generateAnonymousName,
} = require('../utils/idGenerator');

const {
  DEFAULT_MAX_PARTICIPANTS,
  HARD_MAX_PARTICIPANTS,
  ROOM_DURATIONS_SECONDS,
} = require('../utils/constants');

function unauthorizedError(message = 'Unauthorized action.') {
  const error = new Error(message);

  error.status = 403;
  error.code = 'unauthorized';

  return error;
}

function assertOwner(room, sessionId) {
  if (!room || room.ownerId !== sessionId) {
    throw unauthorizedError();
  }
}

/**
 * Create a new room
 */
async function createRoom({
  roomName,
  passwordHash,
  duration,
  maxParticipants,
  allowFileSharing,
}) {
  const roomId = generateRoomId();
  const ownerSessionId = generateSessionId();
  const anonymousName = generateAnonymousName();

  const safeDuration = ROOM_DURATIONS_SECONDS.includes(duration)
    ? duration
    : 1800;

  const requestedMaxParticipants = Number(maxParticipants);

  const safeMaxParticipants = Math.min(
    Math.max(
      Number.isFinite(requestedMaxParticipants)
        ? requestedMaxParticipants
        : DEFAULT_MAX_PARTICIPANTS,
      2
    ),
    HARD_MAX_PARTICIPANTS
  );

  const expiresAt = new Date(
    Date.now() + safeDuration * 1000
  ).toISOString();

  const room = createRoomRecord({
    roomId,
    roomName,
    passwordHash,
    ownerId: ownerSessionId,
    maxParticipants: safeMaxParticipants,
    allowFileSharing: allowFileSharing !== false,
    expiresAt,
  });

  store.createRoom(room);

  const owner = createParticipant({
    sessionId: ownerSessionId,
    anonymousName,
    isOwner: true,
  });

  store.addParticipant(roomId, owner);

  expirationService.schedule(
    roomId,
    expiresAt,
    () => destroyRoomInternal(roomId)
  );

  return {
    room,
    owner,
  };
}

/**
 * Join an existing room
 */
async function joinRoom({ roomId, password }) {
  const room = store.getRoom(roomId);

  if (!room) {
    return {
      ok: false,
      reason: 'notFound',
    };
  }

  const passwordValid = await passwordService.verifyPassword(
    password,
    room.passwordHash
  );

  // Prevent room enumeration
  if (!passwordValid) {
    return {
      ok: false,
      reason: 'notFound',
    };
  }

  if (room.locked || !room.acceptingNewMembers) {
    return {
      ok: false,
      reason: 'locked',
    };
  }

  const currentParticipants = store.getParticipants(roomId);

  if (currentParticipants.length >= room.maxParticipants) {
    return {
      ok: false,
      reason: 'full',
    };
  }

  const sessionId = generateSessionId();

  const anonymousName = generateAnonymousName(
    currentParticipants.map(
      (participant) => participant.anonymousName
    )
  );

  const participant = createParticipant({
    sessionId,
    anonymousName,
    isOwner: false,
  });

  store.addParticipant(roomId, participant);

  return {
    ok: true,
    participant,
  };
}

/**
 * Get public room information
 */
function getPublicRoomInfo(roomId) {
  const room = store.getRoom(roomId);

  if (!room) {
    return null;
  }

  const participants = store.getParticipants(roomId);

  return toPublicRoom(
    room,
    participants.length
  );
}

/**
 * Lock or unlock a room
 */
function setLocked(roomId, sessionId, locked) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, sessionId);

  store.updateRoom(roomId, {
    locked: Boolean(locked),
  });
}

/**
 * Enable or disable new members
 */
function setAcceptingNewMembers(
  roomId,
  sessionId,
  accepting
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, sessionId);

  store.updateRoom(roomId, {
    acceptingNewMembers: Boolean(accepting),
  });
}

/**
 * Enable or disable file sharing
 */
function setFileSharingEnabled(
  roomId,
  sessionId,
  enabled
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, sessionId);

  store.updateRoom(roomId, {
    fileSharingEnabled: Boolean(enabled),
  });
}

/**
 * Update maximum participants
 */
function setMaxParticipants(
  roomId,
  sessionId,
  maxParticipants
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, sessionId);

  const parsedMaxParticipants = Number(maxParticipants);

  if (!Number.isFinite(parsedMaxParticipants)) {
    throw new Error('Invalid maximum participant count.');
  }

  const clampedMaxParticipants = Math.min(
    Math.max(2, parsedMaxParticipants),
    HARD_MAX_PARTICIPANTS
  );

  store.updateRoom(roomId, {
    maxParticipants: clampedMaxParticipants,
  });
}

/**
 * Extend room expiration
 */
function extendExpiration(
  roomId,
  sessionId,
  additionalSeconds
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, sessionId);

  const safeAdditionalSeconds = Number(additionalSeconds);

  if (
    !Number.isFinite(safeAdditionalSeconds) ||
    safeAdditionalSeconds <= 0
  ) {
    throw new Error('Invalid expiration extension.');
  }

  const newExpiresAt = new Date(
    new Date(room.expiresAt).getTime() +
      safeAdditionalSeconds * 1000
  ).toISOString();

  store.updateRoom(roomId, {
    expiresAt: newExpiresAt,
  });

  expirationService.schedule(
    roomId,
    newExpiresAt,
    () => destroyRoomInternal(roomId)
  );

  return newExpiresAt;
}

/**
 * Remove a participant
 */
function removeParticipant(
  roomId,
  requesterSessionId,
  targetSessionId
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(room, requesterSessionId);

  if (targetSessionId === room.ownerId) {
    throw unauthorizedError(
      'The room owner cannot be removed.'
    );
  }

  sessionManager.destroySession(
    roomId,
    targetSessionId
  );
}

/**
 * Explicitly destroy a room
 */
function destroyRoom(roomId, sessionId) {
  const room = store.getRoom(roomId);

  if (!room) {
    return false;
  }

  assertOwner(room, sessionId);

  return destroyRoomInternal(roomId);
}

/**
 * Internal room cleanup
 *
 * This function is safe to call multiple times.
 */
function destroyRoomInternal(roomId) {
  const room = store.getRoom(roomId);

  // Always cancel a possible expiration timer
  expirationService.cancel(roomId);

  // Room was already deleted
  if (!room) {
    return false;
  }

  // Delete uploaded files asynchronously
  Promise.resolve(
    fileStorageService.deleteRoomFiles(roomId)
  ).catch((error) => {
    console.error(
      `Failed to delete files for room ${roomId}:`,
      error.message
    );
  });

  // Delete all room data from memory
  store.deleteRoom(roomId);

  return true;
}

/**
 * Check whether a session is the room owner
 */
function isOwner(roomId, sessionId) {
  const room = store.getRoom(roomId);

  return Boolean(
    room && room.ownerId === sessionId
  );
}

module.exports = {
  createRoom,
  joinRoom,
  getPublicRoomInfo,
  setLocked,
  setAcceptingNewMembers,
  setFileSharingEnabled,
  setMaxParticipants,
  extendExpiration,
  removeParticipant,
  destroyRoom,
  isOwner,
};
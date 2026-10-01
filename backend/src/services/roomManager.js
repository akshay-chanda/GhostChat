const crypto = require('crypto');

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

/**
 * Generate a public participant identifier.
 *
 * participantId:
 * - PUBLIC
 * - used for UI/presence/message identity
 * - safe to send to other participants
 */
function generateParticipantId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a PRIVATE authentication secret.
 *
 * SECURITY:
 * - Separate from sessionId.
 * - sessionId alone must NOT be sufficient for authentication.
 * - Never broadcast this value.
 * - Never include it in public room information.
 */
function generateSessionSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function unauthorizedError(
  message = 'Unauthorized action.'
) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'unauthorized';

  return error;
}

/**
 * Check whether a PRIVATE session owns the room.
 *
 * room.ownerId contains the owner's private sessionId.
 */
function assertOwner(room, sessionId) {
  if (
    !room ||
    !sessionId ||
    room.ownerId !== sessionId
  ) {
    throw unauthorizedError();
  }
}

/**
 * Create a new room.
 */
async function createRoom({
  roomName,
  passwordHash,
  duration,
  maxParticipants,
  allowFileSharing,
}) {
  const roomId = generateRoomId();

  // PRIVATE authentication values.
  const ownerSessionId = generateSessionId();
  const ownerSessionSecret = generateSessionSecret();

  // PUBLIC participant identifier.
  const ownerParticipantId = generateParticipantId();

  const anonymousName = generateAnonymousName();

  const safeDuration =
    ROOM_DURATIONS_SECONDS.includes(duration)
      ? duration
      : 1800;

  const requestedMaxParticipants =
    Number(maxParticipants);

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

  /**
   * ownerId is PRIVATE and contains the
   * owner's sessionId.
   */
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
    sessionSecret: ownerSessionSecret,
    participantId: ownerParticipantId,
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
    sessionSecret: ownerSessionSecret,
  };
}

/**
 * Join an existing room.
 */
async function joinRoom({
  roomId,
  password,
}) {
  const room = store.getRoom(roomId);

  if (!room) {
    return {
      ok: false,
      reason: 'notFound',
    };
  }

  const passwordValid =
    await passwordService.verifyPassword(
      password,
      room.passwordHash
    );

  // Prevent room enumeration.
  if (!passwordValid) {
    return {
      ok: false,
      reason: 'notFound',
    };
  }

  if (
    room.locked ||
    !room.acceptingNewMembers
  ) {
    return {
      ok: false,
      reason: 'locked',
    };
  }

  const currentParticipants =
    store.getParticipants(roomId);

  if (
    currentParticipants.length >=
    room.maxParticipants
  ) {
    return {
      ok: false,
      reason: 'full',
    };
  }

  // PRIVATE authentication values.
  const sessionId = generateSessionId();
  const sessionSecret = generateSessionSecret();

  // PUBLIC participant identifier.
  const participantId = generateParticipantId();

  const anonymousName =
    generateAnonymousName(
      currentParticipants.map(
        (participant) =>
          participant.anonymousName
      )
    );

  const participant = createParticipant({
    sessionId,
    sessionSecret,
    participantId,
    anonymousName,
    isOwner: false,
  });

  store.addParticipant(
    roomId,
    participant
  );

  return {
    ok: true,
    participant,
    sessionSecret,
  };
}

/**
 * Get public room information.
 *
 * SECURITY:
 * room.ownerId contains the owner's PRIVATE
 * sessionId and must never be returned.
 */
function getPublicRoomInfo(roomId) {
  const room = store.getRoom(roomId);

  if (!room) {
    return null;
  }

  const participants =
    store.getParticipants(roomId);

  const ownerParticipant =
    participants.find(
      (participant) =>
        participant.sessionId === room.ownerId
    );

  const ownerParticipantId =
    ownerParticipant?.participantId || null;

  return toPublicRoom(
    room,
    participants.length,
    ownerParticipantId
  );
}

/**
 * Lock or unlock a room.
 */
function setLocked(
  roomId,
  sessionId,
  locked
) {
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
 * Enable or disable new members.
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
    acceptingNewMembers:
      Boolean(accepting),
  });
}

/**
 * Enable or disable file sharing.
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
    fileSharingEnabled:
      Boolean(enabled),
  });
}

/**
 * Update maximum participants.
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

  const parsedMaxParticipants =
    Number(maxParticipants);

  if (
    !Number.isFinite(
      parsedMaxParticipants
    )
  ) {
    throw new Error(
      'Invalid maximum participant count.'
    );
  }

  const clampedMaxParticipants =
    Math.min(
      Math.max(
        2,
        parsedMaxParticipants
      ),
      HARD_MAX_PARTICIPANTS
    );

  store.updateRoom(roomId, {
    maxParticipants:
      clampedMaxParticipants,
  });
}

/**
 * Extend room expiration.
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

  const safeAdditionalSeconds =
    Number(additionalSeconds);

  if (
    !Number.isFinite(
      safeAdditionalSeconds
    ) ||
    safeAdditionalSeconds <= 0
  ) {
    throw new Error(
      'Invalid expiration extension.'
    );
  }

  const newExpiresAt =
    new Date(
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
 * Remove a participant.
 *
 * requesterSessionId:
 *   PRIVATE sessionId of requester.
 *
 * targetParticipantId:
 *   PUBLIC participantId of target.
 */
function removeParticipant(
  roomId,
  requesterSessionId,
  targetParticipantId
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return;
  }

  assertOwner(
    room,
    requesterSessionId
  );

  if (!targetParticipantId) {
    throw unauthorizedError(
      'Invalid participant identifier.'
    );
  }

  const participants =
    store.getParticipants(roomId);

  const targetParticipant =
    participants.find(
      (participant) =>
        participant.participantId ===
        targetParticipantId
    );

  if (!targetParticipant) {
    return;
  }

  if (
    targetParticipant.sessionId ===
    room.ownerId
  ) {
    throw unauthorizedError(
      'The room owner cannot be removed.'
    );
  }

  sessionManager.destroySession(
    roomId,
    targetParticipant.sessionId,
    targetParticipant.sessionSecret
  );
}

/**
 * Explicitly destroy a room.
 *
 * Room deletion itself is synchronous.
 * Temporary file cleanup runs separately.
 */
function destroyRoom(
  roomId,
  sessionId
) {
  const room = store.getRoom(roomId);

  if (!room) {
    return false;
  }

  assertOwner(
    room,
    sessionId
  );

  return destroyRoomInternal(roomId);
}

/**
 * Internal room cleanup.
 *
 * IMPORTANT:
 * This function intentionally removes the room
 * synchronously so expiration tests and callers
 * immediately observe that the room no longer exists.
 *
 * File cleanup is started asynchronously because
 * filesystem cleanup does not need to block room
 * destruction.
 */
function destroyRoomInternal(roomId) {
  const room = store.getRoom(roomId);

  // Always cancel the expiration timer.
  expirationService.cancel(roomId);

  // Already destroyed.
  if (!room) {
    return false;
  }

  /**
   * Remove the room immediately.
   *
   * This makes:
   *
   *   getPublicRoomInfo(roomId)
   *
   * return null immediately after destruction.
   */
  store.deleteRoom(roomId);

  /**
   * Delete temporary encrypted files.
   *
   * Do not await this operation here.
   *
   * Room lifetime is independent from the physical
   * filesystem cleanup.
   */
  Promise.resolve(
    fileStorageService.deleteRoomFiles(roomId)
  ).catch((error) => {
    console.error(
      `Failed to delete files for room ${roomId}:`,
      error.message
    );
  });

  return true;
}

/**
 * Check whether a PRIVATE session owns the room.
 */
function isOwner(
  roomId,
  sessionId
) {
  const room = store.getRoom(roomId);

  return Boolean(
    room &&
    sessionId &&
    room.ownerId === sessionId
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
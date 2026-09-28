const roomManager = require('../services/roomManager');
const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const {
  createSystemMessage,
} = require('../models/Message');

const logger = require('../utils/logger');

/**
 * Send an error to a socket
 */
function emitError(socket, message) {
  socket.emit('connection:error', {
    message,
  });
}

/**
 * Mark every socket belonging to a room as already destroyed.
 *
 * This prevents duplicate cleanup when the owner explicitly
 * destroys the room and Socket.IO disconnects all other users.
 */
function markRoomAsDestroyed(io, roomId) {
  for (const clientSocket of io.sockets.sockets.values()) {
    if (clientSocket.data.roomId === roomId) {
      clientSocket.data.roomAlreadyDestroyed = true;
    }
  }
}

/**
 * Find a socket by room ID and session ID
 */
function findParticipantSocket(io, roomId, sessionId) {
  return [...io.sockets.sockets.values()].find(
    (clientSocket) =>
      clientSocket.data.roomId === roomId &&
      clientSocket.data.sessionId === sessionId
  );
}

/**
 * Register room-related socket events
 */
function registerRoomEvents(io, socket) {
  const {
    roomId,
    sessionId,
  } = socket.data;

  /**
   * Lock room
   */
  socket.on('room:lock', () => {
    try {
      roomManager.setLocked(
        roomId,
        sessionId,
        true
      );

      io.to(roomId).emit(
        'room:updated',
        roomManager.getPublicRoomInfo(roomId)
      );
    } catch (error) {
      emitError(socket, error.message);
    }
  });

  /**
   * Unlock room
   */
  socket.on('room:unlock', () => {
    try {
      roomManager.setLocked(
        roomId,
        sessionId,
        false
      );

      io.to(roomId).emit(
        'room:updated',
        roomManager.getPublicRoomInfo(roomId)
      );
    } catch (error) {
      emitError(socket, error.message);
    }
  });

  /**
   * Enable or disable new members
   */
  socket.on(
    'room:set-accepting-members',
    ({ accepting } = {}) => {
      try {
        roomManager.setAcceptingNewMembers(
          roomId,
          sessionId,
          Boolean(accepting)
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(roomId)
        );
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Enable or disable file sharing
   */
  socket.on(
    'room:set-file-sharing',
    ({ enabled } = {}) => {
      try {
        roomManager.setFileSharingEnabled(
          roomId,
          sessionId,
          Boolean(enabled)
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(roomId)
        );
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Change maximum participants
   */
  socket.on(
    'room:set-max-participants',
    ({ maxParticipants } = {}) => {
      try {
        roomManager.setMaxParticipants(
          roomId,
          sessionId,
          Number(maxParticipants)
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(roomId)
        );
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Extend room expiration
   */
  socket.on(
    'room:extend-expiration',
    ({ additionalSeconds } = {}) => {
      try {
        roomManager.extendExpiration(
          roomId,
          sessionId,
          Number(additionalSeconds)
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(roomId)
        );
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Remove a participant
   *
   * This is an EXPLICIT owner action.
   */
  socket.on(
    'room:remove-participant',
    ({ sessionId: targetSessionId } = {}) => {
      try {
        if (!targetSessionId) {
          throw new Error(
            'Target participant session is required.'
          );
        }

        const target = sessionManager.validateSession(
          roomId,
          targetSessionId
        );

        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetSessionId
        );

        io.to(roomId).emit(
          'room:user-left',
          {
            id: targetSessionId,
          }
        );

        if (target) {
          const removedNotice = createSystemMessage(
            `${target.anonymousName} was removed from the room.`
          );

          store.addMessage(
            roomId,
            removedNotice
          );

          io.to(roomId).emit(
            'message:new',
            removedNotice
          );
        }

        const targetSocket = findParticipantSocket(
          io,
          roomId,
          targetSessionId
        );

        if (targetSocket) {
          /*
           * This is a real removal, not a temporary
           * mobile/browser disconnect.
           */
          targetSocket.data.suppressLeaveEvent = true;

          targetSocket.emit('room:removed');

          targetSocket.disconnect(true);
        }
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Explicitly destroy room
   *
   * This is the ONLY normal socket action that
   * destroys the entire room.
   */
  socket.on('room:destroy', () => {
    try {
      roomManager.destroyRoom(
        roomId,
        sessionId
      );

      markRoomAsDestroyed(
        io,
        roomId
      );

      io.to(roomId).emit(
        'room:expired'
      );

      io.in(roomId).disconnectSockets(true);

      logger.info(
        'Room explicitly destroyed',
        {
          roomId,
          sessionId,
        }
      );
    } catch (error) {
      emitError(socket, error.message);
    }
  });

  /**
   * Explicit leave room
   *
   * IMPORTANT:
   *
   * We use a separate event for an intentional leave.
   *
   * A normal WebSocket disconnect is NOT treated as
   * leaving the room because mobile browsers can
   * temporarily disconnect when opening file viewers,
   * file pickers, other applications, etc.
   */
  socket.on('room:leave', () => {
    try {
      if (socket.data.intentionalLeave) {
        return;
      }

      socket.data.intentionalLeave = true;

      /*
       * Owner explicitly leaving:
       *
       * Keep the existing GhostChat behavior where the
       * owner's intentional leave destroys the room.
       */
      if (socket.data.isOwner) {
        roomManager.destroyRoom(
          roomId,
          sessionId
        );

        markRoomAsDestroyed(
          io,
          roomId
        );

        io.to(roomId).emit(
          'room:expired'
        );

        io.in(roomId).disconnectSockets(true);

        logger.info(
          'Owner explicitly left - room destroyed',
          {
            roomId,
            sessionId,
          }
        );

        return;
      }

      /*
       * Normal participant explicitly leaves.
       */
      sessionManager.destroySession(
        roomId,
        sessionId
      );

      socket.to(roomId).emit(
        'room:user-left',
        {
          id: sessionId,
        }
      );

      const leavingName =
        socket.data.anonymousName;

      if (leavingName) {
        const leaveNotice =
          createSystemMessage(
            `${leavingName} left the room.`
          );

        store.addMessage(
          roomId,
          leaveNotice
        );

        socket.to(roomId).emit(
          'message:new',
          leaveNotice
        );
      }

      logger.info(
        'Participant explicitly left',
        {
          roomId,
          sessionId,
        }
      );
    } catch (error) {
      logger.warn(
        'Failed to process explicit room leave',
        {
          roomId,
          sessionId,
          error: error.message,
        }
      );
    }
  });

  /**
   * Handle socket disconnecting
   *
   * IMPORTANT:
   *
   * DO NOT destroy a session or room here.
   *
   * A disconnect can be temporary:
   *
   * - iOS Safari opens a file viewer
   * - Android opens a file picker
   * - user switches applications
   * - browser temporarily suspends the page
   * - network changes
   *
   * Socket.IO will attempt to reconnect using the
   * same roomId/sessionId.
   *
   * Therefore the session must remain in memory.
   */
  socket.on('disconnecting', () => {
    logger.info(
      'Socket temporarily disconnected',
      {
        roomId,
        sessionId,
        isOwner: socket.data.isOwner,
        reason: socket.data.disconnectReason || 'unknown',
      }
    );

    /*
     * Intentionally do NOTHING else here.
     *
     * In particular:
     *
     * - do NOT destroy the room
     * - do NOT destroy the session
     * - do NOT emit room:expired
     * - do NOT emit room:removed
     * - do NOT remove the participant
     */
  });
}

module.exports = registerRoomEvents;

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
 * This prevents duplicate cleanup when the owner disconnects
 * and Socket.IO disconnects all other users.
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

        // Validate that the target session exists
        const target = sessionManager.validateSession(
          roomId,
          targetSessionId
        );

        // Only the room owner should be allowed
        // to remove participants.
        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetSessionId
        );

        // Notify all remaining participants
        io.to(roomId).emit(
          'room:user-left',
          {
            id: targetSessionId,
          }
        );

        // Create a system message
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

        // Find the removed participant's socket
        const targetSocket = findParticipantSocket(
          io,
          roomId,
          targetSessionId
        );

        if (targetSocket) {
          // Prevent normal disconnect cleanup
          targetSocket.data.suppressLeaveEvent = true;

          // Notify the removed participant
          targetSocket.emit('room:removed');

          // Disconnect only the removed participant
          targetSocket.disconnect(true);
        }
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * Explicitly destroy room
   */
  socket.on('room:destroy', () => {
    try {
      roomManager.destroyRoom(
        roomId,
        sessionId
      );

      // Mark every socket before disconnecting them
      markRoomAsDestroyed(
        io,
        roomId
      );

      // Notify everyone that the room is closed
      io.to(roomId).emit(
        'room:expired'
      );

      // Disconnect all sockets in the room
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
   * Handle socket disconnecting
   *
   * "disconnecting" is used because the socket
   * is still inside the Socket.IO room.
   */
  socket.on('disconnecting', () => {
    const leavingName = socket.data.anonymousName;

    // Skip cleanup when the room was already destroyed
    if (socket.data.roomAlreadyDestroyed) {
      return;
    }

    // Skip cleanup when a participant was manually removed
    if (socket.data.suppressLeaveEvent) {
      return;
    }

    /**
     * Owner disconnected
     *
     * Destroy the room and disconnect every participant.
     */
    if (socket.data.isOwner) {
      try {
        roomManager.destroyRoom(
          roomId,
          sessionId
        );
      } catch (error) {
        logger.warn(
          'Room was already destroyed',
          {
            roomId,
            error: error.message,
          }
        );
      }

      // Prevent duplicate cleanup for all room sockets
      markRoomAsDestroyed(
        io,
        roomId
      );

      // Notify all users
      io.to(roomId).emit(
        'room:expired'
      );

      // Disconnect every participant
      io.in(roomId).disconnectSockets(true);

      logger.info(
        'Owner disconnected - room destroyed',
        {
          roomId,
          sessionId,
        }
      );

      return;
    }

    /**
     * Non-owner disconnected
     *
     * Remove only the disconnected participant.
     */
    try {
      sessionManager.destroySession(
        roomId,
        sessionId
      );
    } catch (error) {
      logger.warn(
        'Failed to destroy participant session',
        {
          roomId,
          sessionId,
          error: error.message,
        }
      );
    }

    // Notify other participants
    socket.to(roomId).emit(
      'room:user-left',
      {
        id: sessionId,
      }
    );

    // Create a leave notification
    if (leavingName) {
      const leaveNotice = createSystemMessage(
        `${leavingName} left the room.`
      );

      try {
        store.addMessage(
          roomId,
          leaveNotice
        );

        socket.to(roomId).emit(
          'message:new',
          leaveNotice
        );
      } catch (error) {
        logger.warn(
          'Failed to save leave notification',
          {
            roomId,
            error: error.message,
          }
        );
      }
    }

    logger.info(
      'Participant disconnected',
      {
        roomId,
        sessionId,
      }
    );
  });
}

module.exports = registerRoomEvents;
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
function findParticipantSocket(
  io,
  roomId,
  sessionId
) {
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
      emitError(
        socket,
        error.message
      );
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
      emitError(
        socket,
        error.message
      );
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
        emitError(
          socket,
          error.message
        );
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
        emitError(
          socket,
          error.message
        );
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
        emitError(
          socket,
          error.message
        );
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
        emitError(
          socket,
          error.message
        );
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

        const target =
          sessionManager.validateSession(
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
          const removedNotice =
            createSystemMessage(
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

        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        if (targetSocket) {
          /*
           * This is a real removal, not a temporary
           * mobile/browser disconnect.
           */
          targetSocket.data.suppressLeaveEvent =
            true;

          targetSocket.emit(
            'room:removed'
          );

          targetSocket.disconnect(
            true
          );
        }
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  /**
   * Explicitly destroy room
   *
   * IMPORTANT:
   *
   * This destroys the entire room when the host
   * explicitly clicks Destroy Room.
   */
  socket.on(
    'room:destroy',
    (ack) => {
      try {
        /*
         * Only the room owner can destroy the
         * entire room.
         */
        if (!socket.data.isOwner) {
          const message =
            'Only the room owner can destroy the room.';

          if (typeof ack === 'function') {
            ack({
              ok: false,
              message,
            });
          }

          emitError(
            socket,
            message
          );

          return;
        }

        /*
         * Prevent duplicate destroy requests.
         */
        if (socket.data.roomAlreadyDestroyed) {
          if (typeof ack === 'function') {
            ack({
              ok: true,
              alreadyDestroyed: true,
            });
          }

          return;
        }

        /*
         * 1. Destroy the room in backend memory FIRST.
         */
        roomManager.destroyRoom(
          roomId,
          sessionId
        );

        /*
         * 2. Mark every socket in this room as
         * already destroyed.
         */
        markRoomAsDestroyed(
          io,
          roomId
        );

        /*
         * 3. Confirm destruction to the host FIRST.
         */
        if (typeof ack === 'function') {
          ack({
            ok: true,
          });
        }

        /*
         * 4. Tell EVERYONE immediately that the room
         * has permanently expired/destroyed.
         */
        io.to(roomId).emit(
          'room:expired'
        );

        /*
         * 5. Immediately disconnect everyone.
         *
         * NO setTimeout.
         * NO 500ms delay.
         */
        try {
          io.in(roomId).disconnectSockets(
            true
          );
        } catch (disconnectError) {
          logger.warn(
            'Failed to disconnect destroyed room sockets',
            {
              roomId,
              error:
                disconnectError.message,
            }
          );
        }

        logger.info(
          'Room explicitly destroyed',
          {
            roomId,
            sessionId,
          }
        );
      } catch (error) {
        logger.error(
          'Failed to destroy room',
          {
            roomId,
            sessionId,
            error: error.message,
          }
        );

        if (typeof ack === 'function') {
          ack({
            ok: false,
            message: error.message,
          });
        }

        emitError(
          socket,
          error.message
        );
      }
    }
  );

  /**
   * Explicit leave room
   *
   * This is used when the user actually clicks
   * the Leave Room button.
   */
  socket.on(
    'room:leave',
    () => {
      try {
        if (
          socket.data.intentionalLeave
        ) {
          return;
        }

        socket.data.intentionalLeave =
          true;

        /*
         * Owner explicitly leaving:
         *
         * Destroy the entire room.
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

          /*
           * Immediately disconnect everyone.
           */
          io.in(roomId).disconnectSockets(
            true
          );

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
    }
  );

  /**
   * Handle socket disconnecting
   *
   * IMPORTANT:
   *
   * A browser page reload causes the current Socket.IO
   * connection to disconnect.
   *
   * Therefore:
   *
   * HOST:
   *   Reload/disconnect -> destroy the entire room.
   *
   * PARTICIPANT:
   *   Reload/disconnect -> remove only that participant.
   *
   * Explicit room:leave and room:destroy are still
   * handled separately above.
   */
  socket.on(
    'disconnecting',
    () => {
      try {
        /*
         * Do not perform cleanup twice if the room
         * has already been explicitly destroyed.
         */
        if (socket.data.roomAlreadyDestroyed) {
          return;
        }

        /*
         * Do not perform cleanup twice if the user
         * explicitly clicked Leave Room.
         *
         * The room:leave handler above has already
         * performed the correct cleanup.
         */
        if (socket.data.intentionalLeave) {
          return;
        }

        /*
         * ==================================================
         * HOST DISCONNECT / RELOAD
         * ==================================================
         */
        if (socket.data.isOwner) {
          try {
            /*
             * Destroy the room in backend memory.
             */
            roomManager.destroyRoom(
              roomId,
              sessionId
            );

            /*
             * Mark all sockets in the room so their
             * disconnecting handlers do not try to
             * destroy the room again.
             */
            markRoomAsDestroyed(
              io,
              roomId
            );

            /*
             * Tell EVERYONE immediately that the room
             * is closed.
             *
             * RoomContext already handles room:expired
             * and redirects to the home page.
             */
            io.to(roomId).emit(
              'room:expired'
            );

            logger.info(
              'Host disconnected - room destroyed',
              {
                roomId,
                sessionId,
                reason:
                  socket.data.disconnectReason ||
                  'unknown',
              }
            );
          } catch (error) {
            logger.warn(
              'Failed to destroy room after host disconnect',
              {
                roomId,
                sessionId,
                error: error.message,
              }
            );
          }

          return;
        }

        /*
         * ==================================================
         * PARTICIPANT DISCONNECT / RELOAD
         * ==================================================
         */

        /*
         * Remove the participant's session from the
         * backend immediately.
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

        /*
         * Immediately tell the remaining participants
         * that this participant has left.
         */
        socket.to(roomId).emit(
          'room:user-left',
          {
            id: sessionId,
          }
        );

        /*
         * Add a system message to the room.
         */
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
          'Participant disconnected - removed from room',
          {
            roomId,
            sessionId,
            reason:
              socket.data.disconnectReason ||
              'unknown',
          }
        );
      } catch (error) {
        logger.warn(
          'Failed to process socket disconnect',
          {
            roomId,
            sessionId,
            error: error.message,
          }
        );
      }
    }
  );
}

module.exports = registerRoomEvents;
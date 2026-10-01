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
 * This prevents duplicate cleanup when the room has already
 * been destroyed and Socket.IO disconnects the users.
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
   * ============================================================
   * LOCK ROOM
   * ============================================================
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
   * ============================================================
   * UNLOCK ROOM
   * ============================================================
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
   * ============================================================
   * ACCEPTING NEW MEMBERS
   * ============================================================
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
   * ============================================================
   * FILE SHARING
   * ============================================================
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
   * ============================================================
   * MAX PARTICIPANTS
   * ============================================================
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
   * ============================================================
   * EXTEND ROOM EXPIRATION
   * ============================================================
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
   * ============================================================
   * REMOVE PARTICIPANT
   *
   * Explicit owner action.
   * ============================================================
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

        /**
         * Tell everyone in the room that the participant
         * was removed.
         */
        io.to(roomId).emit(
          'room:user-left',
          {
            id: targetSessionId,
          }
        );

        /**
         * Add a system message.
         */
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

        /**
         * Disconnect the removed participant immediately.
         */
        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        if (targetSocket) {
          /**
           * Prevent the normal disconnect handler from
           * treating this as a normal participant leave.
           */
          targetSocket.data.suppressLeaveEvent = true;
          targetSocket.data.intentionalLeave = true;
          targetSocket.data.roomAlreadyDestroyed = false;

          targetSocket.emit('room:removed');

          targetSocket.disconnect(true);
        }
      } catch (error) {
        emitError(socket, error.message);
      }
    }
  );

  /**
   * ============================================================
   * DESTROY ROOM
   *
   * Explicit owner action.
   *
   * Host clicks "Destroy Room":
   *
   * 1. Destroy room in backend
   * 2. Mark all sockets
   * 3. Tell everyone
   * 4. Disconnect everyone immediately
   *
   * No delay.
   * No grace period.
   * ============================================================
   */
  socket.on(
    'room:destroy',
    (ack) => {
      try {
        /**
         * Only owner can destroy the room.
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

          emitError(socket, message);
          return;
        }

        /**
         * Prevent duplicate destruction.
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

        /**
         * Prevent disconnecting logic from trying to
         * perform normal leave cleanup.
         */
        socket.data.intentionalLeave = true;

        /**
         * 1. Destroy room in backend memory.
         */
        roomManager.destroyRoom(
          roomId,
          sessionId
        );

        /**
         * 2. Mark all room sockets as destroyed.
         */
        markRoomAsDestroyed(
          io,
          roomId
        );

        /**
         * 3. Confirm to the host.
         */
        if (typeof ack === 'function') {
          ack({
            ok: true,
          });
        }

        /**
         * 4. Tell everyone immediately.
         */
        io.to(roomId).emit(
          'room:expired'
        );

        /**
         * 5. Disconnect everyone immediately.
         *
         * There is intentionally NO setTimeout here.
         */
        try {
          io.in(roomId).disconnectSockets(true);
        } catch (disconnectError) {
          logger.warn(
            'Failed to disconnect destroyed room sockets',
            {
              roomId,
              error: disconnectError.message,
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
   * ============================================================
   * LEAVE ROOM
   *
   * Explicit user action.
   * ============================================================
   */
  socket.on(
    'room:leave',
    () => {
      try {
        /**
         * Prevent duplicate cleanup.
         */
        if (socket.data.intentionalLeave) {
          return;
        }

        socket.data.intentionalLeave = true;

        /**
         * ======================================================
         * OWNER LEAVES
         * ======================================================
         *
         * Owner leaving means the entire temporary room closes.
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

          /**
           * Notify everyone immediately.
           */
          io.to(roomId).emit(
            'room:expired'
          );

          /**
           * Disconnect everyone immediately.
           */
          try {
            io.in(roomId).disconnectSockets(true);
          } catch (disconnectError) {
            logger.warn(
              'Failed to disconnect sockets after owner leave',
              {
                roomId,
                error: disconnectError.message,
              }
            );
          }

          logger.info(
            'Owner explicitly left - room destroyed',
            {
              roomId,
              sessionId,
            }
          );

          return;
        }

        /**
         * ======================================================
         * PARTICIPANT LEAVES
         * ======================================================
         */

        /**
         * Remove participant session immediately.
         */
        sessionManager.destroySession(
          roomId,
          sessionId
        );

        /**
         * Tell remaining participants.
         */
        socket.to(roomId).emit(
          'room:user-left',
          {
            id: sessionId,
          }
        );

        /**
         * Add leave system message.
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
   * ============================================================
   * SOCKET DISCONNECTING
   *
   * This is important for browser reloads.
   *
   * HOST:
   *   Reload/disconnect
   *   -> destroy room
   *   -> notify everyone
   *
   * PARTICIPANT:
   *   Reload/disconnect
   *   -> remove participant
   *   -> notify remaining participants
   *
   * There is NO grace period.
   * ============================================================
   */
  socket.on(
    'disconnecting',
    () => {
      try {
        /**
         * ------------------------------------------------------
         * Already destroyed
         * ------------------------------------------------------
         */
        if (socket.data.roomAlreadyDestroyed) {
          return;
        }

        /**
         * ------------------------------------------------------
         * Explicit leave/destroy already handled
         * ------------------------------------------------------
         */
        if (socket.data.intentionalLeave) {
          return;
        }

        /**
         * ======================================================
         * HOST RELOAD / DISCONNECT
         * ======================================================
         */
        if (socket.data.isOwner) {
          try {
            /**
             * Destroy room immediately.
             */
            roomManager.destroyRoom(
              roomId,
              sessionId
            );

            /**
             * Mark all sockets so their own disconnecting
             * handlers do not perform duplicate cleanup.
             */
            markRoomAsDestroyed(
              io,
              roomId
            );

            /**
             * Notify every connected participant immediately.
             *
             * RoomContext should handle room:expired and
             * navigate everyone to Home.
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

        /**
         * ======================================================
         * PARTICIPANT RELOAD / DISCONNECT
         * ======================================================
         */

        /**
         * Remove participant immediately.
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

        /**
         * Notify remaining participants immediately.
         */
        socket.to(roomId).emit(
          'room:user-left',
          {
            id: sessionId,
          }
        );

        /**
         * Add system message.
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
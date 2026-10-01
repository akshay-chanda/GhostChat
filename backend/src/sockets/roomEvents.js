const roomManager = require('../services/roomManager');
const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const {
  createSystemMessage,
} = require('../models/Message');

const logger = require('../utils/logger');

/**
 * Send an error to a socket.
 */
function emitError(socket, message) {
  socket.emit('connection:error', {
    message,
  });
}

/**
 * Mark every socket belonging to a room as already destroyed.
 *
 * This prevents duplicate cleanup when the owner destroys
 * the room and Socket.IO disconnects everybody.
 */
function markRoomAsDestroyed(io, roomId) {
  for (const clientSocket of io.sockets.sockets.values()) {
    if (clientSocket.data.roomId === roomId) {
      clientSocket.data.roomAlreadyDestroyed = true;
    }
  }
}

/**
 * Find a socket by room ID and session ID.
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
 * Send participant-left event and system message.
 *
 * This is used for a participant reload/disconnect.
 *
 * IMPORTANT:
 *
 * We DO NOT destroy the session here.
 *
 * The same session may reconnect after a browser reload
 * or temporary mobile disconnect.
 */
function notifyParticipantLeft(
  socket,
  io,
  roomId,
  sessionId
) {
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
}

/**
 * Send participant-joined event.
 *
 * Used when the participant's new socket connects again.
 */
function notifyParticipantJoined(
  socket,
  io,
  roomId,
  sessionId
) {
  const participant =
    sessionManager.validateSession(
      roomId,
      sessionId
    );

  if (!participant) {
    return;
  }

  const participantData = {
    id: sessionId,
    sessionId,
    anonymousName:
      participant.anonymousName ??
      socket.data.anonymousName,
    isOwner:
      Boolean(
        participant.isOwner ??
        socket.data.isOwner
      ),
  };

  socket.to(roomId).emit(
    'room:user-joined',
    participantData
  );

  const joiningName =
    participantData.anonymousName;

  if (joiningName) {
    const joinNotice =
      createSystemMessage(
        `${joiningName} joined the room.`
      );

    store.addMessage(
      roomId,
      joinNotice
    );

    socket.to(roomId).emit(
      'message:new',
      joinNotice
    );
  }
}

/**
 * Register room-related socket events.
 */
function registerRoomEvents(
  io,
  socket
) {
  const {
    roomId,
    sessionId,
  } = socket.data;

  // --------------------------------------------------
  // Lock room
  // --------------------------------------------------

  socket.on(
    'room:lock',
    () => {
      try {
        roomManager.setLocked(
          roomId,
          sessionId,
          true
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Unlock room
  // --------------------------------------------------

  socket.on(
    'room:unlock',
    () => {
      try {
        roomManager.setLocked(
          roomId,
          sessionId,
          false
        );

        io.to(roomId).emit(
          'room:updated',
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Accepting new members
  // --------------------------------------------------

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
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // File sharing
  // --------------------------------------------------

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
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Maximum participants
  // --------------------------------------------------

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
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Extend expiration
  // --------------------------------------------------

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
          roomManager.getPublicRoomInfo(
            roomId
          )
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Explicit participant removal
  // --------------------------------------------------

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

  // --------------------------------------------------
  // Explicit room destruction
  // --------------------------------------------------

  socket.on(
    'room:destroy',
    (ack) => {
      try {
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

        socket.data.intentionalLeave =
          true;

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

        if (typeof ack === 'function') {
          ack({
            ok: true,
          });
        }

        io.in(roomId).disconnectSockets(
          true
        );

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

  // --------------------------------------------------
  // Explicit leave
  // --------------------------------------------------

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

        // --------------------------------------------
        // Host leaves
        // --------------------------------------------

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

        // --------------------------------------------
        // Participant leaves
        // --------------------------------------------

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

  // --------------------------------------------------
  // Participant reconnect / reload
  // --------------------------------------------------

  socket.on(
    'room:resume',
    () => {
      try {
        if (
          socket.data.isOwner
        ) {
          return;
        }

        const participant =
          sessionManager.validateSession(
            roomId,
            sessionId
          );

        if (!participant) {
          emitError(
            socket,
            'Invalid or expired session.'
          );

          return;
        }

        /*
         * The new socket has joined the room.
         *
         * Tell the other users that this participant
         * is active again.
         */
        notifyParticipantJoined(
          socket,
          io,
          roomId,
          sessionId
        );

        logger.info(
          'Participant resumed room session',
          {
            roomId,
            sessionId,
          }
        );
      } catch (error) {
        emitError(
          socket,
          error.message
        );
      }
    }
  );

  // --------------------------------------------------
  // Socket disconnecting
  // --------------------------------------------------

  socket.on(
    'disconnecting',
    () => {
      /*
       * Explicit room destruction already handled.
       */
      if (
        socket.data.roomAlreadyDestroyed
      ) {
        return;
      }

      /*
       * Explicit Leave Room already handled.
       */
      if (
        socket.data.intentionalLeave
      ) {
        return;
      }

      // --------------------------------------------
      // HOST DISCONNECT
      // --------------------------------------------

      if (
        socket.data.isOwner
      ) {
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

          logger.info(
            'Owner disconnected - room destroyed',
            {
              roomId,
              sessionId,
            }
          );
        } catch (error) {
          logger.error(
            'Failed to destroy room after owner disconnect',
            {
              roomId,
              sessionId,
              error: error.message,
            }
          );
        }

        return;
      }

      // --------------------------------------------
      // PARTICIPANT DISCONNECT
      // --------------------------------------------

      /*
       * IMPORTANT:
       *
       * Do NOT destroy the session.
       *
       * The participant may be reloading the page
       * or temporarily reconnecting.
       *
       * We only tell the remaining users that the
       * participant is currently gone.
       */
      notifyParticipantLeft(
        socket,
        io,
        roomId,
        sessionId
      );

      logger.info(
        'Participant disconnected from room',
        {
          roomId,
          sessionId,
        }
      );
    }
  );
}

module.exports =
  registerRoomEvents;
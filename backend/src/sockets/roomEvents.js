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
 * IMPORTANT:
 *
 * We do NOT destroy the session here.
 *
 * A participant may be:
 * - reloading the browser
 * - opening a file viewer
 * - switching applications
 * - temporarily losing network connectivity
 *
 * The session must therefore remain available for
 * the participant to reconnect.
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
 * Send participant-joined event and system message.
 *
 * This is used when:
 * - a participant joins
 * - a participant successfully resumes after reload
 * - a participant reconnects after a temporary disconnect
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
    emitError(
      socket,
      'Invalid or expired session.'
    );

    return false;
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

  /*
   * Make sure the new socket has the latest
   * participant information.
   */
  socket.data.anonymousName =
    participantData.anonymousName;

  socket.data.isOwner =
    participantData.isOwner;

  /*
   * Tell everyone else that this participant
   * is active again.
   */
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

  return true;
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

        /*
         * Get the participant before destroying
         * their session so we can display their name.
         */
        const target =
          sessionManager.validateSession(
            roomId,
            targetSessionId
          );

        /*
         * roomManager performs the owner/permission
         * validation.
         */
        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetSessionId
        );

        /*
         * Permanently invalidate the removed
         * participant's session.
         */
        sessionManager.destroySession(
          roomId,
          targetSessionId
        );

        /*
         * Tell everyone in the room that this
         * participant is no longer active.
         */
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

        /*
         * If the participant currently has a socket,
         * remove it immediately.
         */
        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        if (targetSocket) {
          targetSocket.data.suppressLeaveEvent =
            true;

          targetSocket.data.intentionalLeave =
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

        /*
         * Prevent disconnecting cleanup from running
         * a second room-destruction operation.
         */
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

        /*
         * Everyone currently inside the room gets
         * the room-closed event immediately.
         */
        io.to(roomId).emit(
          'room:expired'
        );

        /*
         * Tell the frontend the server successfully
         * destroyed the room.
         */
        if (typeof ack === 'function') {
          ack({
            ok: true,
          });
        }

        /*
         * Immediately disconnect everybody.
         */
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
  // Explicit participant/owner leave
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
        // HOST LEAVES
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
        // PARTICIPANT LEAVES
        // --------------------------------------------

        /*
         * Explicit leave is different from a reload.
         *
         * Here the participant really wants to leave,
         * so their session is permanently destroyed.
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

  // --------------------------------------------------
  // Participant reconnect / reload
  // --------------------------------------------------

  socket.on(
    'room:resume',
    () => {
      try {
        /*
         * The owner does not resume.
         *
         * If the owner reloads, the room is intentionally
         * destroyed by the disconnecting handler below.
         */
        if (socket.data.isOwner) {
          return;
        }

        /*
         * Check that the participant's session still
         * exists.
         */
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
         * Make sure this socket has the participant's
         * latest information.
         */
        socket.data.anonymousName =
          participant.anonymousName ??
          socket.data.anonymousName;

        socket.data.isOwner =
          Boolean(
            participant.isOwner
          );

        /*
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
       * Room was already destroyed.
       *
       * Do not send another leave event.
       */
      if (
        socket.data.roomAlreadyDestroyed
      ) {
        return;
      }

      /*
       * Explicit Leave Room or explicit removal
       * already handled everything.
       */
      if (
        socket.data.intentionalLeave ||
        socket.data.suppressLeaveEvent
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
          /*
           * Host closing/reloading the browser means
           * the entire room must close immediately.
           */
          roomManager.destroyRoom(
            roomId,
            sessionId
          );

          markRoomAsDestroyed(
            io,
            roomId
          );

          /*
           * Tell all remaining participants that
           * the room has closed.
           */
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
       * DO NOT destroy the participant session.
       *
       * The participant may simply be:
       *
       * - reloading
       * - opening a file
       * - returning from a file viewer
       * - switching applications
       * - temporarily losing connection
       *
       * The session remains valid.
       *
       * Only the active socket is removed from the
       * participant list.
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
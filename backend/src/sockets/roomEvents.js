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
 * Emit only a participant-left roster update.
 *
 * IMPORTANT:
 *
 * This function does NOT create a chat system message.
 *
 * A socket disconnect can happen because of:
 *
 * - browser reload
 * - file viewer
 * - app switching
 * - temporary network loss
 * - browser lifecycle
 *
 * Therefore a normal disconnect must not create:
 *
 * "X left the room."
 */
function notifyParticipantDisconnected(
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
}

/**
 * Emit a participant joined event AND a system message.
 *
 * This is ONLY for a genuine new participant join.
 *
 * It must NOT be used by room:resume.
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
   * Store the latest participant information
   * on this socket.
   */
  socket.data.anonymousName =
    participantData.anonymousName;

  socket.data.isOwner =
    participantData.isOwner;

  /*
   * Update the participant roster.
   */
  socket.to(roomId).emit(
    'room:user-joined',
    participantData
  );

  /*
   * ONLY genuine joins create a visible system message.
   */
  if (participantData.anonymousName) {
    const joinNotice =
      createSystemMessage(
        `${participantData.anonymousName} joined the room.`
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
 * Emit only a participant resume/reconnect event.
 *
 * IMPORTANT:
 *
 * No system chat message is created here.
 *
 * This is what prevents:
 *
 * "Falcon left the room."
 * "Falcon joined the room."
 *
 * when Falcon simply reloads or reconnects.
 */
function notifyParticipantResumed(
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
   * Update this socket with the current
   * participant information.
   */
  socket.data.anonymousName =
    participantData.anonymousName;

  socket.data.isOwner =
    participantData.isOwner;

  /*
   * Only update the roster.
   *
   * NO message:new.
   * NO "joined the room" system message.
   */
  socket.to(roomId).emit(
    'room:user-joined',
    participantData
  );

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
  // IMPORTANT: INITIAL JOIN
  // --------------------------------------------------

  /*
   * sockets/index.js already:
   *
   * 1. authenticated this socket
   * 2. joined the Socket.IO room
   * 3. sent room:joined to this socket
   *
   * Therefore this is the single place where the
   * initial participant presence announcement happens.
   *
   * Do this asynchronously after the event handlers
   * have been registered.
   */
  if (!socket.data.isOwner) {
    /*
     * The participant was already created by:
     *
     * POST /api/rooms/join
     *
     * Therefore this is a genuine initial join.
     */
    notifyParticipantJoined(
      socket,
      io,
      roomId,
      sessionId
    );
  } else {
    /*
     * The room owner was created when the room was
     * created. Do not announce the owner as a new
     * participant every time their socket connects.
     */
    socket.data.initialPresenceAnnounced = true;
  }

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
         * Get participant information before
         * destroying the session.
         */
        const target =
          sessionManager.validateSession(
            roomId,
            targetSessionId
          );

        /*
         * Owner permission is checked inside
         * roomManager.
         */
        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetSessionId
        );

        /*
         * Permanently invalidate the removed
         * participant session.
         */
        sessionManager.destroySession(
          roomId,
          targetSessionId
        );

        /*
         * Update everyone else's roster.
         */
        io.to(roomId).emit(
          'room:user-left',
          {
            id: targetSessionId,
          }
        );

        /*
         * Explicit removal gets a visible system message.
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

        /*
         * Disconnect the removed participant.
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
         * Close the room immediately.
         */
        io.to(roomId).emit(
          'room:expired'
        );

        if (typeof ack === 'function') {
          ack({
            ok: true,
          });
        }

        /*
         * No delay.
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
  // Explicit participant / owner leave
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
         * Explicit leave permanently destroys the
         * participant session.
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
         * Owner does not resume.
         *
         * Owner reload/disconnect closes the room.
         */
        if (socket.data.isOwner) {
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

        socket.data.anonymousName =
          participant.anonymousName ??
          socket.data.anonymousName;

        socket.data.isOwner =
          Boolean(
            participant.isOwner
          );

        /*
         * IMPORTANT:
         *
         * Resume only updates presence.
         *
         * It does NOT create:
         *
         * "X joined the room."
         */
        notifyParticipantResumed(
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
       * Room already destroyed.
       */
      if (
        socket.data.roomAlreadyDestroyed
      ) {
        return;
      }

      /*
       * Explicit leave/removal already handled it.
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
           * Host reload/close means the room closes
           * immediately.
           */
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
       * Do NOT destroy the participant session.
       *
       * Only remove the participant from the ACTIVE
       * roster.
       *
       * IMPORTANT:
       *
       * No "left the room" chat message is generated.
       *
       * This prevents reload/file-viewer/app-switch
       * from generating fake chat messages.
       */
      notifyParticipantDisconnected(
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
const roomManager = require('../services/roomManager');
const sessionManager = require('../services/sessionManager');
const store = require('../storage/memoryStore');

const {
  createSystemMessage,
} = require('../models/Message');

const logger = require('../utils/logger');

/*
 * A browser reload causes the old Socket.IO connection to
 * disconnect before the new page establishes its connection.
 *
 * Therefore we keep the authenticated session alive for a
 * short period so the same participant can reconnect.
 *
 * Explicit Leave and explicit Destroy do NOT use this timer.
 * Those actions remain immediate.
 */
const RECONNECT_GRACE_MS = 5000;

/*
 * Pending disconnect cleanup timers.
 *
 * Key:
 *   roomId:sessionId
 *
 * Value:
 *   timeout handle
 */
const pendingDisconnects = new Map();

/**
 * Create a unique key for a room/session pair.
 *
 * sessionId is private and never sent to clients.
 */
function getDisconnectKey(
  roomId,
  sessionId
) {
  return `${roomId}:${sessionId}`;
}

/**
 * Cancel pending disconnect cleanup for a participant.
 *
 * This is called when the same authenticated participant
 * establishes a new socket connection.
 *
 * Returns true when a pending disconnect was cancelled.
 */
function cancelPendingDisconnect(
  roomId,
  sessionId
) {
  const key =
    getDisconnectKey(
      roomId,
      sessionId
    );

  const timer =
    pendingDisconnects.get(key);

  if (!timer) {
    return false;
  }

  clearTimeout(timer);

  pendingDisconnects.delete(key);

  logger.info(
    'Pending disconnect cancelled - participant reconnected',
    {
      roomId,
    }
  );

  return true;
}

/**
 * Schedule cleanup after a socket disconnect.
 *
 * The participant is NOT removed immediately.
 *
 * If the same session reconnects before the timer
 * expires, cancelPendingDisconnect() removes the timer.
 */
function scheduleDisconnectCleanup(
  io,
  socket
) {
  const {
    roomId,
    sessionId,
    sessionSecret,
  } = socket.data;

  const key =
    getDisconnectKey(
      roomId,
      sessionId
    );

  /*
   * Do not create multiple timers for the
   * same authenticated session.
   */
  cancelPendingDisconnect(
    roomId,
    sessionId
  );

  const timer =
    setTimeout(() => {
      pendingDisconnects.delete(key);

      /*
       * Check whether the participant has already
       * reconnected.
       *
       * Never remove an actively connected participant.
       */
      const activeSocket =
        findParticipantSocket(
          io,
          roomId,
          sessionId
        );

      if (activeSocket) {
        logger.info(
          'Disconnect cleanup skipped - participant already reconnected',
          {
            roomId,
          }
        );

        return;
      }

      /*
       * The participant did not reconnect within
       * the grace period.
       *
       * Owner:
       *   destroy the entire room.
       *
       * Participant:
       *   remove only that participant.
       */
      if (socket.data.isOwner) {
        try {
          const result =
            roomManager.destroyRoom(
              roomId,
              sessionId,
              sessionSecret
            );

          if (
            result &&
            result.ok === false
          ) {
            logger.warn(
              'Failed to destroy room after owner disconnect timeout',
              {
                roomId,
                message:
                  result.message ||
                  'Unknown error',
              }
            );

            return;
          }

          markRoomAsDestroyed(
            io,
            roomId
          );

          io.to(roomId).emit(
            'room:expired'
          );

          /*
           * Give clients a moment to receive
           * room:expired before disconnecting.
           */
          setTimeout(() => {
            try {
              io.in(roomId).disconnectSockets(
                true
              );
            } catch (disconnectError) {
              logger.warn(
                'Failed to disconnect sockets after owner timeout',
                {
                  roomId,
                  error:
                    disconnectError.message,
                }
              );
            }
          }, 100);

          logger.info(
            'Owner did not reconnect - room destroyed',
            {
              roomId,
            }
          );
        } catch (error) {
          logger.error(
            'Failed to destroy room after owner disconnect timeout',
            {
              roomId,
              error:
                error.message,
            }
          );
        }

        return;
      }

      /*
       * Normal participant.
       */
      try {
        const removed =
          sessionManager.destroySession(
            roomId,
            sessionId,
            sessionSecret
          );

        if (!removed) {
          return;
        }

        /*
         * PUBLIC participantId only.
         */
        socket.to(roomId).emit(
          'room:user-left',
          {
            id:
              socket.data.participantId,
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
          'Participant did not reconnect - removed',
          {
            roomId,
          }
        );
      } catch (error) {
        logger.warn(
          'Failed to remove participant after disconnect timeout',
          {
            roomId,
            error:
              error.message,
          }
        );
      }
    }, RECONNECT_GRACE_MS);

  pendingDisconnects.set(
    key,
    timer
  );
}

/**
 * Send an error to a socket.
 */
function emitError(
  socket,
  message
) {
  socket.emit(
    'connection:error',
    {
      message,
    }
  );
}

/**
 * Mark every socket belonging to a room
 * as already destroyed.
 *
 * This prevents duplicate cleanup when the
 * owner destroys the room and Socket.IO
 * disconnects all other users.
 */
function markRoomAsDestroyed(
  io,
  roomId
) {
  for (
    const clientSocket of
      io.sockets.sockets.values()
  ) {
    if (
      clientSocket.data.roomId ===
      roomId
    ) {
      clientSocket.data.roomAlreadyDestroyed =
        true;
    }
  }
}

/**
 * Find a socket by room ID and PRIVATE
 * session ID.
 *
 * sessionId is only used internally
 * by the server.
 *
 * It must NEVER be sent to another
 * participant.
 */
function findParticipantSocket(
  io,
  roomId,
  sessionId
) {
  return [
    ...io.sockets.sockets.values(),
  ].find(
    (clientSocket) =>
      clientSocket.data.roomId ===
        roomId &&
      clientSocket.data.sessionId ===
        sessionId
  );
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
    sessionSecret,
  } = socket.data;

  /*
   * IMPORTANT:
   *
   * If this participant had previously disconnected
   * and is now reconnecting, cancel the pending cleanup.
   */
  cancelPendingDisconnect(
    roomId,
    sessionId
  );

  /**
   * Lock room.
   */
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

  /**
   * Unlock room.
   */
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

  /**
   * Enable or disable new members.
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

  /**
   * Enable or disable file sharing.
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

  /**
   * Change maximum participants.
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

  /**
   * Extend room expiration.
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

  /**
   * Remove a participant.
   *
   * Frontend sends PUBLIC participantId.
   *
   * Backend resolves the participant's
   * PRIVATE sessionId and sessionSecret
   * internally.
   */
  socket.on(
    'room:remove-participant',
    ({
      participantId:
        targetParticipantId,
    } = {}) => {
      try {
        if (!targetParticipantId) {
          throw new Error(
            'Target participant identifier is required.'
          );
        }

        const participants =
          store.getParticipants(
            roomId
          );

        const targetParticipant =
          participants.find(
            (participant) =>
              participant.participantId ===
              targetParticipantId
          );

        if (!targetParticipant) {
          throw new Error(
            'Participant not found.'
          );
        }

        const targetSessionId =
          targetParticipant.sessionId;

        const targetSessionSecret =
          targetParticipant.sessionSecret;

        const target =
          sessionManager.validateSession(
            roomId,
            targetSessionId,
            targetSessionSecret
          );

        if (!target) {
          throw new Error(
            'Target participant session is invalid.'
          );
        }

        /*
         * Find the target socket BEFORE removing
         * the participant from the store.
         */
        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        /*
         * Mark the socket BEFORE removing
         * the participant.
         *
         * This prevents the target socket's
         * disconnect event from generating a
         * normal "left the room" event.
         */
        if (targetSocket) {
          targetSocket.data.suppressLeaveEvent =
            true;

          targetSocket.data.intentionalRemoval =
            true;
        }

        /*
         * Explicit removal is immediate.
         *
         * Cancel any pending reconnect cleanup
         * because the owner intentionally removed
         * this participant.
         */
        cancelPendingDisconnect(
          roomId,
          targetSessionId
        );

        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetParticipantId
        );

        /*
         * IMPORTANT:
         *
         * This is intentionally NOT room:user-left.
         *
         * room:user-left means the participant
         * voluntarily left or disappeared after
         * the reconnect grace period.
         *
         * room:user-removed means the owner
         * explicitly removed the participant.
         */
        io.to(roomId).emit(
          'room:user-removed',
          {
            id:
              targetParticipantId,
          }
        );

        /*
         * Create ONLY the removal message.
         */
        const removedNotice =
          createSystemMessage(
            `${targetParticipant.anonymousName} was removed from the room.`
          );

        store.addMessage(
          roomId,
          removedNotice
        );

        io.to(roomId).emit(
          'message:new',
          removedNotice
        );

        /*
         * Notify the removed participant and
         * disconnect their socket.
         */
        if (targetSocket) {
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
   * Explicitly destroy room.
   *
   * Only the owner can do this.
   *
   * This is IMMEDIATE and does not use
   * the reconnect grace period.
   */
  socket.on(
    'room:destroy',
    (ack) => {
      try {
        if (!socket.data.isOwner) {
          const message =
            'Only the room owner can destroy the room.';

          if (
            typeof ack === 'function'
          ) {
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

        if (
          socket.data.roomAlreadyDestroyed
        ) {
          if (
            typeof ack === 'function'
          ) {
            ack({
              ok: true,
              alreadyDestroyed: true,
            });
          }

          return;
        }

        /*
         * Explicit destruction cancels any
         * pending reconnect cleanup.
         */
        cancelPendingDisconnect(
          roomId,
          sessionId
        );

        const result =
          roomManager.destroyRoom(
            roomId,
            sessionId,
            sessionSecret
          );

        if (
          result &&
          result.ok === false
        ) {
          const message =
            result.message ||
            'Failed to destroy room.';

          if (
            typeof ack === 'function'
          ) {
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

        markRoomAsDestroyed(
          io,
          roomId
        );

        if (
          typeof ack === 'function'
        ) {
          ack({
            ok: true,
          });
        }

        io.to(roomId).emit(
          'room:expired'
        );

        setTimeout(() => {
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
        }, 500);

        logger.info(
          'Room explicitly destroyed',
          {
            roomId,
          }
        );
      } catch (error) {
        logger.error(
          'Failed to destroy room',
          {
            roomId,
            error:
              error.message,
          }
        );

        if (
          typeof ack === 'function'
        ) {
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
   * Explicit leave room.
   *
   * This is IMMEDIATE.
   *
   * Owner:
   *   destroys the entire room.
   *
   * Participant:
   *   leaves only themselves.
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
         * Explicit leave must cancel any
         * pending disconnect cleanup.
         */
        cancelPendingDisconnect(
          roomId,
          sessionId
        );

        /*
         * Owner explicitly leaving:
         * destroy the entire room.
         */
        if (socket.data.isOwner) {
          roomManager.destroyRoom(
            roomId,
            sessionId,
            sessionSecret
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
            }
          );

          return;
        }

        /*
         * Normal participant explicitly leaves.
         */
        sessionManager.destroySession(
          roomId,
          sessionId,
          sessionSecret
        );

        socket.to(roomId).emit(
          'room:user-left',
          {
            id:
              socket.data.participantId,
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
          }
        );
      } catch (error) {
        logger.warn(
          'Failed to process explicit room leave',
          {
            roomId,
            error:
              error.message,
          }
        );
      }
    }
  );

  /**
   * Handle socket disconnect.
   *
   * IMPORTANT:
   *
   * We do NOT immediately destroy the session.
   *
   * A browser reload temporarily disconnects the
   * old socket before creating the new one.
   *
   * Instead we schedule cleanup and allow the same
   * authenticated session to reconnect.
   *
   * Explicit room:leave, room:destroy and participant
   * removal remain immediate.
   */
  socket.on(
    'disconnect',
    (reason) => {
      logger.info(
        'Socket disconnected',
        {
          roomId,
          isOwner:
            socket.data.isOwner,
          reason:
            reason || 'unknown',
        }
      );

      /*
       * Room was already explicitly destroyed.
       */
      if (
        socket.data.roomAlreadyDestroyed
      ) {
        return;
      }

      /*
       * User explicitly left.
       *
       * room:leave already performed
       * the required cleanup.
       */
      if (
        socket.data.intentionalLeave
      ) {
        return;
      }

      /*
       * Participant was explicitly removed.
       *
       * room:remove-participant already
       * performed the cleanup and already
       * emitted the "was removed" message.
       */
      if (
        socket.data.suppressLeaveEvent ||
        socket.data.intentionalRemoval
      ) {
        return;
      }

      /*
       * Schedule temporary disconnect handling.
       *
       * If the browser reloads, the new socket
       * will authenticate with the same credentials
       * and cancel this timer.
       *
       * If the user really closed the browser/tab
       * and does not return, cleanup happens after
       * RECONNECT_GRACE_MS.
       */
      scheduleDisconnectCleanup(
        io,
        socket
      );
    }
  );
}

module.exports =
  registerRoomEvents;
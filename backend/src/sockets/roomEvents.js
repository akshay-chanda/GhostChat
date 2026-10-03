const crypto = require('crypto');

const roomManager = require('../services/roomManager');
const sessionManager = require('../services/sessionManager');
const fileStorageService = require('../services/fileStorageService');
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
 * Prevent a single client from flooding the room with
 * screenshot notifications.
 */
const SCREENSHOT_NOTIFICATION_COOLDOWN_MS = 1500;

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
   * Screenshot detection.
   *
   * The browser sends ONLY:
   *
   *   screenshot:detected
   *
   * The backend NEVER trusts a participant ID or
   * anonymous name supplied by the browser.
   *
   * Instead, identity comes from the already
   * authenticated Socket.IO connection:
   *
   *   socket.data.participantId
   *   socket.data.anonymousName
   *
   * This event is best-effort because a normal website
   * cannot reliably detect every OS-level screenshot.
   *
   * The event is NOT stored as a normal chat message.
   * It is an ephemeral room notification.
   */
  socket.on(
    'screenshot:detected',
    () => {
      try {
        /*
         * Ignore events from a socket whose room has
         * already been destroyed.
         */
        if (
          socket.data.roomAlreadyDestroyed
        ) {
          return;
        }

        /*
         * Make sure the socket still belongs to
         * an authenticated participant.
         */
        if (
          !socket.data.participantId ||
          !socket.data.anonymousName
        ) {
          logger.warn(
            'Screenshot notification rejected - participant identity is missing',
            {
              roomId,
            }
          );

          return;
        }

        /*
         * Basic anti-spam cooldown.
         *
         * A malicious client could otherwise emit this
         * event hundreds of times manually.
         */
        const now =
          Date.now();

        const lastScreenshotAt =
          socket.data.lastScreenshotAt || 0;

        if (
          now -
            lastScreenshotAt <
          SCREENSHOT_NOTIFICATION_COOLDOWN_MS
        ) {
          return;
        }

        socket.data.lastScreenshotAt =
          now;

        const timestamp =
          new Date().toISOString();

        const eventId =
          crypto.randomUUID();

        /*
         * Broadcast to EVERY participant.
         *
         * The frontend ignores the event for the
         * participant who triggered it.
         *
         * Therefore:
         *
         *   A -> sees nothing
         *   B/C -> see "A took a screenshot."
         *
         * Only public participant information
         * is included.
         */
        io.to(roomId).emit(
          'screenshot:detected',
          {
            eventId,
            participantId:
              socket.data.participantId,
            anonymousName:
              socket.data.anonymousName,
            timestamp,
          }
        );

        logger.info(
          'Screenshot notification broadcast',
          {
            roomId,
            participantId:
              socket.data.participantId,
          }
        );
      } catch (error) {
        logger.warn(
          'Failed to process screenshot notification',
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
   * Delete a message.
   *
   * This handles BOTH:
   *   - normal text messages
   *   - file/voice messages
   */
  socket.on(
    'message:delete',
    async ({
      messageId,
    } = {}) => {
      try {
        if (!messageId) {
          throw new Error(
            'Message ID is required.'
          );
        }

        const message =
          store.getMessage(
            roomId,
            messageId
          );

        if (!message) {
          throw new Error(
            'Message not found.'
          );
        }

        if (
          message.senderId !==
          socket.data.participantId
        ) {
          throw new Error(
            'You can only delete your own messages.'
          );
        }

        if (
          message.type === 'file' &&
          message.file &&
          message.file.id
        ) {
          const deleted =
            await fileStorageService.deleteFile(
              message.file.id,
              sessionId,
              Boolean(
                socket.data.isOwner
              )
            );

          if (!deleted) {
            throw new Error(
              'You are not allowed to delete this file.'
            );
          }
        }

        const removed =
          store.removeMessage(
            roomId,
            messageId
          );

        if (!removed) {
          throw new Error(
            'Message could not be deleted.'
          );
        }

        io.to(roomId).emit(
          'message:delete',
          {
            messageId,
          }
        );

        logger.info(
          'Message deleted',
          {
            roomId,
            messageId,
            participantId:
              socket.data.participantId,
            messageType:
              message.type || 'unknown',
          }
        );
      } catch (error) {
        logger.warn(
          'Failed to delete message',
          {
            roomId,
            messageId,
            participantId:
              socket.data.participantId,
            error:
              error.message,
          }
        );

        emitError(
          socket,
          error.message
        );
      }
    }
  );

  /**
   * Remove a participant.
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

        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        if (targetSocket) {
          targetSocket.data.suppressLeaveEvent =
            true;

          targetSocket.data.intentionalRemoval =
            true;
        }

        cancelPendingDisconnect(
          roomId,
          targetSessionId
        );

        roomManager.removeParticipant(
          roomId,
          sessionId,
          targetParticipantId
        );

        io.to(roomId).emit(
          'room:user-removed',
          {
            id:
              targetParticipantId,
          }
        );

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

        cancelPendingDisconnect(
          roomId,
          sessionId
        );

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

      if (
        socket.data.roomAlreadyDestroyed
      ) {
        return;
      }

      if (
        socket.data.intentionalLeave
      ) {
        return;
      }

      if (
        socket.data.suppressLeaveEvent ||
        socket.data.intentionalRemoval
      ) {
        return;
      }

      scheduleDisconnectCleanup(
        io,
        socket
      );
    }
  );
}

module.exports =
  registerRoomEvents;
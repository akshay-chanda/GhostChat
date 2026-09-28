import {
  getRoom,
  destroyRoom,
  updateRoom,
  removeParticipant,
} from '../services/roomManager.js';

import {
  destroySession,
  getSession,
} from '../services/sessionManager.js';


// ============================================================
// HELPERS
// ============================================================

function getRoomId(socket) {
  return socket.handshake.auth?.roomId;
}

function getSessionId(socket) {
  return socket.handshake.auth?.sessionId;
}

function getSocketRoom(roomId) {
  return `room:${roomId}`;
}


/**
 * Find another active socket belonging to the same
 * room/session.
 *
 * This is useful when a browser temporarily reconnects
 * or when the same session has more than one socket.
 */
function findParticipantSocket(io, roomId, sessionId) {
  const roomName = getSocketRoom(roomId);
  const sockets = io.sockets.adapter.rooms.get(roomName);

  if (!sockets) {
    return null;
  }

  for (const socketId of sockets) {
    const connectedSocket = io.sockets.sockets.get(socketId);

    if (!connectedSocket) {
      continue;
    }

    const connectedRoomId =
      connectedSocket.handshake.auth?.roomId;

    const connectedSessionId =
      connectedSocket.handshake.auth?.sessionId;

    if (
      connectedRoomId === roomId &&
      connectedSessionId === sessionId
    ) {
      return connectedSocket;
    }
  }

  return null;
}


// ============================================================
// REGISTER ROOM EVENTS
// ============================================================

export function registerRoomEvents(io, socket) {
  const roomId = getRoomId(socket);
  const sessionId = getSessionId(socket);

  if (!roomId || !sessionId) {
    console.warn(
      '[roomEvents] Missing room/session information'
    );

    return;
  }

  console.log(
    `[roomEvents] Registering events for room=${roomId} session=${sessionId}`
  );


  // ==========================================================
  // MESSAGE: SEND
  // ==========================================================

  socket.on('message:send', (payload) => {
    try {
      const room = getRoom(roomId);

      if (!room) {
        socket.emit('connection:error', {
          message: 'Room is no longer available.',
        });

        return;
      }

      const session = getSession(sessionId);

      if (!session) {
        socket.emit('connection:error', {
          message: 'Your session is no longer valid.',
        });

        return;
      }

      if (!payload || typeof payload !== 'object') {
        return;
      }

      const message = {
        ...payload,

        sessionId,

        senderSessionId: sessionId,

        senderName:
          session.anonymousName ||
          session.name ||
          'Anonymous',

        type: payload.type || 'text',

        timestamp: Date.now(),
      };

      io.to(getSocketRoom(roomId)).emit(
        'message:new',
        message
      );
    } catch (error) {
      console.error(
        '[roomEvents] message:send failed:',
        error
      );
    }
  });


  // ==========================================================
  // MESSAGE: DELETE
  // ==========================================================

  socket.on('message:delete', (payload) => {
    try {
      const messageId = payload?.messageId;

      if (!messageId) {
        return;
      }

      io.to(getSocketRoom(roomId)).emit(
        'message:deleted',
        {
          messageId,
          sessionId,
        }
      );
    } catch (error) {
      console.error(
        '[roomEvents] message:delete failed:',
        error
      );
    }
  });


  // ==========================================================
  // MESSAGE: CLEAR
  // ==========================================================

  socket.on('message:clear', () => {
    try {
      const room = getRoom(roomId);

      if (!room) {
        return;
      }

      if (room.ownerId !== sessionId) {
        return;
      }

      io.to(getSocketRoom(roomId)).emit(
        'message:clear',
        {
          sessionId,
        }
      );
    } catch (error) {
      console.error(
        '[roomEvents] message:clear failed:',
        error
      );
    }
  });


  // ==========================================================
  // TYPING
  // ==========================================================

  socket.on('typing:start', () => {
    socket.to(getSocketRoom(roomId)).emit(
      'typing:start',
      {
        sessionId,
      }
    );
  });


  socket.on('typing:stop', () => {
    socket.to(getSocketRoom(roomId)).emit(
      'typing:stop',
      {
        sessionId,
      }
    );
  });


  // ==========================================================
  // ROOM LOCK
  // ==========================================================

  socket.on('room:lock', () => {
    try {
      const room = getRoom(roomId);

      if (!room) {
        return;
      }

      if (room.ownerId !== sessionId) {
        return;
      }

      const updatedRoom = updateRoom(
        roomId,
        {
          locked: true,
        }
      );

      io.to(getSocketRoom(roomId)).emit(
        'room:updated',
        updatedRoom
      );
    } catch (error) {
      console.error(
        '[roomEvents] room:lock failed:',
        error
      );
    }
  });


  // ==========================================================
  // ROOM UNLOCK
  // ==========================================================

  socket.on('room:unlock', () => {
    try {
      const room = getRoom(roomId);

      if (!room) {
        return;
      }

      if (room.ownerId !== sessionId) {
        return;
      }

      const updatedRoom = updateRoom(
        roomId,
        {
          locked: false,
        }
      );

      io.to(getSocketRoom(roomId)).emit(
        'room:updated',
        updatedRoom
      );
    } catch (error) {
      console.error(
        '[roomEvents] room:unlock failed:',
        error
      );
    }
  });


  // ==========================================================
  // ACCEPTING NEW MEMBERS
  // ==========================================================

  socket.on(
    'room:set-accepting-members',
    (payload) => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        const accepting =
          Boolean(payload?.accepting);

        const updatedRoom = updateRoom(
          roomId,
          {
            acceptingNewMembers: accepting,
          }
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:updated',
          updatedRoom
        );
      } catch (error) {
        console.error(
          '[roomEvents] room:set-accepting-members failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // FILE SHARING
  // ==========================================================

  socket.on(
    'room:set-file-sharing',
    (payload) => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        const enabled =
          Boolean(payload?.enabled);

        const updatedRoom = updateRoom(
          roomId,
          {
            fileSharingEnabled: enabled,
          }
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:updated',
          updatedRoom
        );
      } catch (error) {
        console.error(
          '[roomEvents] room:set-file-sharing failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // MAX PARTICIPANTS
  // ==========================================================

  socket.on(
    'room:set-max-participants',
    (payload) => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        const maxParticipants =
          Number(payload?.maxParticipants);

        if (
          !Number.isFinite(maxParticipants) ||
          maxParticipants < 1
        ) {
          return;
        }

        const updatedRoom = updateRoom(
          roomId,
          {
            maxParticipants,
          }
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:updated',
          updatedRoom
        );
      } catch (error) {
        console.error(
          '[roomEvents] room:set-max-participants failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // EXTEND ROOM EXPIRATION
  // ==========================================================

  socket.on(
    'room:extend-expiration',
    (payload) => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        const additionalSeconds =
          Number(payload?.additionalSeconds);

        if (
          !Number.isFinite(additionalSeconds) ||
          additionalSeconds <= 0
        ) {
          return;
        }

        const currentExpiresAt =
          new Date(room.expiresAt).getTime();

        const newExpiresAt =
          currentExpiresAt +
          additionalSeconds * 1000;

        const updatedRoom = updateRoom(
          roomId,
          {
            expiresAt:
              new Date(newExpiresAt).toISOString(),
          }
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:updated',
          updatedRoom
        );
      } catch (error) {
        console.error(
          '[roomEvents] room:extend-expiration failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // REMOVE PARTICIPANT
  //
  // This is an EXPLICIT action by the host.
  // It is different from a temporary socket disconnect.
  // ==========================================================

  socket.on(
    'room:remove-participant',
    (payload) => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        const targetSessionId =
          payload?.sessionId;

        if (!targetSessionId) {
          return;
        }

        if (
          targetSessionId ===
          room.ownerId
        ) {
          return;
        }

        const targetSession =
          getSession(targetSessionId);

        if (!targetSession) {
          return;
        }

        removeParticipant(
          roomId,
          targetSessionId
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:user-left',
          {
            sessionId:
              targetSessionId,
          }
        );

        const targetSocket =
          findParticipantSocket(
            io,
            roomId,
            targetSessionId
          );

        if (targetSocket) {
          targetSocket.emit(
            'room:removed',
            {
              roomId,
              message:
                'You were removed from the room by the host.',
            }
          );

          targetSocket.leave(
            getSocketRoom(roomId)
          );

          targetSocket.disconnect(
            true
          );
        }
      } catch (error) {
        console.error(
          '[roomEvents] room:remove-participant failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // DESTROY ROOM
  //
  // Explicit host action.
  // ==========================================================

  socket.on(
    'room:destroy',
    () => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        if (room.ownerId !== sessionId) {
          return;
        }

        console.log(
          `[roomEvents] Host explicitly destroying room ${roomId}`
        );

        io.to(getSocketRoom(roomId)).emit(
          'room:expired',
          {
            roomId,
            reason: 'destroyed',
          }
        );

        destroyRoom(roomId);

        const roomName =
          getSocketRoom(roomId);

        const sockets =
          io.sockets.adapter.rooms.get(
            roomName
          );

        if (sockets) {
          for (const socketId of sockets) {
            const participantSocket =
              io.sockets.sockets.get(
                socketId
              );

            if (participantSocket) {
              participantSocket.leave(
                roomName
              );

              participantSocket.disconnect(
                true
              );
            }
          }
        }
      } catch (error) {
        console.error(
          '[roomEvents] room:destroy failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // EXPLICIT LEAVE ROOM
  //
  // IMPORTANT:
  // This is now the ONLY normal way a user's session is
  // destroyed because they left.
  //
  // A temporary Socket.IO disconnect DOES NOT come here.
  // ==========================================================

  socket.on(
    'room:leave',
    () => {
      try {
        const room = getRoom(roomId);

        if (!room) {
          return;
        }

        console.log(
          `[roomEvents] Explicit leave: room=${roomId} session=${sessionId}`
        );

        // ----------------------------------------------------
        // OWNER LEAVES
        // ----------------------------------------------------

        if (
          room.ownerId === sessionId
        ) {
          io.to(
            getSocketRoom(roomId)
          ).emit(
            'room:expired',
            {
              roomId,
              reason: 'owner-left',
            }
          );

          destroyRoom(roomId);

          return;
        }

        // ----------------------------------------------------
        // PARTICIPANT LEAVES
        // ----------------------------------------------------

        destroySession(
          sessionId
        );

        io.to(
          getSocketRoom(roomId)
        ).emit(
          'room:user-left',
          {
            sessionId,
          }
        );

        socket.leave(
          getSocketRoom(roomId)
        );
      } catch (error) {
        console.error(
          '[roomEvents] room:leave failed:',
          error
        );
      }
    }
  );


  // ==========================================================
  // SOCKET DISCONNECTING
  //
  // VERY IMPORTANT:
  //
  // DO NOT destroy room here.
  // DO NOT destroy session here.
  //
  // iOS Safari can temporarily disconnect a WebSocket when
  // opening a file viewer, switching apps, locking the screen,
  // or moving the browser into the background.
  //
  // Therefore a disconnect is NOT considered a room leave.
  // ==========================================================

  socket.on(
    'disconnecting',
    (reason) => {
      console.log(
        `[roomEvents] Socket temporarily disconnecting: room=${roomId} session=${sessionId} reason=${reason}`
      );

      // Intentionally do nothing.
      //
      // DO NOT:
      // destroyRoom(roomId)
      // destroySession(sessionId)
      // emit room:expired
      // emit room:user-left
      //
      // The client is allowed to reconnect.
    }
  );


  // ==========================================================
  // SOCKET DISCONNECTED
  // ==========================================================

  socket.on(
    'disconnect',
    (reason) => {
      console.log(
        `[roomEvents] Socket disconnected: room=${roomId} session=${sessionId} reason=${reason}`
      );

      // ------------------------------------------------------
      // IMPORTANT:
      //
      // Still do NOT destroy the room/session here.
      //
      // Socket.IO will reconnect on the client.
      // The session remains valid until:
      //
      // - user explicitly leaves
      // - host explicitly removes them
      // - host destroys the room
      // - room expires
      // - server/session expiration logic invalidates it
      // ------------------------------------------------------
    }
  );
}
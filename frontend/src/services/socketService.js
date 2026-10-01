import { io } from 'socket.io-client';

import { SOCKET_URL } from '../utils/constants';
import { encryptMessage } from '../crypto/encryption';
import { decryptMessage } from '../crypto/decryption';
import { generateClientMessageId } from '../utils/idGenerator';

let socket = null;
let roomKey = null;
let currentParams = null;

/**
 * ============================================================
 * CONNECT SOCKET
 * ============================================================
 */
export function connectSocket({
  roomId,
  sessionId,
  key,
}) {
  if (!roomId || !sessionId) {
    console.error(
      '[socketService] Missing roomId or sessionId'
    );

    return null;
  }

  /*
   * If this is already the exact same room/session,
   * reuse the existing socket.
   *
   * This is important for mobile browsers when the user
   * temporarily leaves the browser to open a file viewer.
   */
  if (
    socket &&
    currentParams?.roomId === roomId &&
    currentParams?.sessionId === sessionId
  ) {
    roomKey = key;

    if (!socket.connected && !socket.active) {
      socket.connect();
    }

    return socket;
  }

  /*
   * If a socket belongs to another room/session,
   * completely close it before creating a new one.
   */
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch (error) {
      console.warn(
        '[socketService] Previous socket cleanup failed:',
        error
      );
    }

    socket = null;
    roomKey = null;
    currentParams = null;
  }

  roomKey = key;

  currentParams = {
    roomId,
    sessionId,
  };

  /*
   * Create a completely new Socket.IO connection.
   */
  socket = io(SOCKET_URL, {
    auth: {
      roomId,
      sessionId,
    },

    transports: ['websocket'],

    reconnection: true,

    reconnectionAttempts: Infinity,

    reconnectionDelay: 1000,

    reconnectionDelayMax: 5000,

    randomizationFactor: 0.5,

    autoConnect: true,

    /*
     * Allows temporary browser/app switching on mobile
     * without Socket.IO intentionally closing the socket.
     */
    closeOnBeforeunload: false,
  });

  /*
   * CONNECT
   */
  socket.on('connect', () => {
    console.log(
      '[socketService] Socket connected:',
      socket?.id
    );

    console.log(
      '[socketService] Room ID:',
      roomId
    );

    console.log(
      '[socketService] Session ID:',
      sessionId
    );
  });

  /*
   * CONNECTION ERROR
   */
  socket.on(
    'connect_error',
    (error) => {
      console.error(
        '[socketService] Socket connection error:',
        error?.message || error
      );
    }
  );

  /*
   * DISCONNECT
   */
  socket.on(
    'disconnect',
    (reason) => {
      console.log(
        '[socketService] Socket disconnected:',
        reason
      );
    }
  );

  /*
   * SERVER CONNECTION ERROR
   */
  socket.on(
    'connection:error',
    (payload) => {
      console.error(
        '[socketService] Server socket error:',
        payload
      );
    }
  );

  return socket;
}

/**
 * ============================================================
 * RECONNECT SOCKET
 * ============================================================
 */
export function reconnectSocket() {
  if (!socket) {
    console.warn(
      '[socketService] No socket available to reconnect'
    );

    return;
  }

  if (socket.connected) {
    return;
  }

  console.log(
    '[socketService] Reconnecting socket...'
  );

  socket.connect();
}

/**
 * ============================================================
 * DISCONNECT SOCKET
 * ============================================================
 *
 * Completely removes the current socket.
 *
 * IMPORTANT:
 * This should only be called when the application is
 * intentionally leaving the current room.
 */
export function disconnectSocket() {
  const oldSocket = socket;

  /*
   * Clear the singleton state FIRST.
   *
   * This prevents a late socket event from accidentally
   * being treated as the active socket.
   */
  socket = null;
  roomKey = null;
  currentParams = null;

  if (!oldSocket) {
    return;
  }

  try {
    oldSocket.removeAllListeners();

    if (
      oldSocket.connected ||
      oldSocket.active
    ) {
      oldSocket.disconnect();
    }
  } catch (error) {
    console.warn(
      '[socketService] Socket disconnect failed:',
      error
    );
  }
}

/**
 * ============================================================
 * LEAVE ROOM
 * ============================================================
 *
 * Explicit participant/owner leave.
 *
 * The backend receives room:leave first.
 * Then the local socket is immediately destroyed.
 */
export function leaveRoom() {
  const activeSocket = socket;

  if (
    activeSocket &&
    activeSocket.connected
  ) {
    try {
      activeSocket.emit(
        'room:leave'
      );
    } catch (error) {
      console.error(
        '[socketService] Failed to emit room:leave:',
        error
      );
    }
  }

  disconnectSocket();
}

/**
 * ============================================================
 * GET SOCKET
 * ============================================================
 */
export function getSocket() {
  return socket;
}

/**
 * ============================================================
 * WAIT FOR SOCKET CONNECTION
 * ============================================================
 */
function waitForConnection(
  timeout = 15000
) {
  return new Promise(
    (resolve, reject) => {
      if (!socket) {
        reject(
          new Error(
            'Socket is not initialized'
          )
        );

        return;
      }

      if (socket.connected) {
        resolve();
        return;
      }

      let finished = false;
      let timer = null;

      const cleanup = () => {
        socket?.off(
          'connect',
          handleConnect
        );

        socket?.off(
          'connect_error',
          handleError
        );

        if (timer) {
          clearTimeout(timer);
        }
      };

      const finishResolve = () => {
        if (finished) {
          return;
        }

        finished = true;

        cleanup();

        resolve();
      };

      const finishReject = (
        error
      ) => {
        if (finished) {
          return;
        }

        finished = true;

        cleanup();

        reject(error);
      };

      const handleConnect = () => {
        console.log(
          '[socketService] Socket connected while waiting'
        );

        finishResolve();
      };

      const handleError = (
        error
      ) => {
        /*
         * Do not reject immediately.
         *
         * Socket.IO may automatically reconnect.
         */
        console.error(
          '[socketService] Connection attempt failed:',
          error?.message || error
        );
      };

      timer = setTimeout(() => {
        finishReject(
          new Error(
            'Socket connection timed out'
          )
        );
      }, timeout);

      socket.once(
        'connect',
        handleConnect
      );

      socket.on(
        'connect_error',
        handleError
      );

      if (
        !socket.connected &&
        !socket.active
      ) {
        socket.connect();
      }
    }
  );
}

/**
 * ============================================================
 * SEND MESSAGE
 * ============================================================
 */
export async function sendMessage(
  plaintext,
  replyTo
) {
  try {
    if (
      !plaintext ||
      !plaintext.trim()
    ) {
      throw new Error(
        'Message cannot be empty'
      );
    }

    if (!roomKey) {
      throw new Error(
        'Room encryption key is missing'
      );
    }

    await waitForConnection();

    if (
      !socket ||
      !socket.connected
    ) {
      throw new Error(
        'Socket is not connected'
      );
    }

    const clientId =
      generateClientMessageId();

    const {
      ciphertext,
      iv,
    } = await encryptMessage(
      plaintext,
      roomKey
    );

    if (
      !ciphertext ||
      !iv
    ) {
      throw new Error(
        'Message encryption failed'
      );
    }

    const payload = {
      clientId,
      ciphertext,
      iv,
      replyToMessageId:
        replyTo?.id ?? null,
    };

    socket.emit(
      'message:send',
      payload
    );

    return clientId;
  } catch (error) {
    console.error(
      '[socketService] SEND MESSAGE ERROR:',
      error
    );

    throw error;
  }
}

/**
 * ============================================================
 * RECEIVE MESSAGES
 * ============================================================
 */
export function onMessage(
  callback
) {
  if (!socket) {
    console.warn(
      '[socketService] Cannot listen for messages: socket is missing'
    );

    return () => {};
  }

  const activeSocket = socket;

  const handler = async (
    payload
  ) => {
    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      console.warn(
        '[socketService] Invalid message payload:',
        payload
      );

      return;
    }

    /*
     * System messages are not encrypted.
     */
    if (
      payload.type === 'system'
    ) {
      callback(payload);
      return;
    }

    /*
     * File messages are handled separately.
     */
    if (
      payload.type === 'file'
    ) {
      callback({
        ...payload,
        content:
          payload.content ?? null,
      });

      return;
    }

    try {
      if (!roomKey) {
        throw new Error(
          'Room key is missing'
        );
      }

      if (
        typeof payload.ciphertext !==
          'string' ||
        typeof payload.iv !==
          'string' ||
        !payload.ciphertext ||
        !payload.iv
      ) {
        throw new Error(
          'Invalid encrypted message payload'
        );
      }

      const content =
        await decryptMessage(
          {
            ciphertext:
              payload.ciphertext,
            iv: payload.iv,
          },
          roomKey
        );

      callback({
        ...payload,
        content,
      });
    } catch (error) {
      console.error(
        '[socketService] Message decryption failed:',
        error
      );

      callback({
        ...payload,
        content: null,
        undecryptable: true,
      });
    }
  };

  activeSocket.on(
    'message:new',
    handler
  );

  return () => {
    activeSocket.off(
      'message:new',
      handler
    );
  };
}

/**
 * ============================================================
 * DELETE MESSAGE
 * ============================================================
 */
export function deleteMessage(
  messageId
) {
  if (
    !socket ||
    !socket.connected ||
    !messageId
  ) {
    console.warn(
      '[socketService] Cannot delete message: socket unavailable'
    );

    return;
  }

  socket.emit(
    'message:delete',
    {
      messageId,
    }
  );
}

/**
 * ============================================================
 * TYPING
 * ============================================================
 */
export function emitTypingStart() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'typing:start'
  );
}

export function emitTypingStop() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'typing:stop'
  );
}

/**
 * ============================================================
 * ROOM LOCK
 * ============================================================
 */
export function lockRoom() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'room:lock'
  );
}

export function unlockRoom() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'room:unlock'
  );
}

/**
 * ============================================================
 * ACCEPTING NEW MEMBERS
 * ============================================================
 */
export function setAcceptingNewMembers(
  accepting
) {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'room:set-accepting-members',
    {
      accepting:
        Boolean(accepting),
    }
  );
}

/**
 * ============================================================
 * FILE SHARING
 * ============================================================
 */
export function setFileSharingEnabled(
  enabled
) {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'room:set-file-sharing',
    {
      enabled:
        Boolean(enabled),
    }
  );
}

/**
 * ============================================================
 * MAX PARTICIPANTS
 * ============================================================
 */
export function setMaxParticipants(
  maxParticipants
) {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  const parsedLimit =
    Number(maxParticipants);

  if (
    !Number.isFinite(
      parsedLimit
    ) ||
    parsedLimit < 1
  ) {
    return;
  }

  socket.emit(
    'room:set-max-participants',
    {
      maxParticipants:
        parsedLimit,
    }
  );
}

/**
 * ============================================================
 * EXTEND EXPIRATION
 * ============================================================
 */
export function extendExpiration(
  additionalSeconds
) {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  const seconds =
    Number(
      additionalSeconds
    );

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return;
  }

  socket.emit(
    'room:extend-expiration',
    {
      additionalSeconds:
        seconds,
    }
  );
}

/**
 * ============================================================
 * DESTROY ROOM
 * ============================================================
 *
 * IMPORTANT:
 *
 * This waits for the backend acknowledgement.
 *
 * The backend should respond:
 *
 *   callback({
 *     ok: true
 *   });
 *
 * This prevents the frontend from assuming that the room
 * was destroyed before the backend actually processed it.
 */
export function destroyRoom() {
  return new Promise(
    (resolve, reject) => {
      const activeSocket = socket;

      if (
        !activeSocket ||
        !activeSocket.connected
      ) {
        reject(
          new Error(
            'Socket is not connected'
          )
        );

        return;
      }

      let finished = false;

      const timeout =
        setTimeout(() => {
          if (finished) {
            return;
          }

          finished = true;

          reject(
            new Error(
              'Room destruction request timed out'
            )
          );
        }, 10000);

      const finish = (
        callback
      ) => {
        if (finished) {
          return;
        }

        finished = true;

        clearTimeout(timeout);

        callback();
      };

      /*
       * IMPORTANT:
       *
       * Use the SAME socket that existed when
       * destroyRoom() was called.
       *
       * This prevents a newly-created socket from
       * accidentally receiving the old acknowledgement.
       */
      activeSocket.emit(
        'room:destroy',
        (response) => {
          finish(() => {
            if (
              response?.ok
            ) {
              resolve(response);
              return;
            }

            reject(
              new Error(
                response?.message ||
                  'Failed to destroy room'
              )
            );
          });
        }
      );
    }
  );
}

/**
 * ============================================================
 * REMOVE PARTICIPANT
 * ============================================================
 */
export function removeParticipant(
  sessionId
) {
  if (
    !socket ||
    !socket.connected ||
    !sessionId
  ) {
    return;
  }

  socket.emit(
    'room:remove-participant',
    {
      sessionId,
    }
  );
}

/**
 * ============================================================
 * CLEAR MESSAGES
 * ============================================================
 */
export function clearMessages() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  socket.emit(
    'message:clear'
  );
}

/**
 * ============================================================
 * GENERIC SOCKET EVENT LISTENER
 * ============================================================
 */
export function on(
  event,
  handler
) {
  if (!socket) {
    return () => {};
  }

  const activeSocket = socket;

  activeSocket.on(
    event,
    handler
  );

  return () => {
    activeSocket.off(
      event,
      handler
    );
  };
}
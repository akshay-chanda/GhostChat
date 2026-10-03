import { io } from 'socket.io-client';

import { SOCKET_URL } from '../utils/constants';
import { encryptMessage } from '../crypto/encryption';
import { decryptMessage } from '../crypto/decryption';
import { generateClientMessageId } from '../utils/idGenerator';

let socket = null;
let roomKey = null;
let currentParams = null;

/*
 * Initial connection is deliberately delayed until the
 * React components have registered their socket listeners.
 *
 * Without this delay, Socket.IO can connect immediately and
 * the backend can emit `room:joined` before RoomContext has
 * subscribed to it.
 */
let initialConnectTimer = null;

/**
 * Clear a pending initial connection timer.
 */
function clearInitialConnectTimer() {
  if (initialConnectTimer) {
    clearTimeout(initialConnectTimer);
    initialConnectTimer = null;
  }
}

/**
 * Schedule the first socket connection.
 */
function scheduleInitialConnection(targetSocket) {
  clearInitialConnectTimer();

  initialConnectTimer = setTimeout(() => {
    initialConnectTimer = null;

    if (
      socket !== targetSocket ||
      !targetSocket
    ) {
      return;
    }

    if (
      targetSocket.connected ||
      targetSocket.active
    ) {
      return;
    }

    console.log(
      '[socketService] Starting initial socket connection...'
    );

    targetSocket.connect();
  }, 0);
}

/**
 * Connect to a room.
 *
 * SECURITY:
 * - sessionId is PRIVATE.
 * - sessionSecret is PRIVATE.
 * - participantId is PUBLIC and is handled by the backend.
 *
 * Both sessionId and sessionSecret are sent to the backend only
 * through Socket.IO authentication.
 */
export function connectSocket({
  roomId,
  sessionId,
  sessionSecret,
  key,
}) {
  if (
    socket &&
    currentParams?.roomId === roomId &&
    currentParams?.sessionId === sessionId &&
    currentParams?.sessionSecret === sessionSecret
  ) {
    roomKey = key;

    if (
      !socket.connected &&
      !socket.active
    ) {
      scheduleInitialConnection(socket);
    }

    return socket;
  }

  clearInitialConnectTimer();

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  roomKey = key;

  currentParams = {
    roomId,
    sessionId,
    sessionSecret,
  };

  socket = io(SOCKET_URL, {
    auth: {
      roomId,
      sessionId,
      sessionSecret,
    },

    transports: ['websocket'],

    reconnection: true,

    reconnectionAttempts: Infinity,

    reconnectionDelay: 1000,

    reconnectionDelayMax: 5000,

    randomizationFactor: 0.5,

    autoConnect: false,

    closeOnBeforeunload: false,
  });

  /*
   * Never log sessionId or sessionSecret.
   */
  socket.on('connect', () => {
    console.log(
      'Socket connected:',
      socket?.id
    );

    console.log(
      'Room ID:',
      roomId
    );
  });

  socket.on('connect_error', (error) => {
    console.error(
      'Socket connection error:',
      error?.message || error
    );
  });

  socket.on('disconnect', (reason) => {
    console.log(
      'Socket disconnected:',
      reason
    );
  });

  socket.on('connection:error', (payload) => {
    console.error(
      'Server socket error:',
      payload
    );
  });

  /*
   * Wait asynchronously so RoomContext can register
   * its listeners before the backend sends room events.
   */
  scheduleInitialConnection(socket);

  return socket;
}

/**
 * Explicitly reconnect the existing socket.
 */
export function reconnectSocket() {
  if (!socket) {
    return;
  }

  if (
    socket.connected ||
    socket.active
  ) {
    return;
  }

  console.log(
    '[socketService] Reconnecting socket...'
  );

  socket.connect();
}

/**
 * Disconnect socket and clear session data.
 */
export function disconnectSocket() {
  clearInitialConnectTimer();

  if (socket) {
    socket.removeAllListeners();

    if (
      socket.connected ||
      socket.active
    ) {
      socket.disconnect();
    }
  }

  socket = null;
  roomKey = null;
  currentParams = null;
}

/**
 * Leave the current room.
 */
export function leaveRoom() {
  if (socket?.connected) {
    socket.emit('room:leave');
  }

  disconnectSocket();
}

/**
 * Get active socket.
 */
export function getSocket() {
  return socket;
}

/**
 * Wait until socket is connected.
 */
function waitForConnection(timeout = 15000) {
  return new Promise((resolve, reject) => {
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
    let timer;

    const cleanup = () => {
      socket?.off(
        'connect',
        handleConnect
      );

      socket?.off(
        'connect_error',
        handleError
      );

      clearTimeout(timer);
    };

    const finishResolve = () => {
      if (finished) {
        return;
      }

      finished = true;

      cleanup();
      resolve();
    };

    const finishReject = (error) => {
      if (finished) {
        return;
      }

      finished = true;

      cleanup();
      reject(error);
    };

    const handleConnect = () => {
      console.log(
        'Socket connected while waiting'
      );

      finishResolve();
    };

    const handleError = (error) => {
      console.error(
        'Connection attempt failed:',
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
  });
}

/**
 * Send an encrypted message.
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
      'SEND MESSAGE ERROR:',
      error
    );

    throw error;
  }
}

/**
 * Listen for new messages.
 */
export function onMessage(callback) {
  if (!socket) {
    console.warn(
      'Cannot listen for messages: socket is missing'
    );

    return () => {};
  }

  const handler = async (payload) => {
    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      console.warn(
        'Invalid message payload:',
        payload
      );

      return;
    }

    /*
     * System messages do not require decryption.
     */
    if (payload.type === 'system') {
      callback(payload);
      return;
    }

    /*
     * File messages do not require text decryption.
     */
    if (payload.type === 'file') {
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
            iv:
              payload.iv,
          },
          roomKey
        );

      callback({
        ...payload,
        content,
      });
    } catch (error) {
      console.error(
        'Message decryption failed:',
        error
      );

      callback({
        ...payload,
        content: null,
        undecryptable: true,
      });
    }
  };

  socket.on(
    'message:new',
    handler
  );

  return () => {
    socket?.off(
      'message:new',
      handler
    );
  };
}

/**
 * Delete a message.
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
      'Cannot delete message: socket is unavailable'
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
 * Report a screenshot detection.
 *
 * SECURITY:
 * - No participantId is supplied by the client.
 * - No sessionId is supplied in the event payload.
 * - No sessionSecret is supplied in the event payload.
 *
 * The backend must identify the participant from the
 * already-authenticated Socket.IO connection.
 */
export function reportScreenshot() {
  if (
    !socket ||
    !socket.connected
  ) {
    console.warn(
      'Cannot report screenshot: socket is unavailable'
    );

    return;
  }

  socket.emit(
    'screenshot:detected'
  );
}

/**
 * Typing events.
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
 * Room lock controls.
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
 * Accepting new members.
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
 * File sharing controls.
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
 * Maximum participants.
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
 * Extend room expiration.
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
 * Destroy the room.
 *
 * The backend must acknowledge the request with:
 *
 * {
 *   ok: true
 * }
 */
export function destroyRoom() {
  return new Promise(
    (resolve, reject) => {
      if (
        !socket ||
        !socket.connected
      ) {
        reject(
          new Error(
            'Socket is not connected'
          )
        );

        return;
      }

      let finished = false;
      let timeout = null;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }

        socket?.off(
          'disconnect',
          handleDisconnect
        );
      };

      const finishResolve = (
        response
      ) => {
        if (finished) {
          return;
        }

        finished = true;

        cleanup();

        resolve(response);
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

      const handleDisconnect = (
        reason
      ) => {
        finishReject(
          new Error(
            `Room destruction interrupted: ${
              reason ||
              'socket disconnected'
            }`
          )
        );
      };

      timeout = setTimeout(() => {
        finishReject(
          new Error(
            'Room destruction request timed out'
          )
        );
      }, 10000);

      socket.once(
        'disconnect',
        handleDisconnect
      );

      socket.emit(
        'room:destroy',
        (response) => {
          if (finished) {
            return;
          }

          if (response?.ok) {
            finishResolve(response);
            return;
          }

          finishReject(
            new Error(
              response?.message ||
                'Failed to destroy room'
            )
          );
        }
      );
    }
  );
}

/**
 * Remove a participant.
 *
 * SECURITY:
 * The client sends the PUBLIC participantId.
 *
 * It must NEVER send another user's private sessionId.
 */
export function removeParticipant(
  participantId
) {
  if (
    !socket ||
    !socket.connected ||
    !participantId
  ) {
    return;
  }

  socket.emit(
    'room:remove-participant',
    {
      participantId,
    }
  );
}

/**
 * Clear all messages.
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
 * Generic socket event listener.
 */
export function on(
  event,
  handler
) {
  if (!socket) {
    return () => {};
  }

  socket.on(
    event,
    handler
  );

  return () => {
    socket?.off(
      event,
      handler
    );
  };
}
import { io } from 'socket.io-client';

import { SOCKET_URL } from '../utils/constants';
import { encryptMessage } from '../crypto/encryption';
import { decryptMessage } from '../crypto/decryption';
import { generateClientMessageId } from '../utils/idGenerator';

let socket = null;
let roomKey = null;
let currentParams = null;

/**
 * Connect to a room
 */
export function connectSocket({ roomId, sessionId, key }) {
  if (
    socket &&
    currentParams?.roomId === roomId &&
    currentParams?.sessionId === sessionId
  ) {
    roomKey = key;

    /*
     * If the browser temporarily disconnected while the user
     * was using a file picker/viewer, reconnect the existing socket.
     */
    if (!socket.connected && !socket.active) {
      socket.connect();
    }

    return socket;
  }

  /*
   * Close any previous socket.
   */
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  roomKey = key;

  currentParams = {
    roomId,
    sessionId,
  };

  socket = io(SOCKET_URL, {
    auth: {
      roomId,
      sessionId,
    },

    transports: ['websocket'],

    /*
     * IMPORTANT:
     * Allow Socket.IO to reconnect after temporary mobile
     * background/network interruptions.
     */
    reconnection: true,

    /*
     * Keep retrying instead of permanently giving up.
     */
    reconnectionAttempts: Infinity,

    /*
     * Start retrying after 1 second.
     */
    reconnectionDelay: 1000,

    /*
     * Do not wait longer than 5 seconds between retries.
     */
    reconnectionDelayMax: 5000,

    /*
     * Small randomization prevents synchronized reconnects.
     */
    randomizationFactor: 0.5,

    autoConnect: true,

    /*
     * Do not force-close the socket just because the browser
     * temporarily changes lifecycle state.
     */
    closeOnBeforeunload: false,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    console.log('Room ID:', roomId);
    console.log('Session ID:', sessionId);
  });

  socket.on('connect_error', (error) => {
    console.error(
      'Socket connection error:',
      error?.message || error
    );

    /*
     * IMPORTANT:
     * Do NOT immediately redirect to Home here.
     *
     * A connect_error can be temporary on mobile when:
     * - opening the file picker
     * - opening a file viewer
     * - switching apps
     * - losing Wi-Fi/mobile data briefly
     *
     * Socket.IO will automatically retry.
     */
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

  return socket;
}

/**
 * Disconnect socket and clear session data
 */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();

    if (socket.connected || socket.active) {
      socket.disconnect();
    }
  }

  socket = null;
  roomKey = null;
  currentParams = null;
}

/**
 * Leave the current room
 */
export function leaveRoom() {
  disconnectSocket();
}

/**
 * Get active socket
 */
export function getSocket() {
  return socket;
}

/**
 * Reconnect the existing socket.
 *
 * This is useful when a mobile browser returns from:
 * - file picker
 * - file viewer
 * - another application
 * - temporary network interruption
 */
export function reconnectSocket() {
  if (!socket) {
    return;
  }

  if (socket.connected) {
    return;
  }

  console.log(
    '[socketService] Attempting to reconnect socket'
  );

  socket.connect();
}

/**
 * Wait until socket is connected
 */
function waitForConnection(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(
        new Error('Socket is not initialized')
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
      socket?.off('connect', handleConnect);
      socket?.off('connect_error', handleError);

      clearTimeout(timer);
    };

    const finishResolve = () => {
      if (finished) return;

      finished = true;

      cleanup();
      resolve();
    };

    const finishReject = (error) => {
      if (finished) return;

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
        'Connection failed while waiting:',
        error?.message || error
      );

      /*
       * Do not immediately fail because Socket.IO may still
       * be reconnecting.
       *
       * The timeout below is what ultimately stops the wait.
       */
    };

    timer = setTimeout(() => {
      finishReject(
        new Error(
          'Socket connection timed out'
        )
      );
    }, timeout);

    socket.once('connect', handleConnect);
    socket.on('connect_error', handleError);

    if (!socket.connected && !socket.active) {
      socket.connect();
    }
  });
}

/**
 * Send an encrypted message
 */
export async function sendMessage(
  plaintext,
  replyTo
) {
  try {
    if (!plaintext || !plaintext.trim()) {
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

    if (!socket || !socket.connected) {
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

    if (!ciphertext || !iv) {
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
 * Listen for new messages
 */
export function onMessage(callback) {
  if (!socket) {
    console.warn(
      'Cannot listen for messages: socket is missing'
    );

    return () => {};
  }

  const handler = async (payload) => {
    if (!payload || typeof payload !== 'object') {
      console.warn(
        'Invalid message payload:',
        payload
      );

      return;
    }

    if (payload.type === 'system') {
      callback(payload);
      return;
    }

    if (payload.type === 'file') {
      callback({
        ...payload,
        content: payload.content ?? null,
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
        typeof payload.ciphertext !== 'string' ||
        typeof payload.iv !== 'string' ||
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
            ciphertext: payload.ciphertext,
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
 * Delete a message
 */
export function deleteMessage(messageId) {
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
 * Typing events
 */
export function emitTypingStart() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('typing:start');
}

export function emitTypingStop() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('typing:stop');
}

/**
 * Room lock controls
 */
export function lockRoom() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('room:lock');
}

export function unlockRoom() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('room:unlock');
}

/**
 * Accepting new members
 */
export function setAcceptingNewMembers(
  accepting
) {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit(
    'room:set-accepting-members',
    {
      accepting: Boolean(accepting),
    }
  );
}

/**
 * File sharing controls
 */
export function setFileSharingEnabled(
  enabled
) {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit(
    'room:set-file-sharing',
    {
      enabled: Boolean(enabled),
    }
  );
}

/**
 * Maximum participants
 */
export function setMaxParticipants(
  maxParticipants
) {
  if (!socket || !socket.connected) {
    return;
  }

  const parsedLimit =
    Number(maxParticipants);

  if (
    !Number.isFinite(parsedLimit) ||
    parsedLimit < 1
  ) {
    return;
  }

  socket.emit(
    'room:set-max-participants',
    {
      maxParticipants: parsedLimit,
    }
  );
}

/**
 * Extend room expiration
 */
export function extendExpiration(
  additionalSeconds
) {
  if (!socket || !socket.connected) {
    return;
  }

  const seconds =
    Number(additionalSeconds);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return;
  }

  socket.emit(
    'room:extend-expiration',
    {
      additionalSeconds: seconds,
    }
  );
}

/**
 * Destroy the room
 */
export function destroyRoom() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('room:destroy');
}

/**
 * Remove a participant
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
 * Clear all messages
 */
export function clearMessages() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit('message:clear');
}

/**
 * Generic socket event listener
 */
export function on(event, handler) {
  if (!socket) {
    return () => {};
  }

  socket.on(event, handler);

  return () => {
    socket?.off(
      event,
      handler
    );
  };
}
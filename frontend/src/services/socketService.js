import { io } from 'socket.io-client';

import { SOCKET_URL } from '../utils/constants';
import { encryptMessage } from '../crypto/encryption';
import { decryptMessage } from '../crypto/decryption';
import { generateClientMessageId } from '../utils/idGenerator';


// ============================================================
// SOCKET STATE
// ============================================================

let socket = null;

let roomKey = null;

let currentParams = null;


// ============================================================
// CONNECT SOCKET
// ============================================================

export function connectSocket({
  roomId,
  sessionId,
  key,
}) {
  // ----------------------------------------------------------
  // If the existing socket belongs to the same room/session,
  // keep it.
  //
  // This is important for iOS.
  //
  // If iOS temporarily disconnects the socket while opening
  // a file viewer, we DO NOT create a new session.
  // ----------------------------------------------------------

  if (
    socket &&
    currentParams?.roomId === roomId &&
    currentParams?.sessionId === sessionId
  ) {
    roomKey = key;

    // --------------------------------------------------------
    // Socket.IO already knows how to reconnect.
    //
    // Only manually connect if it is not currently active.
    // --------------------------------------------------------

    if (
      !socket.connected &&
      !socket.active
    ) {
      console.log(
        '[socketService] Existing socket is inactive. Connecting...'
      );

      socket.connect();
    }

    return socket;
  }


  // ----------------------------------------------------------
  // A completely different room/session is being requested.
  // ----------------------------------------------------------

  if (socket) {
    console.log(
      '[socketService] Replacing old socket connection'
    );

    socket.removeAllListeners();
    socket.disconnect();
  }


  roomKey = key;

  currentParams = {
    roomId,
    sessionId,
  };


  // ==========================================================
  // CREATE SOCKET
  // ==========================================================

  socket = io(
    SOCKET_URL,
    {
      auth: {
        roomId,
        sessionId,
      },

      // Keep the existing transport behavior.
      transports: ['websocket'],

      // ------------------------------------------------------
      // Automatic reconnection is important for iOS.
      // ------------------------------------------------------

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 1000,

      reconnectionDelayMax: 5000,

      randomizationFactor: 0.5,

      autoConnect: true,

      // ------------------------------------------------------
      // Do not automatically close the socket just because
      // the browser thinks the page is being unloaded.
      // ------------------------------------------------------

      closeOnBeforeunload: false,
    }
  );


  // ==========================================================
  // CONNECT
  // ==========================================================

  socket.on(
    'connect',
    () => {
      console.log(
        '[socketService] Socket connected:',
        socket.id
      );

      console.log(
        '[socketService] Room ID:',
        roomId
      );

      console.log(
        '[socketService] Session ID:',
        sessionId
      );
    }
  );


  // ==========================================================
  // CONNECT ERROR
  // ==========================================================

  socket.on(
    'connect_error',
    (error) => {
      console.error(
        '[socketService] Socket connection error:',
        error?.message || error
      );
    }
  );


  // ==========================================================
  // DISCONNECT
  // ==========================================================

  socket.on(
    'disconnect',
    (reason) => {
      console.log(
        '[socketService] Socket disconnected:',
        reason
      );

      // ------------------------------------------------------
      // IMPORTANT:
      //
      // DO NOT clear:
      //
      // roomKey
      // currentParams
      // sessionId
      // roomId
      //
      // The socket is allowed to reconnect.
      //
      // This is especially important on iOS when the file
      // viewer temporarily takes control of the browser.
      // ------------------------------------------------------
    }
  );


  // ==========================================================
  // SERVER CONNECTION ERROR
  // ==========================================================

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


// ============================================================
// MANUAL RECONNECT
// ============================================================

export function reconnectSocket() {
  if (!socket) {
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


// ============================================================
// DISCONNECT SOCKET
//
// This function is ONLY used when the application is actually
// finished with the socket.
//
// It is NOT called simply because iOS temporarily disconnects.
// ============================================================

export function disconnectSocket() {
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


// ============================================================
// EXPLICIT LEAVE ROOM
//
// This is different from a temporary socket disconnect.
//
// The server receives room:leave and actually removes the
// user/room according to the existing room rules.
// ============================================================

export function leaveRoom() {
  if (socket?.connected) {
    console.log(
      '[socketService] Explicitly leaving room'
    );

    socket.emit('room:leave');
  }

  disconnectSocket();
}


// ============================================================
// GET SOCKET
// ============================================================

export function getSocket() {
  return socket;
}


// ============================================================
// WAIT FOR CONNECTION
// ============================================================

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
        console.error(
          '[socketService] Connection attempt failed:',
          error?.message || error
        );
      };


      timer = setTimeout(
        () => {
          finishReject(
            new Error(
              'Socket connection timed out'
            )
          );
        },
        timeout
      );


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


// ============================================================
// SEND MESSAGE
// ============================================================

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


    // --------------------------------------------------------
    // If iOS temporarily disconnected while the user was
    // viewing a file, wait for the socket to reconnect.
    // --------------------------------------------------------

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


// ============================================================
// RECEIVE MESSAGES
// ============================================================

export function onMessage(
  callback
) {
  if (!socket) {
    console.warn(
      '[socketService] Cannot listen for messages: socket is missing'
    );

    return () => {};
  }


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


    // --------------------------------------------------------
    // System message
    // --------------------------------------------------------

    if (
      payload.type === 'system'
    ) {
      callback(payload);

      return;
    }


    // --------------------------------------------------------
    // File message
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Encrypted text message
    // --------------------------------------------------------

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


// ============================================================
// DELETE MESSAGE
// ============================================================

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


// ============================================================
// TYPING
// ============================================================

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


// ============================================================
// ROOM LOCK
// ============================================================

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


// ============================================================
// ACCEPTING NEW MEMBERS
// ============================================================

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


// ============================================================
// FILE SHARING
// ============================================================

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


// ============================================================
// MAX PARTICIPANTS
// ============================================================

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


// ============================================================
// EXTEND EXPIRATION
// ============================================================

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
      additionalSeconds:
        seconds,
    }
  );
}


// ============================================================
// DESTROY ROOM
// ============================================================

export function destroyRoom() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  console.log(
    '[socketService] Explicitly destroying room'
  );

  socket.emit(
    'room:destroy'
  );
}


// ============================================================
// REMOVE PARTICIPANT
// ============================================================

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


// ============================================================
// CLEAR MESSAGES
// ============================================================

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


// ============================================================
// GENERIC EVENT LISTENER
// ============================================================

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
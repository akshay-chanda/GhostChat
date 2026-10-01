import {
  useEffect,
  useRef,
  useCallback,
} from 'react';

import { useNavigate } from 'react-router-dom';

import {
  connectSocket,
  disconnectSocket,
  reconnectSocket,
  sendMessage as sendEncryptedMessage,
} from '../services/socketService';

/**
 * Manages the Socket.IO connection lifecycle.
 *
 * Important behavior:
 *
 * PARTICIPANT:
 * - temporary disconnect -> reconnect
 * - page reload -> reconnect
 * - file viewer -> reconnect
 * - app switch -> reconnect
 *
 * HOST:
 * - server decides when the room has been destroyed
 * - room:expired -> Home
 */
export function useSocket({
  roomId,
  sessionId,
  roomKey,
}) {
  const navigate = useNavigate();

  const connectedRef =
    useRef(false);

  const redirectingRef =
    useRef(false);

  const socketRef =
    useRef(null);

  const redirectToHome =
    useCallback(() => {
      if (
        redirectingRef.current
      ) {
        return;
      }

      redirectingRef.current =
        true;

      connectedRef.current =
        false;

      disconnectSocket();

      navigate('/', {
        replace: true,
      });
    }, [navigate]);

  useEffect(() => {
    if (
      !roomId ||
      !sessionId ||
      !roomKey
    ) {
      return undefined;
    }

    redirectingRef.current =
      false;

    const socket =
      connectSocket({
        roomId,
        sessionId,
        key: roomKey,
      });

    socketRef.current =
      socket;

    // ------------------------------------------------
    // Connect
    // ------------------------------------------------

    const handleConnect =
      () => {
        console.log(
          '[useSocket] Connected:',
          socket.id
        );

        connectedRef.current =
          true;

        /*
         * Tell the backend that this participant's
         * current browser instance has connected.
         *
         * This is important after a page reload.
         *
         * The backend does NOT destroy the session on
         * disconnect, so the same session can resume.
         */
        if (
          !socket.data?.roomResumeSent
        ) {
          socket.emit(
            'room:resume'
          );

          /*
           * Socket objects are mutable, so use a small
           * local marker as well.
           */
          socket.data =
            socket.data || {};

          socket.data.roomResumeSent =
            true;
        }
      };

    // ------------------------------------------------
    // Connection error
    // ------------------------------------------------

    const handleConnectError =
      (error) => {
        console.error(
          '[useSocket] Connection error:',
          error?.message ||
            error
        );

        connectedRef.current =
          false;
      };

    // ------------------------------------------------
    // Room expired
    // ------------------------------------------------

    const handleRoomExpired =
      () => {
        console.log(
          '[useSocket] Room expired'
        );

        redirectToHome();
      };

    // ------------------------------------------------
    // Removed from room
    // ------------------------------------------------

    const handleRoomRemoved =
      () => {
        console.log(
          '[useSocket] Removed from room'
        );

        redirectToHome();
      };

    // ------------------------------------------------
    // Server connection error
    // ------------------------------------------------

    const handleConnectionError =
      (payload) => {
        console.error(
          '[useSocket] Server connection error:',
          payload?.message ||
            payload
        );

        const message =
          String(
            payload?.message ||
              ''
          ).toLowerCase();

        const invalidSession =
          message.includes(
            'invalid or expired session'
          ) ||
          message.includes(
            'missing room or session credentials'
          );

        /*
         * A permanently invalid session should leave
         * the room.
         *
         * Temporary disconnects do NOT come here.
         */
        if (
          invalidSession
        ) {
          redirectToHome();
        }
      };

    // ------------------------------------------------
    // Disconnect
    // ------------------------------------------------

    const handleDisconnect =
      (reason) => {
        console.log(
          '[useSocket] Disconnected:',
          reason
        );

        connectedRef.current =
          false;
      };

    // ------------------------------------------------
    // Visibility
    // ------------------------------------------------

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          console.log(
            '[useSocket] Page became visible'
          );

          reconnectSocket();
        }
      };

    // ------------------------------------------------
    // BFCache
    // ------------------------------------------------

    const handlePageShow =
      () => {
        console.log(
          '[useSocket] Page shown'
        );

        reconnectSocket();
      };

    // ------------------------------------------------
    // Window focus
    // ------------------------------------------------

    const handleFocus =
      () => {
        console.log(
          '[useSocket] Window focused'
        );

        reconnectSocket();
      };

    // ------------------------------------------------
    // Browser online
    // ------------------------------------------------

    const handleOnline =
      () => {
        console.log(
          '[useSocket] Browser online'
        );

        reconnectSocket();
      };

    // ------------------------------------------------
    // Attach listeners
    // ------------------------------------------------

    socket.on(
      'connect',
      handleConnect
    );

    socket.on(
      'connect_error',
      handleConnectError
    );

    socket.on(
      'room:expired',
      handleRoomExpired
    );

    socket.on(
      'room:removed',
      handleRoomRemoved
    );

    socket.on(
      'connection:error',
      handleConnectionError
    );

    socket.on(
      'disconnect',
      handleDisconnect
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    window.addEventListener(
      'pageshow',
      handlePageShow
    );

    window.addEventListener(
      'focus',
      handleFocus
    );

    window.addEventListener(
      'online',
      handleOnline
    );

    // ------------------------------------------------
    // Already connected
    // ------------------------------------------------

    if (socket.connected) {
      connectedRef.current =
        true;

      socket.emit(
        'room:resume'
      );
    }

    // ------------------------------------------------
    // Cleanup
    // ------------------------------------------------

    return () => {
      socket.off(
        'connect',
        handleConnect
      );

      socket.off(
        'connect_error',
        handleConnectError
      );

      socket.off(
        'room:expired',
        handleRoomExpired
      );

      socket.off(
        'room:removed',
        handleRoomRemoved
      );

      socket.off(
        'connection:error',
        handleConnectionError
      );

      socket.off(
        'disconnect',
        handleDisconnect
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );

      window.removeEventListener(
        'pageshow',
        handlePageShow
      );

      window.removeEventListener(
        'focus',
        handleFocus
      );

      window.removeEventListener(
        'online',
        handleOnline
      );

      connectedRef.current =
        false;

      /*
       * IMPORTANT:
       *
       * Do not manually send room:leave here.
       *
       * React cleanup can happen during:
       * - reload
       * - route changes
       * - mobile lifecycle changes
       *
       * The backend handles the socket disconnect.
       */
      if (
        socketRef.current ===
        socket
      ) {
        socketRef.current =
          null;

        disconnectSocket();
      }
    };
  }, [
    roomId,
    sessionId,
    roomKey,
    redirectToHome,
  ]);

  // --------------------------------------------------
  // Send message
  // --------------------------------------------------

  const send =
    useCallback(
      async (
        plaintext,
        replyTo
      ) => {
        return sendEncryptedMessage(
          plaintext,
          replyTo
        );
      },
      []
    );

  return {
    send,

    isConnected:
      connectedRef.current,
  };
}
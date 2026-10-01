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
 * Manages the Socket.IO connection lifecycle for a room.
 *
 * SECURITY:
 *
 * - sessionId is PRIVATE.
 * - sessionSecret is PRIVATE.
 * - participantId is PUBLIC and is handled by the backend.
 *
 * Socket.IO authentication requires BOTH:
 *
 *   sessionId
 *   sessionSecret
 *
 * A sessionId by itself must never be enough to authenticate.
 *
 * Mobile browsers can temporarily disconnect while:
 * - opening a file picker
 * - selecting a file
 * - opening a file viewer
 * - switching applications
 * - temporarily losing network connectivity
 *
 * A temporary socket failure must NOT close the room.
 */
export function useSocket({
  roomId,
  sessionId,
  sessionSecret,
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

      redirectingRef.current = true;

      connectedRef.current =
        false;

      disconnectSocket();

      navigate('/', {
        replace: true,
      });
    }, [navigate]);

  useEffect(() => {
    /*
     * All required private credentials must exist
     * before attempting a socket connection.
     */
    if (
      !roomId ||
      !sessionId ||
      !sessionSecret ||
      !roomKey
    ) {
      return undefined;
    }

    redirectingRef.current =
      false;

    /*
     * IMPORTANT:
     *
     * Pass BOTH private authentication credentials.
     *
     * The backend socketAuth middleware now requires:
     *
     *   roomId
     *   sessionId
     *   sessionSecret
     */
    const socket =
      connectSocket({
        roomId,
        sessionId,
        sessionSecret,
        key: roomKey,
      });

    socketRef.current =
      socket;

    const handleConnect =
      () => {
        console.log(
          '[useSocket] Connected:',
          socket.id
        );

        connectedRef.current =
          true;
      };

    /*
     * IMPORTANT:
     *
     * A connect_error does NOT mean the room is gone.
     *
     * Mobile browsers can generate temporary connection
     * failures while the user is using a file picker/viewer.
     *
     * Socket.IO will automatically retry.
     */
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

    /*
     * These are explicit server events saying that the
     * room is no longer available.
     */
    const handleRoomExpired =
      () => {
        console.log(
          '[useSocket] Room expired'
        );

        redirectToHome();
      };

    const handleRoomRemoved =
      () => {
        console.log(
          '[useSocket] Removed from room'
        );

        redirectToHome();
      };

    /*
     * Only explicit authentication/session rejection
     * should cause us to leave the room.
     *
     * Do NOT treat every temporary connection error
     * as a session failure.
     */
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

        if (
          invalidSession
        ) {
          redirectToHome();
        }
      };

    const handleDisconnect =
      (reason) => {
        console.log(
          '[useSocket] Disconnected:',
          reason
        );

        connectedRef.current =
          false;
      };

    /*
     * Android/iOS:
     *
     * The browser may become hidden while the user
     * selects or views a file.
     *
     * When it becomes visible again, explicitly ask
     * the existing socket to reconnect.
     */
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

    /*
     * iOS Safari can restore pages through BFCache.
     */
    const handlePageShow =
      () => {
        console.log(
          '[useSocket] Page shown'
        );

        reconnectSocket();
      };

    /*
     * Useful when returning from another application
     * or a native file picker.
     */
    const handleFocus =
      () => {
        console.log(
          '[useSocket] Window focused'
        );

        reconnectSocket();
      };

    /*
     * Network connection came back.
     */
    const handleOnline =
      () => {
        console.log(
          '[useSocket] Browser online'
        );

        reconnectSocket();
      };

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

    /*
     * The socket may already be connected by the time
     * our listeners are attached.
     */
    if (socket.connected) {
      connectedRef.current =
        true;
    }

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
       * Only disconnect the socket that belongs
       * to this hook.
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
    sessionSecret,
    roomKey,
    redirectToHome,
  ]);

  const send =
    useCallback(
      async (
        plaintext,
        replyTo
      ) => {
        /*
         * sendMessage() has its own wait-for-connection
         * logic, so don't reject merely because the socket
         * is currently reconnecting.
         */
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
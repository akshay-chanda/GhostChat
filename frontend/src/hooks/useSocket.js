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
 * Mobile browsers can temporarily suspend the page while the user:
 * - chooses a file
 * - opens a downloaded file
 * - switches applications
 * - changes network connection
 *
 * Temporary connection problems must NOT send the user Home.
 *
 * Only explicit server-side room/session rejection should do that.
 */
export function useSocket({
  roomId,
  sessionId,
  roomKey,
}) {
  const navigate = useNavigate();

  const connectedRef = useRef(false);
  const redirectingRef = useRef(false);
  const socketRef = useRef(null);

  const redirectToHome = useCallback(() => {
    if (redirectingRef.current) {
      return;
    }

    redirectingRef.current = true;
    connectedRef.current = false;

    disconnectSocket();

    navigate('/', {
      replace: true,
    });
  }, [navigate]);

  useEffect(() => {
    if (!roomId || !sessionId || !roomKey) {
      return undefined;
    }

    redirectingRef.current = false;

    const socket = connectSocket({
      roomId,
      sessionId,
      key: roomKey,
    });

    socketRef.current = socket;

    const handleConnect = () => {
      console.log(
        '[useSocket] Connected:',
        socket.id
      );

      connectedRef.current = true;
    };

    const handleConnectError = (error) => {
      console.error(
        '[useSocket] Connection error:',
        error?.message || error
      );

      /*
       * IMPORTANT:
       *
       * Do NOT redirect here.
       *
       * Socket.IO may be temporarily unable to connect because
       * the mobile browser was backgrounded by a file picker/viewer.
       *
       * Automatic reconnection will handle temporary failures.
       */
      connectedRef.current = false;
    };

    const handleRoomExpired = () => {
      console.log(
        '[useSocket] Room expired'
      );

      redirectToHome();
    };

    const handleRoomRemoved = () => {
      console.log(
        '[useSocket] Removed from room'
      );

      redirectToHome();
    };

    const handleConnectionError = (payload) => {
      console.error(
        '[useSocket] Server error:',
        payload?.message || payload
      );

      const message = String(
        payload?.message || ''
      ).toLowerCase();

      /*
       * Only explicit session/room rejection should cause
       * the user to leave the room.
       *
       * Generic connection failures are handled by Socket.IO.
       */
      const sessionOrRoomError =
        message.includes('session') ||
        message.includes('room') ||
        message.includes('expired') ||
        message.includes('destroyed') ||
        message.includes('not found') ||
        message.includes('unauthorized') ||
        message.includes('invalid');

      if (sessionOrRoomError) {
        redirectToHome();
      }
    };

    const handleDisconnect = (reason) => {
      console.log(
        '[useSocket] Disconnected:',
        reason
      );

      connectedRef.current = false;
    };

    /*
     * Mobile browser lifecycle:
     *
     * When returning from a file picker/viewer, explicitly ask
     * Socket.IO to reconnect if necessary.
     */
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible'
      ) {
        console.log(
          '[useSocket] Page became visible'
        );

        reconnectSocket();
      }
    };

    /*
     * iOS Safari can restore a page through BFCache.
     * pageshow is important in that situation.
     */
    const handlePageShow = () => {
      console.log(
        '[useSocket] pageshow'
      );

      reconnectSocket();
    };

    /*
     * Returning focus is another useful recovery signal,
     * especially after Android file pickers.
     */
    const handleFocus = () => {
      console.log(
        '[useSocket] Window focused'
      );

      reconnectSocket();
    };

    /*
     * Network became available again.
     */
    const handleOnline = () => {
      console.log(
        '[useSocket] Browser is online'
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
     * Handle an already-connected socket.
     */
    if (socket.connected) {
      connectedRef.current = true;
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

      connectedRef.current = false;

      /*
       * Disconnect only the socket owned by this hook.
       */
      if (
        socketRef.current === socket
      ) {
        socketRef.current = null;
        disconnectSocket();
      }
    };
  }, [
    roomId,
    sessionId,
    roomKey,
    redirectToHome,
  ]);

  const send = useCallback(
    (plaintext, replyTo) => {
      if (!connectedRef.current) {
        /*
         * Socket.IO may currently be reconnecting.
         * sendMessage() itself waits for connection, but this
         * guard would prevent it from getting there.
         */
        throw new Error(
          'Socket is reconnecting'
        );
      }

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
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
 * PARTICIPANT:
 * - normal connection -> normal room join
 * - temporary disconnect -> reconnect/resume
 * - page reload -> reconnect using the same session
 * - file viewer -> reconnect when returning
 * - app switch -> reconnect
 *
 * HOST:
 * - server decides when the room is destroyed
 * - room:expired -> Home
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

  /*
   * IMPORTANT:
   *
   * This is a FRONTEND lifecycle marker.
   *
   * false = this socket has never successfully connected
   * true  = this socket connected at least once
   *
   * We use this to distinguish:
   *
   * First connection
   *     ↓
   * normal initial room join
   *
   * Later connection
   *     ↓
   * room resume
   */
  const hasConnectedOnceRef = useRef(false);

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
    if (
      !roomId ||
      !sessionId ||
      !roomKey
    ) {
      return undefined;
    }

    redirectingRef.current = false;

    /*
     * Reset this for a completely new ChatRoomPage/socket lifecycle.
     */
    hasConnectedOnceRef.current = false;

    const socket = connectSocket({
      roomId,
      sessionId,
      key: roomKey,
    });

    socketRef.current = socket;

    // ------------------------------------------------
    // Connect
    // ------------------------------------------------

    const handleConnect = () => {
      console.log(
        '[useSocket] Connected:',
        socket.id
      );

      connectedRef.current = true;

      /*
       * FIRST successful connection:
       *
       * Do NOT send room:resume.
       *
       * This is the normal connection of the participant
       * who has just joined through /api/rooms/join.
       *
       * The backend's normal socket connection flow handles
       * the initial presence announcement.
       */
      if (!hasConnectedOnceRef.current) {
        hasConnectedOnceRef.current = true;

        console.log(
          '[useSocket] Initial socket connection'
        );

        return;
      }

      /*
       * SECOND/subsequent successful connection:
       *
       * The existing session is reconnecting.
       *
       * Tell the backend to restore the participant's
       * active socket presence.
       *
       * roomEvents.js must NOT create a chat "joined"
       * system message for this resume.
       */
      console.log(
        '[useSocket] Reconnecting existing session'
      );

      socket.emit('room:resume');
    };

    // ------------------------------------------------
    // Connection error
    // ------------------------------------------------

    const handleConnectError = (error) => {
      console.error(
        '[useSocket] Connection error:',
        error?.message || error
      );

      connectedRef.current = false;
    };

    // ------------------------------------------------
    // Room expired
    // ------------------------------------------------

    const handleRoomExpired = () => {
      console.log(
        '[useSocket] Room expired'
      );

      redirectToHome();
    };

    // ------------------------------------------------
    // Removed from room
    // ------------------------------------------------

    const handleRoomRemoved = () => {
      console.log(
        '[useSocket] Removed from room'
      );

      redirectToHome();
    };

    // ------------------------------------------------
    // Server connection error
    // ------------------------------------------------

    const handleConnectionError = (payload) => {
      console.error(
        '[useSocket] Server connection error:',
        payload?.message || payload
      );

      const message = String(
        payload?.message || ''
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
      if (invalidSession) {
        redirectToHome();
      }
    };

    // ------------------------------------------------
    // Disconnect
    // ------------------------------------------------

    const handleDisconnect = (reason) => {
      console.log(
        '[useSocket] Disconnected:',
        reason
      );

      connectedRef.current = false;
    };

    // ------------------------------------------------
    // Visibility
    // ------------------------------------------------

    const handleVisibilityChange = () => {
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
    // BFCache / pageshow
    // ------------------------------------------------

    const handlePageShow = () => {
      console.log(
        '[useSocket] Page shown'
      );

      reconnectSocket();
    };

    // ------------------------------------------------
    // Window focus
    // ------------------------------------------------

    const handleFocus = () => {
      console.log(
        '[useSocket] Window focused'
      );

      reconnectSocket();
    };

    // ------------------------------------------------
    // Browser online
    // ------------------------------------------------

    const handleOnline = () => {
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

    /*
     * connectSocket() normally returns a socket that is not
     * connected yet.
     *
     * If it is already connected, treat this as the initial
     * connection for this hook lifecycle.
     *
     * IMPORTANT:
     * Do NOT emit room:resume here.
     */
    if (socket.connected) {
      connectedRef.current = true;
      hasConnectedOnceRef.current = true;

      console.log(
        '[useSocket] Socket was already connected'
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

      connectedRef.current = false;

      /*
       * IMPORTANT:
       *
       * Do NOT manually emit room:leave here.
       *
       * React cleanup can happen during:
       *
       * - reload
       * - route changes
       * - mobile lifecycle changes
       * - file viewer
       * - app switching
       *
       * The backend handles the socket disconnect.
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

  // --------------------------------------------------
  // Send message
  // --------------------------------------------------

  const send = useCallback(
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
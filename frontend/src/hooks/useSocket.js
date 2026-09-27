
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  connectSocket,
  disconnectSocket,
  sendMessage as sendEncryptedMessage,
} from '../services/socketService';

/**
 * Manages the Socket.IO connection lifecycle for a room.
 *
 * Behavior:
 * - Host reload: server closes the room and users return Home.
 * - Normal user reload: user session is destroyed and returns Home.
 * - Invalid/expired session: automatically returns Home.
 */
export function useSocket({ roomId, sessionId, roomKey }) {
  const navigate = useNavigate();

  const connectedRef = useRef(false);
  const redirectingRef = useRef(false);
  const socketRef = useRef(null);

  const redirectToHome = useCallback(() => {
    if (redirectingRef.current) return;

    redirectingRef.current = true;
    connectedRef.current = false;

    disconnectSocket();

    navigate('/', { replace: true });
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
      console.log('[useSocket] Connected:', socket.id);
      connectedRef.current = true;
    };

    const handleConnectError = (error) => {
      console.error(
        '[useSocket] Connection error:',
        error?.message || error
      );

      connectedRef.current = false;

      // A rejected session or destroyed room requires returning Home.
      redirectToHome();
    };

    const handleRoomExpired = () => {
      console.log('[useSocket] Room expired');
      redirectToHome();
    };

    const handleRoomRemoved = () => {
      console.log('[useSocket] Removed from room');
      redirectToHome();
    };

    const handleConnectionError = (payload) => {
      console.error(
        '[useSocket] Server error:',
        payload?.message || payload
      );

      const message = String(payload?.message || '').toLowerCase();

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
      console.log('[useSocket] Disconnected:', reason);
      connectedRef.current = false;
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('room:expired', handleRoomExpired);
    socket.on('room:removed', handleRoomRemoved);
    socket.on('connection:error', handleConnectionError);
    socket.on('disconnect', handleDisconnect);

    // Handle an already-connected socket.
    if (socket.connected) {
      connectedRef.current = true;
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('room:expired', handleRoomExpired);
      socket.off('room:removed', handleRoomRemoved);
      socket.off('connection:error', handleConnectionError);
      socket.off('disconnect', handleDisconnect);

      connectedRef.current = false;

      // Disconnect only the socket owned by this hook.
      if (socketRef.current === socket) {
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
        throw new Error('Socket is not connected');
      }

      return sendEncryptedMessage(plaintext, replyTo);
    },
    []
  );

  return {
    send,
    isConnected: connectedRef.current,
  };
}
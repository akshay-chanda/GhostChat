import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socketService';
import { RECONNECT_MAX_ATTEMPTS } from '../utils/constants';

/**
 * Observes the socket's own reconnection lifecycle rather than
 * re-implementing backoff — socket.io already retries with
 * exponential backoff internally. This hook just surfaces that state
 * as something the UI can render (see ChatWindow's connection banner)
 * and gives up gracefully once socket.io exhausts its attempts,
 * rather than retrying forever silently.
 *
 * Message de-duplication after a reconnect (so an echoed message
 * doesn't render twice) is intentionally NOT handled here — that
 * requires matching against the message list's clientId, which this
 * hook doesn't own. RoomContext does that check when a message
 * arrives.
 *
 * `ready` should be a value that only becomes truthy once the socket
 * connection has actually been initiated (RoomContext passes its
 * roomKey) — getSocket() returns null until then, and this effect
 * needs a reason to run again once that's no longer true.
 */
export function useReconnect(ready) {
  const [connectionState, setConnectionState] = useState('reconnecting');
  const [attempts, setAttempts] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const socket = getSocket();
    if (!socket) return;

    const onDisconnect = () => setConnectionState('reconnecting');
    const onReconnectAttempt = (attemptNumber) => {
      setAttempts(attemptNumber);
      setConnectionState('reconnecting');
      if (attemptNumber >= RECONNECT_MAX_ATTEMPTS) setGaveUp(true);
    };
    const onReconnect = () => {
      setConnectionState('connected');
      setAttempts(0);
      setGaveUp(false);
    };
    const onReconnectFailed = () => {
      setConnectionState('disconnected');
      setGaveUp(true);
    };

    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);

    return () => {
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
    };
  }, [ready]);

  const retry = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    setGaveUp(false);
    setAttempts(0);
    socket.connect();
  }, []);

  return { connectionState, attempts, gaveUp, retry };
}
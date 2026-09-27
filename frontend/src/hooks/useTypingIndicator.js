import { useState, useEffect, useRef, useCallback } from 'react';
import { on, emitTypingStart, emitTypingStop } from '../services/socketService';

// If a "typing:stop" event is ever missed (dropped packet, tab
// closed mid-type), auto-expire the typer after this long so the
// indicator doesn't get stuck showing someone typing forever.
const STALE_TYPER_TIMEOUT_MS = 5000;

/**
 * Tracks who else in the room is currently typing (via typing:start /
 * typing:stop socket events) and provides thin wrappers for emitting
 * this client's own typing state. MessageInput owns the debounce
 * timing for *when* to call these — this hook only owns the resulting
 * remote-user list and the socket plumbing.
 *
 * `ready` gates (and re-triggers) the subscription the same way it
 * does in useReconnect — on() is a no-op against a socket that
 * doesn't exist yet, and the socket connects asynchronously.
 */
export function useTypingIndicator(ready) {
  const [typingUsers, setTypingUsers] = useState([]);
  const timeoutsRef = useRef(new Map());

  useEffect(() => {
    if (!ready) return;

    const clearStaleTimeout = (sessionId) => {
      const existing = timeoutsRef.current.get(sessionId);
      if (existing) clearTimeout(existing);
    };

    const offStart = on('typing:start', (user) => {
      setTypingUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));

      clearStaleTimeout(user.id);
      timeoutsRef.current.set(
        user.id,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
        }, STALE_TYPER_TIMEOUT_MS)
      );
    });

    const offStop = on('typing:stop', ({ id }) => {
      clearStaleTimeout(id);
      setTypingUsers((prev) => prev.filter((u) => u.id !== id));
    });

    return () => {
      offStart?.();
      offStop?.();
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
    };
  }, [ready]);

  const startTyping = useCallback(() => emitTypingStart(), []);
  const stopTyping = useCallback(() => emitTypingStop(), []);

  return { typingUsers, startTyping, stopTyping };
}
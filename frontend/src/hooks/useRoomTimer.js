import { useState, useEffect, useMemo } from 'react';
import { TIMER_WARNING_THRESHOLD_SECONDS } from '../utils/constants';

/**
 * Ticks once a second and derives remaining time from a server-issued
 * `expiresAt`, rather than counting down a local duration — protects
 * against clock drift and a backgrounded tab reporting a stale
 * countdown. RoomTimer.jsx currently implements this same logic
 * inline; this hook exists so other places (page title, the "expires
 * soon" toast) can share the same derivation without duplicating it
 * further.
 */
export function useRoomTimer(expiresAt, { onExpire } = {}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!expiresAt) return null;
    return Math.round((new Date(expiresAt).getTime() - now) / 1000);
  }, [expiresAt, now]);

  const expired = remainingSeconds !== null && remainingSeconds <= 0;
  const warning = !expired && remainingSeconds !== null && remainingSeconds <= TIMER_WARNING_THRESHOLD_SECONDS;

  useEffect(() => {
    if (expired) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  return { remainingSeconds, expired, warning };
}

import { useState, useEffect, useMemo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

const WARNING_THRESHOLD_SECONDS = 5 * 60;

function formatRemaining(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * RoomTimer
 *
 * Purely a display: it derives remaining time from `expiresAt` (a
 * server-issued timestamp) every second rather than counting down
 * from a duration prop, so a slow client clock or a paused tab can't
 * drift it from the server's actual expiration.
 */
export default function RoomTimer({ expiresAt, onExpire }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = useMemo(
    () => Math.round((new Date(expiresAt).getTime() - now) / 1000),
    [expiresAt, now]
  );

  const expired = remainingSeconds <= 0;
  const warning =
    !expired && remainingSeconds <= WARNING_THRESHOLD_SECONDS;

  useEffect(() => {
    if (expired) {
      onExpire?.();
    }
  }, [expired, onExpire]);

  if (expired) {
    return (
      <div
        className="
          flex min-w-0
          items-center gap-1.5
          text-[#EF4444]
          sm:gap-2
        "
      >
        <AlertTriangle
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        />

        <span className="truncate text-xs font-medium sm:text-sm">
          Room expired
        </span>
      </div>
    );
  }

  const color = warning ? '#F59E0B' : '#94A3B8';

  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
      <div
        className="flex min-w-0 items-center gap-1.5 sm:gap-2"
        style={{ color }}
      >
        <Clock
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        />

        <span
          className="
            min-w-0
            whitespace-nowrap
            text-xs
            font-mono
            tabular-nums
            sm:text-sm
          "
          aria-live="polite"
          aria-atomic="true"
        >
          {formatRemaining(remainingSeconds)}
        </span>
      </div>

      {warning && (
        <p className="whitespace-nowrap text-[10px] leading-4 text-[#F59E0B] sm:text-xs">
          Room expires soon
        </p>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';

/**
 * Watermark
 *
 * A faint, periodically-repositioned overlay tying a screenshot back
 * to the anonymous session that took it. This is deterrence, not
 * prevention — it does not claim to detect or block capture, since
 * no browser can reliably guarantee that. See SecurityModal / the
 * "Not covered" list for the honest framing.
 */
export default function Watermark({ anonymousName, roomId }) {
  const [position, setPosition] = useState({ top: '15%', left: '10%' });

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition({
        top: `${10 + Math.random() * 70}%`,
        left: `${5 + Math.random() * 70}%`,
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-40 select-none transition-all duration-[3000ms] ease-in-out"
      style={{ top: position.top, left: position.left }}
    >
      <div className="text-[11px] leading-tight text-white/[0.06] rotate-[-12deg] whitespace-nowrap">
        <p>{anonymousName}</p>
        <p>Room: {roomId}</p>
      </div>
    </div>
  );
}

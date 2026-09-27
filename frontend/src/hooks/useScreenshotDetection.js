import { useState, useEffect, useCallback } from 'react';

/**
 * Best-effort only. This can catch a few common signals on some
 * platforms — the PrintScreen key on Windows, a tab losing visibility
 * right as a capture shortcut fires — but it CANNOT reliably detect
 * macOS/iOS/Android capture, external cameras, or most OS-level
 * screen-recording tools. Treat a `false` result as "nothing
 * detected," never as "nothing happened." This is the deterrence
 * layer described in SecurityModal's "Not covered" list, not an
 * actual prevention mechanism.
 */
export function useScreenshotDetection() {
  const [detected, setDetected] = useState(false);

  const dismiss = useCallback(() => setDetected(false), []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // PrintScreen fires as its own key on most Windows browsers.
      if (e.key === 'PrintScreen') {
        setDetected(true);
      }
    };

    window.addEventListener('keyup', handleKeyDown);
    return () => window.removeEventListener('keyup', handleKeyDown);
  }, []);

  return { detected, dismiss };
}

import {
  useEffect,
  useCallback,
} from 'react';

/**
 * Best-effort screenshot detection.
 *
 * IMPORTANT:
 * A normal website cannot reliably detect every screenshot.
 *
 * This hook currently detects browser-visible signals such as:
 * - PrintScreen on supported browsers/platforms
 *
 * When a signal is detected, the supplied callback is called.
 *
 * The callback is responsible for notifying the room/backend.
 *
 * The person taking the screenshot is NOT shown
 * any local notification by this hook.
 */
export function useScreenshotDetection(
  onScreenshotDetected
) {
  const handleDetected = useCallback(() => {
    /*
     * Notify the caller so the screenshot event
     * can be sent to the room through Socket.IO.
     */
    if (
      typeof onScreenshotDetected ===
      'function'
    ) {
      onScreenshotDetected();
    }
  }, [onScreenshotDetected]);

  useEffect(() => {
    const handleKeyUp = (event) => {
      /*
       * PrintScreen is exposed as its own key
       * by most supported Windows browsers.
       */
      if (event.key === 'PrintScreen') {
        handleDetected();
      }
    };

    window.addEventListener(
      'keyup',
      handleKeyUp
    );

    return () => {
      window.removeEventListener(
        'keyup',
        handleKeyUp
      );
    };
  }, [handleDetected]);
}
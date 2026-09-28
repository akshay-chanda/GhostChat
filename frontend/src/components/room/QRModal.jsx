import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { X, Copy, Check } from 'lucide-react';

export default function QRModal({
  open,
  onClose,
  roomId,
  password,
}) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  /*
   * IMPORTANT:
   *
   * We NEVER use the backend Render shareLink here.
   *
   * The invitation URL is always generated from:
   *
   *   window.location.origin
   *   roomId
   *   password
   *
   * Example:
   *
   * https://ghost-chat-akshay.vercel.app/join?room=ABC123&password=hello123
   */
  const frontendShareLink = useMemo(() => {
    if (
      typeof window === 'undefined' ||
      !roomId
    ) {
      return '';
    }

    const params = new URLSearchParams();

    params.set(
      'room',
      roomId.trim().toUpperCase()
    );

    if (
      password !== undefined &&
      password !== null
    ) {
      params.set(
        'password',
        password
      );
    }

    return (
      `${window.location.origin}` +
      `/join?${params.toString()}`
    );
  }, [roomId, password]);

  /*
   * Generate QR code.
   *
   * The QR code contains the exact same URL
   * that is shown and copied below.
   */
  useEffect(() => {
    if (
      !open ||
      !canvasRef.current ||
      !frontendShareLink
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }

    QRCode.toCanvas(
      canvas,
      frontendShareLink,
      {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0B0F14',
          light: '#F8FAFC',
        },
      },
      (error) => {
        if (error) {
          console.error(
            'QR code generation failed:',
            error
          );
        }
      }
    );
  }, [open, frontendShareLink]);

  /*
   * Close modal with Escape key.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open, onClose]);

  /*
   * Reset copied state when modal closes.
   */
  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  /*
   * Copy the EXACT same URL used by the QR code.
   */
  const handleCopy = async () => {
    if (!frontendShareLink) {
      return;
    }

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(
          frontendShareLink
        );
      } else {
        const textarea =
          document.createElement('textarea');

        textarea.value = frontendShareLink;

        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const successful =
          document.execCommand('copy');

        document.body.removeChild(textarea);

        if (!successful) {
          throw new Error(
            'Clipboard copy failed'
          );
        }
      }

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error(
        'Copy link failed:',
        error
      );
    }
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Room invitation QR code"
      className="
        fixed
        inset-0
        z-[60]
        flex
        items-center
        justify-center
        overflow-y-auto
        overscroll-contain
        bg-black/60
        px-3
        py-4
        backdrop-blur-sm
        xs:px-4
        sm:py-6
      "
      onClick={onClose}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        className="
          flex
          w-full
          max-w-sm
          min-w-0
          max-h-[calc(100dvh-2rem)]
          flex-col
          overflow-y-auto
          overscroll-contain
          rounded-xl
          border border-white/10
          bg-[#111827]
          p-4
          shadow-2xl
          xs:rounded-2xl
          xs:p-5
          sm:p-6
        "
      >
        {/* Header */}

        <div
          className="
            flex
            shrink-0
            items-center
            justify-between
            gap-3
          "
        >
          <h2
            className="
              min-w-0
              truncate
              text-sm
              font-medium
              text-[#F8FAFC]
            "
          >
            Scan to join
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
              flex
              min-h-10
              min-w-10
              shrink-0
              items-center
              justify-center
              rounded-lg
              text-[#94A3B8]
              transition-colors
              hover:bg-white/5
              hover:text-[#F8FAFC]
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              touch-manipulation
            "
          >
            <X
              className="h-5 w-5"
              aria-hidden="true"
            />
          </button>
        </div>

        {/* QR Code */}

        <div
          className="
            mt-5
            flex
            justify-center
          "
        >
          <div
            className="
              rounded-xl
              bg-[#F8FAFC]
              p-3
            "
          >
            {frontendShareLink ? (
              <canvas
                ref={canvasRef}
                className="
                  block
                  h-auto
                  max-w-full
                "
                aria-label="QR code containing the room invitation link"
              />
            ) : (
              <div
                className="
                  flex
                  h-[220px]
                  w-[220px]
                  items-center
                  justify-center
                  text-center
                  text-xs
                  text-[#64748B]
                "
              >
                Unable to generate QR code.
              </div>
            )}
          </div>
        </div>

        {/* Description */}

        <p
          className="
            mt-4
            text-center
            text-xs
            leading-5
            text-[#94A3B8]
          "
        >
          Scan this QR code to automatically
          fill the Room ID and password.
        </p>

        {/* Room ID */}

        {roomId && (
          <div
            className="
              mt-4
              rounded-lg
              border border-white/5
              bg-[#0B0F14]
              px-3
              py-2.5
            "
          >
            <p className="text-xs text-[#94A3B8]">
              Room ID
            </p>

            <p
              className="
                mt-0.5
                truncate
                font-mono
                text-sm
                tracking-wide
                text-[#F8FAFC]
              "
            >
              {roomId}
            </p>
          </div>
        )}

        {/* Invitation link */}

        {frontendShareLink && (
          <div
            className="
              mt-3
              rounded-lg
              border border-white/5
              bg-[#0B0F14]
              px-3
              py-2.5
            "
          >
            <p className="text-xs text-[#94A3B8]">
              Invitation link
            </p>

            <p
              className="
                mt-1
                break-all
                text-[11px]
                leading-4
                text-[#64748B]
              "
            >
              {frontendShareLink}
            </p>
          </div>
        )}

        {/* Copy Link */}

        <button
          type="button"
          onClick={handleCopy}
          disabled={!frontendShareLink}
          className="
            mt-4
            flex
            min-h-11
            w-full
            shrink-0
            items-center
            justify-center
            gap-2
            rounded-lg
            border border-white/10
            px-4
            py-2.5
            text-sm
            text-[#F8FAFC]
            transition-colors
            hover:border-white/25
            hover:bg-white/5
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            disabled:cursor-not-allowed
            disabled:opacity-50
            touch-manipulation
          "
        >
          {copied ? (
            <Check
              className="
                h-4 w-4
                shrink-0
                text-[#22C55E]
              "
              aria-hidden="true"
            />
          ) : (
            <Copy
              className="
                h-4 w-4
                shrink-0
              "
              aria-hidden="true"
            />
          )}

          <span>
            {copied
              ? 'Copied'
              : 'Copy link'}
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
}
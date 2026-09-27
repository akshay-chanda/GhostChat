import { createPortal } from 'react-dom';
import { X, Check, Minus } from 'lucide-react';

const VERIFIED = [
  'Anonymous session — no account or personal info tied to you',
  'Encrypted connection between your browser and the server',
  'Temporary room — nothing persists past expiration',
  'Automatic expiration on the timer this room was created with',
  'No account required to join or participate',
  'Messages are not intentionally persisted to a database',
];

const NOT_COVERED = [
  'Anyone in the room can still screenshot or save what you send',
  'Your network provider can see that a connection occurred',
];

/**
 * SecurityModal
 *
 * Every line here has to be true and verifiable — this is the one
 * place in the app most likely to be screenshotted and held up as a
 * promise, so nothing gets rounded up to sound more reassuring than
 * the architecture actually supports.
 */
export default function SecurityModal({ open, onClose }) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Security information"
      className="
        fixed inset-0 z-[60]
        flex items-center justify-center
        overflow-y-auto
        overscroll-contain
        bg-black/60
        px-3 py-4
        backdrop-blur-sm
        xs:px-4
        sm:py-6
      "
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="
          flex w-full max-w-sm min-w-0
          max-h-[calc(100dvh-2rem)]
          flex-col
          overflow-y-auto
          overscroll-contain
          rounded-xl
          border border-white/10
          bg-[#111827]
          p-4
          shadow-2xl
          xs:rounded-2xl xs:p-5
          sm:p-6
        "
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-medium text-[#F8FAFC]">
            Security information
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
              flex min-h-10 min-w-10 shrink-0
              items-center justify-center
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
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Verified security properties */}
        <ul className="mt-4 space-y-3 xs:mt-5">
          {VERIFIED.map((item) => (
            <li
              key={item}
              className="flex min-w-0 gap-2.5"
            >
              <Check
                className="
                  mt-0.5 h-4 w-4
                  shrink-0
                  text-[#22C55E]
                "
                aria-hidden="true"
              />

              <span
                className="
                  min-w-0
                  break-words
                  text-sm
                  leading-relaxed
                  text-[#F8FAFC]/90
                "
              >
                {item}
              </span>
            </li>
          ))}
        </ul>

        {/* Not covered */}
        <p className="mt-5 text-xs font-medium text-[#94A3B8]">
          Not covered
        </p>

        <ul className="mt-2.5 space-y-2.5">
          {NOT_COVERED.map((item) => (
            <li
              key={item}
              className="flex min-w-0 gap-2.5"
            >
              <Minus
                className="
                  mt-0.5 h-4 w-4
                  shrink-0
                  text-[#94A3B8]
                "
                aria-hidden="true"
              />

              <span
                className="
                  min-w-0
                  break-words
                  text-sm
                  leading-relaxed
                  text-[#94A3B8]
                "
              >
                {item}
              </span>
            </li>
          ))}
        </ul>

        {/* Full security model */}
        <a
          href="/SECURITY.md"
          className="
            mt-5
            inline-flex min-h-10
            w-fit max-w-full
            items-center
            break-words
            py-2
            text-xs
            text-[#00D9FF]
            transition-colors
            hover:underline
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#00D9FF]
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[#111827]
            touch-manipulation
          "
        >
          Read the full security model
        </a>
      </div>
    </div>,
    document.body
  );
}
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    confirmButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel?.();
      }
    };

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby={
        description ? 'confirmation-description' : undefined
      }
      className="
        fixed inset-0 z-[100]
        flex items-center justify-center
        overflow-y-auto
        overscroll-contain
        bg-black/70
        px-3 py-4
        backdrop-blur-sm
        xs:px-4
        sm:py-6
      "
      onClick={() => {
        onCancel?.();
      }}
    >
      <div
        role="document"
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="
          w-full max-w-sm min-w-0
          max-h-[calc(100dvh-2rem)]
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
        {/* Title */}
        <h2
          id="confirmation-title"
          className="
            break-words
            text-base font-medium
            leading-6
            text-[#F8FAFC]
          "
        >
          {title}
        </h2>

        {/* Description */}
        {description && (
          <p
            id="confirmation-description"
            className="
              mt-2
              break-words
              text-sm
              leading-relaxed
              text-[#94A3B8]
            "
          >
            {description}
          </p>
        )}

        {/* Action buttons */}
        <div
          className="
            mt-5
            grid grid-cols-1
            gap-2.5
            xs:grid-cols-2
            sm:mt-6
          "
        >
          {/* Cancel */}
          <button
            type="button"
            onClick={() => {
              onCancel?.();
            }}
            className="
              flex min-h-11 w-full
              cursor-pointer
              items-center justify-center
              rounded-lg
              border border-white/10
              px-4 py-2.5
              text-sm
              text-[#F8FAFC]
              transition-colors
              hover:border-white/25
              hover:bg-white/5
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              touch-manipulation
            "
          >
            {cancelLabel}
          </button>

          {/* Confirm */}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => {
              onConfirm?.();
            }}
            className={`
              flex min-h-11 w-full
              cursor-pointer
              items-center justify-center
              rounded-lg
              px-4 py-2.5
              text-sm font-medium
              transition-colors
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              touch-manipulation
              ${
                danger
                  ? 'bg-[#EF4444] text-[#F8FAFC] hover:bg-[#F87171]'
                  : 'bg-[#00D9FF] text-[#0B0F14] hover:bg-[#5CE7FF]'
              }
            `}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
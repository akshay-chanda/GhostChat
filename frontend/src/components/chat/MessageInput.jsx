import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';

const MAX_MESSAGE_LENGTH = 5000;
const TYPING_STOP_DELAY_MS = 2000;

/**
 * MessageInput
 *
 * Owns typing-indicator debounce and the reply-preview strip. Actual
 * encryption happens one layer up (in the socket service, right
 * before the payload is sent) — this component only ever hands off
 * plaintext to its callback, never touches the wire directly.
 */
export default function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  onAttachFile,
  replyTo,
  onCancelReply,
  fileSharingEnabled = true,
  disabled = false,
  disabledReason,
}) {
  const [value, setValue] = useState('');
  const [sendError, setSendError] = useState(null);

  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // --------------------------------------------------
  // CLEAN UP TYPING TIMER
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // --------------------------------------------------
  // HANDLE CHANGE
  // --------------------------------------------------

  const handleChange = (e) => {
    const next = e.target.value;

    if (next.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    setValue(next);

    if (sendError) {
      setSendError(null);
    }

    if (next.trim()) {
      onTypingStart?.();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onTypingStop?.();
      }, TYPING_STOP_DELAY_MS);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      onTypingStop?.();
    }
  };

  // --------------------------------------------------
  // SEND
  // --------------------------------------------------

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();

    if (!trimmed || disabled) {
      return;
    }

    try {
      // Wait for the actual send before clearing the input.
      await onSend(trimmed);

      setValue('');
      setSendError(null);

      onCancelReply?.();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      onTypingStop?.();

      // Keep focus on the message field after sending.
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch {
      // Preserve the message so the user can retry.
      setSendError(
        'Message wasn’t sent. Check your connection and try again.'
      );
    }
  }, [
    value,
    disabled,
    onSend,
    onCancelReply,
    onTypingStop,
  ]);

  // --------------------------------------------------
  // KEYBOARD
  // --------------------------------------------------

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --------------------------------------------------
  // FILE
  // --------------------------------------------------

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      onAttachFile?.(file);
    }

    // Allow selecting the same file again later.
    e.target.value = '';
  };

  // --------------------------------------------------
  // VALUES
  // --------------------------------------------------

  const remaining =
    MAX_MESSAGE_LENGTH - value.length;

  const showCounter = remaining <= 500;

  return (
    <div
      className="
        shrink-0
        border-t
        border-white/5
        bg-[#0B0F14]
        px-2
        pt-2.5
        pb-[max(0.625rem,env(safe-area-inset-bottom))]
        xs:px-3
        sm:px-4
        sm:py-3
        md:px-6
      "
    >
      {/* ------------------------------------------------ */}
      {/* REPLY PREVIEW */}
      {/* ------------------------------------------------ */}

      {replyTo && (
        <div
          className="
            mb-2
            flex
            min-w-0
            items-center
            gap-2
            rounded-lg
            border
            border-white/5
            bg-[#111827]
            px-2.5
            py-2
            xs:px-3
          "
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <p
              className="
                truncate
                text-[11px]
                leading-tight
                text-[#00D9FF]
                xs:text-xs
              "
              title={`Replying to ${
                replyTo.senderName || 'Anonymous User'
              }`}
            >
              Replying to{' '}
              {replyTo.senderName ||
                'Anonymous User'}
            </p>

            <p
              className="
                mt-0.5
                truncate
                text-[11px]
                leading-relaxed
                text-[#94A3B8]
                xs:text-xs
              "
              title={
                replyTo.content ||
                replyTo.text ||
                ''
              }
            >
              {replyTo.content ||
                replyTo.text ||
                'Original message unavailable'}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancelReply}
            title="Cancel reply"
            aria-label="Cancel reply"
            className="
              flex
              min-h-8
              min-w-8
              shrink-0
              items-center
              justify-center
              rounded-md
              p-1.5
              text-[#94A3B8]
              transition-colors
              hover:text-[#F8FAFC]
              active:scale-95
              touch-manipulation
            "
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* DISABLED MESSAGE */}
      {/* ------------------------------------------------ */}

      {disabled && disabledReason && (
        <p
          className="
            mb-2
            px-1
            text-[11px]
            leading-relaxed
            text-[#F59E0B]
            xs:text-xs
          "
        >
          {disabledReason}
        </p>
      )}

      {/* ------------------------------------------------ */}
      {/* SEND ERROR */}
      {/* ------------------------------------------------ */}

      {sendError && !disabled && (
        <p
          role="alert"
          className="
            mb-2
            px-1
            text-[11px]
            leading-relaxed
            text-[#EF4444]
            xs:text-xs
          "
        >
          {sendError}
        </p>
      )}

      {/* ------------------------------------------------ */}
      {/* INPUT ROW */}
      {/* ------------------------------------------------ */}

      <div className="flex min-w-0 items-end gap-1.5 xs:gap-2">
        {/* ------------------------------------------------ */}
        {/* FILE ATTACHMENT */}
        {/* ------------------------------------------------ */}

        {fileSharingEnabled && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled}
            />

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={disabled}
              title="Attach file"
              aria-label="Attach file"
              className="
                flex
                min-h-10
                min-w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                p-2.5
                text-[#94A3B8]
                transition-colors
                hover:text-[#F8FAFC]
                active:scale-95
                disabled:cursor-not-allowed
                disabled:opacity-40
                touch-manipulation
                sm:min-h-9
                sm:min-w-9
              "
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </>
        )}

        {/* ------------------------------------------------ */}
        {/* TEXTAREA */}
        {/* ------------------------------------------------ */}

        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              disabled
                ? 'Messaging is disabled'
                : 'Type a message…'
            }
            aria-label="Message"
            className="
              block
              max-h-32
              min-h-10
              w-full
              resize-none
              overflow-y-auto
              rounded-xl
              border
              border-white/10
              bg-[#111827]
              px-3
              py-2.5
              pr-3
              text-base
              leading-relaxed
              text-[#F8FAFC]
              placeholder:text-[#94A3B8]/60
              focus:border-transparent
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-[#00D9FF]
              disabled:cursor-not-allowed
              disabled:opacity-50
              sm:text-sm
            "
          />

          {/* Character counter */}

          {showCounter && (
            <span
              aria-live="polite"
              className={`
                pointer-events-none
                absolute
                bottom-1
                right-2.5
                rounded
                bg-[#111827]/90
                px-1
                text-[10px]
                leading-tight
                sm:text-[11px]
                ${
                  remaining < 0
                    ? 'text-[#EF4444]'
                    : remaining < 100
                      ? 'text-[#F59E0B]'
                      : 'text-[#94A3B8]'
                }
              `}
            >
              {remaining}
            </span>
          )}
        </div>

        {/* ------------------------------------------------ */}
        {/* SEND */}
        {/* ------------------------------------------------ */}

        <button
          type="button"
          onClick={handleSend}
          disabled={
            disabled || !value.trim()
          }
          title="Send"
          aria-label="Send message"
          className="
            flex
            min-h-10
            min-w-10
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-[#00D9FF]
            p-2.5
            text-[#0B0F14]
            transition-colors
            hover:bg-[#5CE7FF]
            active:scale-95
            disabled:cursor-not-allowed
            disabled:opacity-40
            touch-manipulation
            sm:min-h-9
            sm:min-w-9
          "
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
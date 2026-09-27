import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';

import MessageBubble from './MessageBubble';
import SystemMessage from './SystemMessage';
import TypingIndicator from './TypingIndicator';

/**
 * ChatWindow
 *
 * Responsive message list for desktop, tablet and mobile.
 *
 * Responsibilities:
 * - Render decrypted messages
 * - Handle message scrolling
 * - Preserve scroll position while reading older messages
 * - Show connection status
 * - Render typing indicator
 * - Support delete/reply actions
 */
export default function ChatWindow({
  messages = [],
  currentSessionId,
  typingUsers = [],
  connectionState = 'connected',
  onDeleteMessage,
  onReplyTo,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  const [autoScroll, setAutoScroll] = useState(true);

  // --------------------------------------------------
  // Auto-scroll to newest message
  // --------------------------------------------------

  useEffect(() => {
    if (!autoScroll) return;

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    });
  }, [messages, typingUsers, autoScroll]);

  // --------------------------------------------------
  // Detect whether user is near the bottom
  // --------------------------------------------------

  const handleScroll = () => {
    const element = scrollRef.current;

    if (!element) return;

    const distanceFromBottom =
      element.scrollHeight -
      element.scrollTop -
      element.clientHeight;

    setAutoScroll(distanceFromBottom < 120);
  };

  // --------------------------------------------------
  // Jump to latest
  // --------------------------------------------------

  const handleJumpToLatest = () => {
    setAutoScroll(true);

    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    });
  };

  const isEmpty = messages.length === 0;

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div
      className="
        relative
        flex
        h-full
        min-h-0
        w-full
        min-w-0
        flex-col
        overflow-hidden
      "
    >
      {/* ------------------------------------------------ */}
      {/* Connection status */}
      {/* ------------------------------------------------ */}

      {connectionState !== 'connected' && (
        <div
          role="status"
          aria-live="polite"
          className="
            flex
            shrink-0
            items-center
            justify-center
            gap-1.5
            px-2.5
            py-2
            text-center
            text-[11px]
            leading-tight
            xs:gap-2
            xs:px-3
            sm:text-xs
            bg-[#F59E0B]/10
            text-[#F59E0B]
            border-b
            border-[#F59E0B]/10
          "
        >
          <WifiOff
            className="
              h-3.5
              w-3.5
              shrink-0
            "
            aria-hidden="true"
          />

          <span
            className="
              min-w-0
              max-w-full
              truncate
            "
          >
            {connectionState ===
            'reconnecting'
              ? 'Connection lost — reconnecting…'
              : 'Disconnected'}
          </span>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* Message scroll area */}
      {/* ------------------------------------------------ */}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="
          flex-1
          min-h-0
          min-w-0
          w-full
          overflow-x-hidden
          overflow-y-auto
          overscroll-contain
          scroll-smooth

          /* Same left/right message spacing */
          px-3
          py-2.5

          xs:px-3
          xs:py-3

          sm:px-5
          sm:py-4

          md:px-6

          lg:px-6

          pb-[max(0.75rem,env(safe-area-inset-bottom))]
        "
      >
        {isEmpty ? (
          /* ------------------------------------------------ */
          /* Empty state */
          /* ------------------------------------------------ */

          <div
            className="
              flex
              min-h-full
              flex-col
              items-center
              justify-center
              px-3
              text-center
              xs:px-4
            "
          >
            <p
              className="
                text-sm
                text-[#94A3B8]
              "
            >
              No messages yet.
            </p>

            <p
              className="
                mt-1
                max-w-[280px]
                text-xs
                leading-relaxed
                text-[#94A3B8]/70
                xs:max-w-xs
              "
            >
              Anything sent here disappears
              when the room expires.
            </p>
          </div>
        ) : (
          /* ------------------------------------------------ */
          /* Messages */
          /* ------------------------------------------------ */

          <div
            className="
              w-full
              min-w-0
              space-y-1
            "
          >
            {messages.map((msg, index) => {
              if (!msg) return null;

              // ------------------------------------------------
              // System message
              // ------------------------------------------------

              if (msg.type === 'system') {
                return (
                  <SystemMessage
                    key={
                      msg.id ||
                      `system-${index}-${msg.timestamp || ''}`
                    }
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                );
              }

              // ------------------------------------------------
              // Current user's message
              // ------------------------------------------------

              const isOwn =
                msg.senderId ===
                currentSessionId;

              // ------------------------------------------------
              // Previous message
              // ------------------------------------------------

              const previousMessage =
                messages[index - 1];

              // ------------------------------------------------
              // Group consecutive messages
              // from the same sender
              // ------------------------------------------------

              const grouped =
                Boolean(
                  previousMessage &&
                  previousMessage.type !==
                    'system' &&
                  previousMessage.senderId ===
                    msg.senderId
                );

              return (
                <MessageBubble
                  key={
                    msg.id ||
                    msg.clientId ||
                    `message-${index}`
                  }
                  message={msg}
                  isOwn={isOwn}
                  grouped={grouped}
                  onDelete={
                    isOwn
                      ? () =>
                          onDeleteMessage?.(
                            msg.id
                          )
                      : undefined
                  }
                  onReply={() =>
                    onReplyTo?.(msg)
                  }
                />
              );
            })}

            {/* ------------------------------------------------ */}
            {/* Typing indicator */}
            {/* ------------------------------------------------ */}

            {typingUsers.length > 0 && (
              <div
                className="
                  pt-1
                "
              >
                <TypingIndicator
                  users={typingUsers}
                />
              </div>
            )}

            {/* ------------------------------------------------ */}
            {/* Scroll anchor */}
            {/* ------------------------------------------------ */}

            <div
              ref={bottomRef}
              className="
                h-px
                w-full
              "
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------ */}
      {/* Jump to latest button */}
      {/* ------------------------------------------------ */}

      {!autoScroll && !isEmpty && (
        <button
          type="button"
          onClick={handleJumpToLatest}
          aria-label="Jump to latest message"
          className="
            absolute
            bottom-3
            right-2
            z-20
            flex
            min-h-9
            max-w-[calc(100%-1rem)]
            items-center
            justify-center
            rounded-full
            border
            border-white/10
            bg-[#111827]
            px-3
            text-[11px]
            font-medium
            leading-none
            text-[#F8FAFC]
            shadow-lg
            backdrop-blur-sm
            transition-all
            duration-150
            hover:border-white/25
            active:scale-95
            touch-manipulation
            xs:right-3
            xs:px-3.5
            sm:right-4
            sm:min-h-8
            sm:text-xs
            md:right-5
          "
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
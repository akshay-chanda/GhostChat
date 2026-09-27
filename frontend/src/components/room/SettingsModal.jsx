import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Lock,
  Unlock,
  UserX,
  Trash2,
  Power,
} from 'lucide-react';

import ConfirmationModal from './ConfirmationModal';

const DURATION_OPTIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
];

const PARTICIPANT_LIMITS = [2, 5, 10, 20, 50];

export default function SettingsModal({
  open,
  onClose,
  room,
  participants = [],
  onToggleLock,
  onToggleAcceptingNewMembers,
  onToggleFileSharing,
  onChangeExpiration,
  onChangeMaxParticipants,
  onRemoveParticipant,
  onClearMessages,
  onEndRoom,
}) {
  const [pendingAction, setPendingAction] = useState(null);

  if (!open) {
    return null;
  }

  const acceptingNewMembers =
    room?.acceptingNewMembers ?? true;

  const fileSharingEnabled =
    room?.fileSharingEnabled ?? true;

  const closeSettings = () => {
    setPendingAction(null);
    onClose?.();
  };

  const handleClearMessages = () => {
    onClearMessages?.();
    setPendingAction(null);
  };

  const handleEndRoom = () => {
    setPendingAction(null);
    onEndRoom?.();
  };

  return createPortal(
    <>
      {/* Settings overlay */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Room settings"
        className="
          fixed inset-0 z-[60]
          flex items-end justify-center
          bg-black/60
          backdrop-blur-sm
          overscroll-contain
          sm:items-center
        "
        onClick={closeSettings}
      >
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="
            flex w-full max-w-md min-w-0 flex-col
            max-h-[92dvh]
            overflow-hidden
            rounded-t-2xl
            border border-white/10
            bg-[#111827]
            shadow-2xl
            sm:max-h-[85vh]
            sm:rounded-2xl
          "
        >
          {/* Header */}
          <div
            className="
              flex shrink-0 items-center justify-between
              border-b border-white/5
              px-4 py-3.5
              xs:px-5
              sm:px-6 sm:py-4
            "
          >
            <h2 className="min-w-0 truncate text-base font-medium text-[#F8FAFC]">
              Room settings
            </h2>

            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close settings"
              className="
                flex min-h-10 min-w-10 shrink-0
                items-center justify-center
                rounded-lg
                text-[#94A3B8]
                transition-colors
                hover:bg-white/5 hover:text-[#F8FAFC]
                focus:outline-none
                focus-visible:ring-2
                focus-visible:ring-[#00D9FF]
                touch-manipulation
              "
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Scrollable content */}
          <div
            className="
              min-h-0 flex-1
              overflow-y-auto overflow-x-hidden
              overscroll-contain
              px-4 py-4
              xs:px-5 xs:py-5
              sm:px-6
              pb-[max(1rem,env(safe-area-inset-bottom))]
            "
          >
            <div className="space-y-6">
              {/* Access controls */}
              <section className="space-y-3">
                <p className="text-xs font-medium text-[#94A3B8]">
                  Access
                </p>

                {/* Lock room */}
                <button
                  type="button"
                  onClick={() => {
                    onToggleLock?.();
                  }}
                  className="
                    flex min-h-12 w-full min-w-0
                    cursor-pointer items-center justify-between
                    gap-3
                    rounded-lg
                    border border-white/5
                    bg-[#0B0F14]
                    px-3 py-3
                    text-left
                    transition-colors
                    hover:border-white/15
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#00D9FF]
                    touch-manipulation
                  "
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-sm text-[#F8FAFC]">
                    {room?.locked ? (
                      <Lock
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <Unlock
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}

                    <span className="min-w-0 truncate">
                      {room?.locked
                        ? 'Room is locked'
                        : 'Lock this room'}
                    </span>
                  </span>

                  <span className="shrink-0 text-xs text-[#94A3B8]">
                    {room?.locked ? 'Unlock' : 'Lock'}
                  </span>
                </button>

                {/* Accepting new members */}
                <button
                  type="button"
                  onClick={() => {
                    onToggleAcceptingNewMembers?.(
                      !acceptingNewMembers
                    );
                  }}
                  className="
                    flex min-h-12 w-full min-w-0
                    cursor-pointer items-center justify-between
                    gap-3
                    rounded-lg
                    border border-white/5
                    bg-[#0B0F14]
                    px-3 py-3
                    text-left
                    transition-colors
                    hover:border-white/15
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#00D9FF]
                    touch-manipulation
                  "
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-sm text-[#F8FAFC]">
                    <UserX
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />

                    <span className="min-w-0 truncate">
                      New participants
                    </span>
                  </span>

                  <span className="shrink-0 text-right text-xs text-[#94A3B8]">
                    {acceptingNewMembers
                      ? 'Allowed — disable'
                      : 'Disabled — allow'}
                  </span>
                </button>

                {/* Maximum participants */}
                <div>
                  <label
                    htmlFor="maxParticipants"
                    className="mb-1.5 block text-xs text-[#94A3B8]"
                  >
                    Max participants
                  </label>

                  <select
                    id="maxParticipants"
                    value={room?.maxParticipants ?? 10}
                    onChange={(event) => {
                      onChangeMaxParticipants?.(
                        Number(event.target.value)
                      );
                    }}
                    className="
                      min-h-11 w-full
                      cursor-pointer rounded-lg
                      border border-white/10
                      bg-[#0B0F14]
                      px-3.5 py-2.5
                      text-base text-[#F8FAFC]
                      focus:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-[#00D9FF]
                      sm:text-sm
                    "
                  >
                    {PARTICIPANT_LIMITS.map((limit) => (
                      <option key={limit} value={limit}>
                        {limit}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {/* Room lifecycle */}
              <section className="space-y-3">
                <p className="text-xs font-medium text-[#94A3B8]">
                  Lifecycle
                </p>

                {/* Expiration */}
                <div>
                  <label
                    htmlFor="expiration"
                    className="mb-1.5 block text-xs text-[#94A3B8]"
                  >
                    Extend expiration
                  </label>

                  <select
                    id="expiration"
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.target.value;

                      if (value) {
                        onChangeExpiration?.(Number(value));
                        event.target.value = '';
                      }
                    }}
                    className="
                      min-h-11 w-full
                      cursor-pointer rounded-lg
                      border border-white/10
                      bg-[#0B0F14]
                      px-3.5 py-2.5
                      text-base text-[#F8FAFC]
                      focus:outline-none
                      focus-visible:ring-2
                      focus-visible:ring-[#00D9FF]
                      sm:text-sm
                    "
                  >
                    <option value="" disabled>
                      Add time…
                    </option>

                    {DURATION_OPTIONS.map((duration) => (
                      <option
                        key={duration.value}
                        value={duration.value}
                      >
                        +{duration.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* File sharing */}
                <label
                  className="
                    flex min-h-11
                    cursor-pointer items-center gap-3
                    rounded-lg
                    text-sm text-[#F8FAFC]
                    touch-manipulation
                  "
                >
                  <input
                    type="checkbox"
                    checked={fileSharingEnabled}
                    onChange={(event) => {
                      onToggleFileSharing?.(
                        event.target.checked
                      );
                    }}
                    className="
                      h-5 w-5 shrink-0
                      cursor-pointer rounded
                      border-white/20
                      bg-[#0B0F14]
                      text-[#00D9FF]
                      focus:ring-2
                      focus:ring-[#00D9FF]
                      focus:ring-offset-0
                    "
                  />

                  <span>Allow file sharing</span>
                </label>
              </section>

              {/* Participants */}
              {participants.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-medium text-[#94A3B8]">
                    Participants ({participants.length})
                  </p>

                  <ul className="space-y-1.5">
                    {participants.map((participant) => (
                      <li
                        key={participant.id}
                        className="
                          flex min-h-11 min-w-0
                          items-center justify-between
                          gap-3
                          rounded-lg
                          px-3 py-2
                          transition-colors
                          hover:bg-white/[0.03]
                        "
                      >
                        <span className="min-w-0 truncate text-sm text-[#F8FAFC]">
                          {participant.anonymousName}
                        </span>

                        {!participant.isSelf && (
                          <button
                            type="button"
                            onClick={() => {
                              onRemoveParticipant?.(
                                participant.id
                              );
                            }}
                            className="
                              flex min-h-9 shrink-0
                              items-center justify-center
                              rounded-md px-2
                              text-xs text-[#EF4444]
                              transition-colors
                              hover:bg-[#EF4444]/10
                              hover:text-[#F87171]
                              focus:outline-none
                              focus-visible:ring-2
                              focus-visible:ring-[#EF4444]
                              touch-manipulation
                            "
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Danger zone */}
              <section className="space-y-2.5 border-t border-white/5 pt-3">
                <p className="text-xs font-medium text-[#94A3B8]">
                  Danger zone
                </p>

                {/* Clear messages */}
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction('clear');
                  }}
                  className="
                    flex min-h-11 w-full
                    cursor-pointer items-center gap-2.5
                    rounded-lg
                    border border-white/10
                    px-3.5 py-3
                    text-left text-sm text-[#F8FAFC]
                    transition-colors
                    hover:border-[#EF4444]/40
                    hover:text-[#EF4444]
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#00D9FF]
                    touch-manipulation
                  "
                >
                  <Trash2
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />

                  <span>Clear current messages</span>
                </button>

                {/* End room */}
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction('end');
                  }}
                  className="
                    flex min-h-11 w-full
                    cursor-pointer items-center gap-2.5
                    rounded-lg
                    border border-[#EF4444]/30
                    px-3.5 py-3
                    text-left text-sm text-[#EF4444]
                    transition-colors
                    hover:bg-[#EF4444]/10
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#EF4444]
                    touch-manipulation
                  "
                >
                  <Power
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />

                  <span>End room immediately</span>
                </button>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Clear messages confirmation */}
      <ConfirmationModal
        open={pendingAction === 'clear'}
        title="Clear current messages?"
        description="Everyone in the room will see the chat cleared. This can't be undone."
        confirmLabel="Clear messages"
        danger
        onConfirm={handleClearMessages}
        onCancel={() => {
          setPendingAction(null);
        }}
      />

      {/* End room confirmation */}
      <ConfirmationModal
        open={pendingAction === 'end'}
        title="End this room?"
        description="All temporary room data and active sessions will be removed. This action cannot be undone."
        confirmLabel="End room"
        danger
        onConfirm={handleEndRoom}
        onCancel={() => {
          setPendingAction(null);
        }}
      />
    </>,
    document.body
  );
}